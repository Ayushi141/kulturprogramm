from abc import ABC, abstractmethod
from dataclasses import dataclass

import hashlib
import io
import os
import re
import traceback
import httpx
import psycopg
from enum import StrEnum
from datetime import datetime, timedelta
from bs4 import BeautifulSoup
from pathlib import Path
from PIL import Image
from zoneinfo import ZoneInfo
from time import sleep


def debug(*args) -> None:
    """Debug output with a timestamp. flush=True: Docker buffers stdout otherwise."""
    print(datetime.now().strftime("%H:%M:%S"), *args, flush=True)


class Category(StrEnum):
    FILM = "film"
    THEATER = "theater"
    OPER = "oper"
    CONCERT = "konzert"


@dataclass(frozen=True)
class Venue:
    id: str
    name: str
    city: str


@dataclass
class Event(ABC):
    title: str
    venue: Venue
    category: Category
    starts_at: datetime
    ends_at: datetime | None
    url: str | None
    # Image source URL, when the program page already shows one. Otherwise
    # Source.scrape_image() looks for one on the event's own page.
    image_url: str | None = None
    # Key of the stored image (images.key), set by Source.add_images().
    image_key: str | None = None


@dataclass(frozen=True)
class StoredImage:
    key: str
    source_url: str
    content_type: str
    data: bytes


def connect() -> psycopg.Connection:
    password = Path(os.environ["PGPASSWORD_FILE"]).read_text().strip()
    return psycopg.connect(password=password)


def download_image(source_url: str) -> StoredImage:
    """
    Downloads an image and keeps its original bytes and resolution (no
    re-encoding, which causes compression artifacts). Pillow only checks
    that the bytes are an image and names the format.
    """
    debug("download image", source_url)
    response = httpx.get(source_url, follow_redirects=True, timeout=60)
    debug("  ->", response.status_code, len(response.content), "bytes")
    response.raise_for_status()
    data = response.content
    with Image.open(io.BytesIO(data)) as image:
        content_type = Image.MIME[image.format]
        image.verify()
    # The key is a hash of the content, so a changed image gets a new URL
    # and never collides with an old copy in a browser cache.
    key = hashlib.sha256(data).hexdigest()[:32]
    return StoredImage(key, source_url, content_type, data)


def slugify(text: str) -> str:
    text = text.lower()
    for umlaut, replacement in {"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"}.items():
        text = text.replace(umlaut, replacement)
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


class Source(ABC):
    def __init__(self, name, website):
        self.name = name
        self.website = website

    @abstractmethod
    def scrape(self) -> list[Event]: ...

    def scrape_image(self, event: Event) -> str | None:
        """
        URL of an image for the event, or None. The default reads the
        og:image of the event's page. Sources can override this.
        """
        if event.image_url:
            return event.image_url
        if not event.url:
            return None
        debug(f"{self.name}: image lookup on", event.url)
        response = httpx.get(event.url, follow_redirects=True, timeout=60)
        debug("  ->", response.status_code)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        tag = soup.select_one('meta[property="og:image"][content]')
        debug("  og:image:", tag["content"] if tag else None)
        return str(response.url.join(tag["content"])) if tag else None

    def add_images(self, events: list[Event]) -> list[StoredImage]:
        """
        Sets image_key on the events and returns the newly downloaded images.
        Never raises: a failing image is logged and the event keeps none.

        Images already stored for an event page are reused, so a daily run
        only fetches pages of new productions. Events with the same title
        share one lookup (Dhaus has one page per performance).
        """
        try:
            with connect() as conn:
                known = dict(
                    conn.execute(
                        """
                        SELECT DISTINCT ON (url) url, image_key FROM events
                        WHERE image_key IS NOT NULL AND url = ANY(%s)
                        """,
                        [list({e.url for e in events if e.url})],
                    ).fetchall()
                )
        except Exception as error:
            print(f"{self.name}: could not read stored images: {error!r}")
            known = {}
        debug(f"{self.name}: {len(known)} event pages already have an image")

        new: dict[str, StoredImage] = {}
        by_title: dict[str, str | None] = {}
        for event in events:
            if event.url in known:
                event.image_key = known[event.url]
                continue
            if event.title not in by_title:
                by_title[event.title] = None
                try:
                    source_url = self.scrape_image(event)
                    if source_url:
                        image = download_image(source_url)
                        new[image.key] = image
                        by_title[event.title] = image.key
                except Exception as error:
                    print(
                        f"{self.name}: no image for {event.title!r}: {error!r}",
                        flush=True,
                    )
            event.image_key = by_title[event.title]
        debug(
            f"{self.name}: {len(by_title)} image lookups,"
            f" {len(new)} downloaded,"
            f" {sum(1 for e in events if e.image_key)}/{len(events)} events with image"
        )
        return list(new.values())

    def save(self, events: list[Event], images: list[StoredImage]) -> None:
        venues = {e.venue for e in events}
        venue_rows = [(v.id, v.name, v.city) for v in venues]
        image_rows = [
            (i.key, i.source_url, i.content_type, i.data) for i in images
        ]
        event_rows = [
            (
                e.title,
                e.venue.id,
                e.category.value,
                e.starts_at,
                e.ends_at,
                e.url,
                e.image_key,
            )
            for e in events
        ]

        debug(
            f"{self.name}: saving {len(venue_rows)} venues,"
            f" {len(image_rows)} images, {len(event_rows)} events"
        )
        with connect() as conn:
            cursor = conn.cursor()
            cursor.executemany(
                """
                INSERT INTO venues (id, name, city)
                VALUES (%s, %s, %s)
                ON CONFLICT (id)
                DO UPDATE SET
                    name = EXCLUDED.name,
                    city = EXCLUDED.city
                """,
                venue_rows,
            )
            cursor.executemany(
                """
                INSERT INTO images (key, source_url, content_type, data)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (key) DO NOTHING
                """,
                image_rows,
            )
            cursor.executemany(
                """
                INSERT INTO events
                    (title, venue_id, category, starts_at, ends_at, url,
                     image_key)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (title, venue_id, starts_at)
                DO UPDATE SET
                    category = EXCLUDED.category,
                    ends_at = EXCLUDED.ends_at,
                    url = EXCLUDED.url,
                    -- a failed image lookup keeps the image found earlier
                    image_key = COALESCE(EXCLUDED.image_key, events.image_key),
                    updated_at = now()
                """,
                event_rows,
            )
        debug(f"{self.name}: saved")


class Filmkunstkinos(Source):
    # The program page names no city; all four cinemas are in Düsseldorf.
    CITY = "Düsseldorf"

    def scrape(self) -> list[Event]:
        debug(f"{self.name}: GET", self.website)
        response = httpx.get(self.website, follow_redirects=True, timeout=60)
        debug("  ->", response.status_code, len(response.text), "chars")
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        events = []
        articles = soup.select("article.col-group")
        debug(f"{self.name}: {len(articles)} article.col-group")
        for article in articles:
            link = article.select_one("h2.movie-small--title a")
            title = link.find(string=True, recursive=False).strip()
            url = str(response.url.join(link["href"]))

            name = article.select_one("span.meta-theater-logo").get_text(
                strip=True
            )
            venue = Venue(
                id=f"{self.name}-{slugify(name)}", name=name, city=self.CITY
            )

            # the film poster; optional, so a missing one is no parse error
            poster = article.select_one("figure img[src]")
            image_url = str(response.url.join(poster["src"])) if poster else None

            # e.g. "Biografie, Musik • GB, DE 1994 • 100 Min • Regie: ..."
            meta = article.select_one(".movie-small--meta p.meta").get_text()
            runtime = timedelta(
                minutes=int(re.search(r"(\d+)\s*Min", meta).group(1))
            )

            times = article.select("time[datetime]")
            debug(f"  {title!r} at {name}: {len(times)} screenings, {runtime}")
            for time_element in times:
                starts_at = datetime.fromisoformat(
                    time_element["datetime"]
                ).replace(tzinfo=ZoneInfo("Europe/Berlin"))
                events.append(
                    Event(
                        title=title,
                        venue=venue,
                        category=Category.FILM,
                        starts_at=starts_at,
                        ends_at=starts_at + runtime,
                        url=url,
                        image_url=image_url,
                    )
                )

        return events


class Dhaus(Source):
    def scrape(self) -> list[Event]:
        debug(f"{self.name}: GET", self.website)
        response = httpx.get(self.website, follow_redirects=True, timeout=60)
        debug("  ->", response.status_code, len(response.text), "chars")
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        berlin = ZoneInfo("Europe/Berlin")

        events = []
        performances = soup.select("div.performance")
        debug(f"{self.name}: {len(performances)} div.performance")
        for performance in performances:
            link = performance.select_one(".performance__title a")
            title = (
                link.select_one("[itemprop=name]")
                .get_text(strip=True)
                .replace("\xad", "")
            )
            url = str(response.url.join(link["href"]))

            name = (
                performance.select_one(".performance__location")
                .get_text(strip=True)
                .removeprefix("📍")
                .strip()
            )
            address = performance.select_one(
                "[itemprop=location] [itemprop=address]"
            ).get_text(strip=True)
            city = re.fullmatch(r".*\b\d{5}\s+(.+)", address).group(1)
            venue = Venue(
                id=f"{self.name}-{slugify(name)}", name=name, city=city
            )

            starts_at = datetime.fromisoformat(
                performance.select_one("meta[itemprop=startDate]")["content"]
            ).replace(tzinfo=berlin)

            # The end time is only given as text, e.g. "19:00 – 20:15".
            # Some performances list only the start time.
            time_text = performance.select_one(
                ".performance__time"
            ).get_text(strip=True)
            ends_at = None
            if "–" in time_text:
                end_clock = datetime.strptime(
                    time_text.split("–")[1].strip(), "%H:%M"
                ).time()
                ends_at = datetime.combine(
                    starts_at.date(), end_clock, tzinfo=berlin
                )
                if ends_at <= starts_at:
                    ends_at += timedelta(days=1)

            debug(f"  {title!r} at {venue.id}: {starts_at} - {ends_at}")
            events.append(
                Event(
                    title=title,
                    venue=venue,
                    category=Category.THEATER,
                    starts_at=starts_at,
                    ends_at=ends_at,
                    url=url,
                )
            )
        return events


@dataclass(frozen=True)
class Production:
    """Details from a production page that the calendar does not show."""

    venue: Venue
    length: timedelta | None
    image_url: str | None


class SchauspielKoeln(Source):
    EXCLUDED_LABELS = {"Führung", "Workshop"}
    # Used when a production page names no single stage or cannot be loaded.
    VENUE = Venue(
        id="schauspiel-koeln-schauspiel-koeln",
        name="Schauspiel Köln",
        city="Köln",
    )

    def production(self, url: str) -> Production:
        """
        Stage, length and image from a production page. Missing details fall
        back to the general venue, no length and no image.
        """
        debug(f"{self.name}: production page", url)
        response = httpx.get(url, follow_redirects=True, timeout=60)
        debug("  ->", response.status_code)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        # e.g. "Kleines Haus"; a page listing several stages
        # ("Erfrischungsraum & Kleines Haus") does not say which one is meant
        stage_tag = soup.select_one(".field--name-stages")
        stage = " ".join(stage_tag.get_text(" ").split()) if stage_tag else ""
        if stage and "&" not in stage:
            venue = Venue(
                id=f"{self.name}-{slugify(stage)}",
                name=stage,
                city=self.VENUE.city,
            )
        else:
            venue = self.VENUE

        # e.g. "1 h 45 min", "5 h"
        length = None
        length_tag = soup.select_one(".field--name-duration")
        if length_tag:
            text = length_tag.get_text(" ", strip=True)
            match = re.fullmatch(r"(?:(\d+)\s*h)?\s*(?:(\d+)\s*min)?", text)
            if match and any(match.groups()):
                length = timedelta(
                    hours=int(match[1] or 0), minutes=int(match[2] or 0)
                )
            else:
                print(f"{self.name}: unknown length {text!r} on {url}")

        image_tag = soup.select_one('meta[property="og:image"][content]')
        image_url = (
            str(response.url.join(image_tag["content"])) if image_tag else None
        )
        debug(f"  stage {stage!r} -> {venue.id}, length {length}, image {image_url}")
        return Production(venue, length, image_url)

    def scrape(self) -> list[Event]:
        debug(f"{self.name}: GET", self.website)
        response = httpx.get(self.website, follow_redirects=True, timeout=60)
        debug("  ->", response.status_code, len(response.text), "chars")
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        events = []
        productions: dict[str, Production] = {}  # one fetch per production page
        activities = soup.select("li.s-bko-activity")
        debug(f"{self.name}: {len(activities)} li.s-bko-activity")
        for activity in activities:
            label_tag = activity.select_one(".field--name-category")
            label = label_tag.get_text(strip=True) if label_tag else ""
            if label in self.EXCLUDED_LABELS:
                debug(f"  skip label {label!r}")
                continue

            link = activity.select_one(".field--name-production a")
            title = link.get_text(strip=True)
            url = str(response.url.join(link["href"]))

            time_tag = activity.select_one("time.s-bko-activity__datetime")
            clock = list(time_tag.stripped_strings)[-1]
            starts_at = datetime.strptime(
                f"{time_tag['datetime']} {clock}", "%Y-%m-%d %H.%M Uhr"
            ).replace(tzinfo=ZoneInfo("Europe/Berlin"))

            if url not in productions:
                try:
                    productions[url] = self.production(url)
                except Exception as error:
                    # the calendar entry is still valid without the details
                    print(f"{self.name}: no details for {title!r}: {error!r}")
                    productions[url] = Production(self.VENUE, None, None)
            details = productions[url]
            debug(f"  {title!r} [{label}] {starts_at}")

            category = (
                Category.CONCERT if label == "Konzert" else Category.THEATER
            )
            events.append(
                Event(
                    title=title,
                    venue=details.venue,
                    category=category,
                    starts_at=starts_at,
                    ends_at=(
                        starts_at + details.length if details.length else None
                    ),
                    url=url,
                    image_url=details.image_url,
                )
            )

        return events


sources = [
    Filmkunstkinos("filmkunstkinos", "https://filmkunstkinos.de/programm/"),
    Dhaus("dhaus", "https://www.dhaus.de/programm/spielplan/schauspiel"),
    SchauspielKoeln(
        "schauspiel-koeln", "https://www.schauspiel.koeln/kalender"
    ),
]

if __name__ == "__main__":
    while True:
        for source in sources:
            debug(f"=== {source.name} ===")
            try:
                events = source.scrape()
                debug(f"{source.name}: scraped {len(events)} events")
                images = source.add_images(events)
                source.save(events, images)
            except Exception:
                print(f"Failed to scrape {source.name}:", flush=True)
                traceback.print_exc()
                continue
            print(
                f"Scraped {len(events)} events from {source.name}"
                f" ({len(images)} new images)",
                flush=True,
            )
        debug("run done, sleeping for 24 h")
        sleep(60 * 60 * 24)
