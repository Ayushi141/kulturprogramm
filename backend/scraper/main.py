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


def absolute_url(base: httpx.URL, href: str) -> str:
    url = base.join(href)
    if url.scheme == "http":
        url = url.copy_with(scheme="https")
    return str(url)


NON_PERFORMANCE = re.compile(
    r"\b(?:\w*workshops?|atelier|\w*führ\w*|rundg\w*|tour\w*|"
    r"schulvorstell\w*|kitavorstell\w*|"
    r"öffentliche\s+proben?|probenbesuche?|open\s+classes?|"
    r"mitmach\w*|trainings?|kurs\w*|labs?|"
    r"kinderoper|jugendoper|kinderkonzert|"
    r"kinder\s*(?:&|und)?\s*jugend|"
    r"lesung\w*|lesart|talks?|vortr[aä]g\w*|gespr[aä]ch\w*|"
    r"soiree|salon\w*|familienvorstell\w*|für\s+kinder|"
    r"für\s+schulen|für\s+kitas|grundschulklassen|"
    r"konzert\w*|jazz|\w*festival\w*|"
    r"central\s+alive|blaue\s+stunde|lieder\s+singen|"
    r"silvester|weihnachts-bar)\b",
    re.IGNORECASE,
)


def is_youth_production(text: str) -> bool:
    if re.search(
        r"\b(?:kinderoper|kindergarten|kita|schulvorstellung)\b",
        text,
        re.IGNORECASE,
    ):
        return True
    age = re.search(
        r"für alle ab\s+(\d+)\s+Jahren", text, re.IGNORECASE
    )
    return bool(age and int(age[1]) < 14)


def is_non_performance(*labels: str) -> bool:
    return bool(NON_PERFORMANCE.search(" ".join(labels)))


def end_time_from_text(starts_at: datetime, text: str) -> datetime | None:
    match = re.search(
        r"\b\d{1,2}:\d{2}\s*(?:-|–|—|\bbis\b)\s*(\d{1,2}:\d{2})\b",
        text,
    )
    if not match:
        return None

    end_clock = datetime.strptime(match[1], "%H:%M").time()
    ends_at = datetime.combine(
        starts_at.date(), end_clock, tzinfo=starts_at.tzinfo
    )
    return ends_at + timedelta(days=1) if ends_at <= starts_at else ends_at


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


class OperAmRhein(Source):
    VENUE = Venue(
        id="oper-am-rhein-opernhaus-duesseldorf",
        name="Opernhaus Düsseldorf",
        city="Düsseldorf",
    )

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
            location_tag = performance.select_one(".performance__location")
            location = location_tag.get_text(strip=True)
            if location != self.VENUE.name:
                continue

            category_tag = performance.select_one(".performance__category")
            category = (
                category_tag.get_text(" ", strip=True) if category_tag else ""
            )
            if not re.search(r"oper|ballett", category, re.IGNORECASE):
                continue

            link = performance.select_one("a.performance__link")
            title_tag = link.select_one(".performance__title [itemprop=name]")
            title = title_tag.get_text(" ", strip=True).replace("\xad", "")
            url = str(response.url.join(link["href"]))

            starts_at = datetime.fromisoformat(
                performance.select_one('meta[itemprop="startDate"]')["content"]
            )
            if starts_at.tzinfo is None:
                starts_at = starts_at.replace(tzinfo=berlin)
            else:
                starts_at = starts_at.astimezone(berlin)

            time_tag = performance.select_one(
                ".performance__col--date .performance__time"
            )
            time_text = time_tag.get_text(" ", strip=True)
            end_match = re.search(
                r"\b\d{1,2}:\d{2}\s*[-–]\s*(\d{1,2}:\d{2})\b",
                time_text,
            )
            ends_at = None
            if end_match:
                end_clock = datetime.strptime(end_match[1], "%H:%M").time()
                ends_at = datetime.combine(
                    starts_at.date(), end_clock, tzinfo=berlin
                )
                if ends_at <= starts_at:
                    ends_at += timedelta(days=1)

            debug(f"  {title!r} at {self.VENUE.id}: {starts_at} - {ends_at}")
            events.append(
                Event(
                    title=title,
                    venue=self.VENUE,
                    category=Category.OPER,
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


class TheaterKrefeldMoenchengladbach(Source):
    INCLUDED_BRANCHES = {"Ballett", "Musiktheater", "Schauspiel"}
    EXCLUDED_BRANCHES = {"Extras", "Kinder & Jugend"}

    def scrape(self) -> list[Event]:
        debug(f"{self.name}: GET", self.website)
        response = httpx.get(self.website, follow_redirects=True, timeout=60)
        debug("  ->", response.status_code, len(response.text), "chars")
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        berlin = ZoneInfo("Europe/Berlin")

        events = []
        performances = soup.select("article.performance")
        debug(f"{self.name}: {len(performances)} article.performance")
        for performance in performances:
            branch_tags = performance.select(".performance__branch-link")
            branches = {
                tag.get_text(" ", strip=True) for tag in branch_tags
            }
            if (
                not branches.intersection(self.INCLUDED_BRANCHES)
                or branches.intersection(self.EXCLUDED_BRANCHES)
            ):
                continue

            title_tag = performance.select_one(".performance__title")
            title = title_tag.get_text(" ", strip=True).replace("\xad", "")
            meta = performance.select_one(".performance__meta")
            subtitle = performance.select_one(".performance__subtitle")
            if is_non_performance(
                title,
                meta.get_text(" ", strip=True) if meta else "",
                subtitle.get_text(" ", strip=True) if subtitle else "",
            ):
                continue

            link = performance.select_one(".performance__title a")
            if not link:
                raise ValueError(
                    f"{self.name}: qualifying event has no URL: {title!r}"
                )
            date_tag = performance.select_one("time.date[datetime]")
            starts_at = datetime.fromisoformat(date_tag["datetime"])
            if starts_at.tzinfo is None:
                starts_at = starts_at.replace(tzinfo=berlin)
            else:
                starts_at = starts_at.astimezone(berlin)

            location = performance.select_one(
                ".performance__location"
            ).get_text(" ", strip=True)
            city = (
                "Mönchengladbach"
                if re.search(r"\bMG\b|Mönchengladbach", location)
                else "Krefeld"
            )
            venue = Venue(
                id=f"{self.name}-{slugify(location)}",
                name=location,
                city=city,
            )
            category = (
                Category.OPER
                if branches.intersection({"Ballett", "Musiktheater"})
                else Category.THEATER
            )
            url = absolute_url(response.url, link["href"])
            events.append(
                Event(
                    title=title,
                    venue=venue,
                    category=category,
                    starts_at=starts_at,
                    ends_at=None,
                    url=url,
                )
            )
        return events


class OperWuppertal(Source):
    API = "https://api.wb.c4c.it/api/performances"
    VENUE = Venue(
        id="oper-wuppertal-opernhaus",
        name="Opernhaus Wuppertal",
        city="Wuppertal",
    )

    def scrape(self) -> list[Event]:
        berlin = ZoneInfo("Europe/Berlin")
        after = datetime.now(berlin).isoformat(timespec="seconds")
        params = {
            "startDateTime[after]": after,
            "itemsPerPage": 100,
            "page": 1,
        }
        debug(f"{self.name}: GET", self.API, "page 1")
        response = httpx.get(
            self.API,
            params=params,
            headers={"Accept": "application/ld+json"},
            timeout=60,
        )
        debug("  ->", response.status_code, len(response.text), "chars")
        response.raise_for_status()

        events = []
        performances = response.json()["hydra:member"]
        for performance in performances:
            production = performance["production"]
            branch = production["branch"]["title"]
            location = performance.get("location")
            if branch != "Oper" or not location:
                continue
            if location["title"] != "Opernhaus":
                continue

            title = production["title"].replace("\xad", "").strip()
            event_label = performance.get("event") or {}
            description = BeautifulSoup(
                production.get("shortDescription") or "",
                "html.parser",
            ).get_text(" ", strip=True)
            if is_non_performance(title, event_label.get("title", "")):
                continue
            if is_youth_production(description):
                continue

            starts_at = datetime.fromisoformat(
                performance["startDateTime"]
            )
            if starts_at.tzinfo is None:
                starts_at = starts_at.replace(tzinfo=berlin)
            else:
                starts_at = starts_at.astimezone(berlin)
            end_value = performance.get("endDateTime")
            ends_at = datetime.fromisoformat(end_value) if end_value else None
            if ends_at:
                if ends_at.tzinfo is None:
                    ends_at = ends_at.replace(tzinfo=berlin)
                else:
                    ends_at = ends_at.astimezone(berlin)
                if ends_at <= starts_at:
                    ends_at = None

            events.append(
                Event(
                    title=title,
                    venue=self.VENUE,
                    category=Category.OPER,
                    starts_at=starts_at,
                    ends_at=ends_at,
                    url=absolute_url(response.url, performance["url"]),
                )
            )

        debug(f"{self.name}: {len(events)} qualifying performances")
        return events


class TheaterEssen(Source):
    CATEGORIES = {
        "Aalto Ballett Essen": Category.OPER,
        "Aalto Musiktheater": Category.OPER,
        "Schauspiel Essen": Category.THEATER,
    }

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
            category_tag = performance.select_one(".performance__category")
            category_name = (
                category_tag.get_text(" ", strip=True) if category_tag else ""
            )
            category = self.CATEGORIES.get(category_name)
            if not category:
                continue

            title_tag = performance.select_one(
                ".performance__title [itemprop=name]"
            )
            title = title_tag.get_text(" ", strip=True).replace("\xad", "")
            subtitle = performance.select_one(".performance__subtitle")
            ticket_info = performance.select_one(
                ".performance__ticketbutton"
            )
            if is_non_performance(
                title,
                category_name,
                subtitle.get_text(" ", strip=True) if subtitle else "",
                ticket_info.get_text(" ", strip=True) if ticket_info else "",
            ):
                continue

            link = performance.select_one(".performance__title a")
            if not link:
                raise ValueError(
                    f"{self.name}: qualifying event has no URL: {title!r}"
                )
            starts_at = datetime.fromisoformat(
                performance.select_one(
                    'meta[itemprop="startDate"]'
                )["content"]
            )
            if starts_at.tzinfo is None:
                starts_at = starts_at.replace(tzinfo=berlin)
            else:
                starts_at = starts_at.astimezone(berlin)

            time_tag = performance.select_one(
                ".performance__col--date .performance__time"
            )
            ends_at = end_time_from_text(
                starts_at, time_tag.get_text(" ", strip=True)
            )
            location = performance.select_one(
                ".performance__location"
            ).get_text(" ", strip=True)
            if location.startswith("Treffpunkt:"):
                continue
            venue = Venue(
                id=f"{self.name}-{slugify(location)}",
                name=location,
                city="Essen",
            )
            url = absolute_url(response.url, link["href"])
            events.append(
                Event(
                    title=title,
                    venue=venue,
                    category=category,
                    starts_at=starts_at,
                    ends_at=ends_at,
                    url=url,
                )
            )
        return events


class OperKoeln(Source):
    VENUE = Venue(
        id="oper-koeln-oper-koeln",
        name="Oper Köln",
        city="Köln",
    )

    def scrape(self) -> list[Event]:
        debug(f"{self.name}: GET", self.website)
        response = httpx.get(self.website, follow_redirects=True, timeout=60)
        debug("  ->", response.status_code, len(response.text), "chars")
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        berlin = ZoneInfo("Europe/Berlin")

        events = []
        production_pages: dict[str, tuple[str | None, str]] = {}
        activities = soup.select("li.s-bko-activity--schedule")
        debug(f"{self.name}: {len(activities)} .s-bko-activity")
        for activity in activities:
            time_string = activity.select_one(".s-time-string")
            time_text = time_string.get_text(" ", strip=True)
            category_tag = activity.select_one(
                ".s-bko-activity__category"
            )
            category_text = (
                category_tag.get_text(" ", strip=True)
                if category_tag
                else ""
            )
            link = activity.select_one(".s-link-container a[href]")
            title = (
                link.get_text(" ", strip=True).replace("\xad", "")
                if link
                else ""
            )
            if is_non_performance(title, time_text, category_text):
                continue
            if not link:
                raise ValueError(f"{self.name}: event has no production URL")

            url = absolute_url(response.url, link["href"])
            if url not in production_pages:
                debug(f"{self.name}: production page", url)
                detail_response = httpx.get(
                    url, follow_redirects=True, timeout=60
                )
                debug("  ->", detail_response.status_code)
                detail_response.raise_for_status()
                detail_soup = BeautifulSoup(
                    detail_response.text, "html.parser"
                )
                field_text = " ".join(
                    tag.get_text(" ", strip=True)
                    for tag in detail_soup.select(
                        ".field--name-text-2, .field--name-text-3, "
                        ".field--name-text-4, .field--name-text-5"
                    )
                )
                image_tag = detail_soup.select_one(
                    'meta[property="og:image"][content]'
                )
                production_pages[url] = (
                    (
                        absolute_url(detail_response.url, image_tag["content"])
                        if image_tag
                        else None
                    ),
                    field_text,
                )
            image_url, field_text = production_pages[url]
            if (
                is_youth_production(field_text)
                or is_non_performance(field_text)
            ):
                continue

            time_tags = time_string.select("time[datetime]")
            clock_match = re.search(r"\b(\d{1,2}:\d{2})\b", time_text)
            date_tag = activity.select_one(
                "time.s-bko-activity__datetime[datetime]"
            )
            starts_at = datetime.combine(
                datetime.fromisoformat(date_tag["datetime"]).date(),
                datetime.strptime(clock_match[1], "%H:%M").time(),
                tzinfo=berlin,
            )

            ends_at = None
            if time_tags:
                end_datetime = datetime.fromisoformat(
                    time_tags[-1]["datetime"].replace("Z", "+00:00")
                )
                if end_datetime.tzinfo is None:
                    end_datetime = end_datetime.replace(tzinfo=berlin)
                ends_at = end_datetime.astimezone(berlin)

            category = (
                Category.THEATER
                if re.search(r"Schauspiel", category_text, re.IGNORECASE)
                else Category.OPER
            )
            events.append(
                Event(
                    title=title,
                    venue=self.VENUE,
                    category=category,
                    starts_at=starts_at,
                    ends_at=ends_at,
                    url=url,
                    image_url=image_url,
                )
            )
        return events


class SchauspielhausBochum(Source):
    DANCE_URL = "https://www.schauspielhausbochum.de/de/spielplan/11/tanz"

    def scrape(self) -> list[Event]:
        events = []
        berlin = ZoneInfo("Europe/Berlin")
        for url, category in (
            (self.website, Category.THEATER),
            (self.DANCE_URL, Category.OPER),
        ):
            debug(f"{self.name}: GET", url)
            response = httpx.get(url, follow_redirects=True, timeout=60)
            debug("  ->", response.status_code, len(response.text), "chars")
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")
            groups = soup.select(".schedule__group[data-groupdate]")
            debug(f"{self.name}: {len(groups)} schedule groups")

            for group in groups:
                for item in group.select(".schedule__item"):
                    link = item.select_one(".schedule__title a")
                    stage_tag = item.select_one(".schedule__stage")
                    time_tag = item.select_one(".schedule__times")
                    if not link or not stage_tag or not time_tag:
                        continue
                    stage = stage_tag.get_text(" ", strip=True)
                    if stage in {"Theaterrevier", "Theater Hagen"}:
                        continue
                    title = link.get_text(" ", strip=True).replace("\xad", "")
                    attributes = item.select_one(".schedule__attributes")
                    if is_non_performance(
                        title,
                        (
                            attributes.get_text(" ", strip=True)
                            if attributes
                            else ""
                        ),
                    ):
                        continue

                    starts_at = datetime.fromisoformat(
                        group["data-groupdate"]
                    ).replace(tzinfo=berlin)
                    time_text = time_tag.get_text(" ", strip=True)
                    clock_match = re.search(
                        r"\b(\d{1,2}:\d{2})\b", time_text
                    )
                    start_clock = datetime.strptime(
                        clock_match[1], "%H:%M"
                    ).time()
                    starts_at = datetime.combine(
                        starts_at.date(), start_clock, tzinfo=berlin
                    )
                    venue = Venue(
                        id=f"{self.name}-{slugify(stage)}",
                        name=stage,
                        city="Bochum",
                    )
                    events.append(
                        Event(
                            title=title,
                            venue=venue,
                            category=category,
                            starts_at=starts_at,
                            ends_at=end_time_from_text(starts_at, time_text),
                            url=absolute_url(response.url, link["href"]),
                        )
                    )
        return events


class PinaBausch(Source):
    CITY = "Wuppertal"

    def scrape(self) -> list[Event]:
        debug(f"{self.name}: GET", self.website)
        response = httpx.get(
            self.website,
            follow_redirects=True,
            timeout=60,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        debug("  ->", response.status_code, len(response.text), "chars")
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        berlin = ZoneInfo("Europe/Berlin")

        events = []
        listings = []
        for listing in soup.select('a[href*="/de/plays/"]'):
            columns = listing.find_all("div", recursive=False)
            if len(columns) < 3:
                continue
            if re.search(
                r"Beginnt um\s*:", columns[2].get_text(" ", strip=True)
            ):
                listings.append((listing, columns))
        debug(f"{self.name}: {len(listings)} dated production listings")
        if not listings:
            raise ValueError(
                f"{self.name}: response contains no dated production listings"
            )
        for performance, columns in listings:
            location = columns[2].select("span.font-copy")
            venue_name = location[0].get_text(" ", strip=True).rstrip(", ")
            city = location[1].get_text(" ", strip=True)
            if city != self.CITY:
                continue

            month = performance.find_parent(
                id=re.compile(r"^\d{4}-\d{2}-01$")
            )
            day_month = performance.select_one("span").get_text(
                " ", strip=True
            )
            day_match = re.fullmatch(
                r"(\d{1,2})\.(\d{1,2})\.", day_month
            )
            year = (
                int(month["id"][:4])
                if month
                else datetime.now(berlin).year
            )
            starts_at = datetime(
                year, int(day_match[2]), int(day_match[1])
            )
            if not month and starts_at.date() < datetime.now(berlin).date():
                starts_at = starts_at.replace(year=year + 1)
            time_text = columns[2].get_text(" ", strip=True)
            clock_match = re.search(
                r"Beginnt um\s*:\s*(\d{1,2}:\d{2})", time_text
            )
            start_clock = datetime.strptime(
                clock_match[1], "%H:%M"
            ).time()
            starts_at = datetime.combine(
                starts_at.date(), start_clock, tzinfo=berlin
            )

            title = performance.select_one("h2").get_text(
                " ", strip=True
            ).replace("\xad", "")
            venue = Venue(
                id=f"{self.name}-{slugify(venue_name)}",
                name=venue_name,
                city=city,
            )
            image = performance.select_one("img[src]")
            events.append(
                Event(
                    title=title,
                    venue=venue,
                    category=Category.OPER,
                    starts_at=starts_at,
                    ends_at=None,
                    url=absolute_url(response.url, performance["href"]),
                    image_url=(
                        absolute_url(response.url, image["src"])
                        if image
                        else None
                    ),
                )
            )
        return events


sources = [
    Filmkunstkinos("filmkunstkinos", "https://filmkunstkinos.de/programm/"),
    Dhaus("dhaus", "https://www.dhaus.de/programm/spielplan/schauspiel"),
    OperAmRhein(
        "oper-am-rhein",
        "https://www.operamrhein.de/spielplan/kalender/duesseldorf/",
    ),
    SchauspielKoeln(
        "schauspiel-koeln", "https://www.schauspiel.koeln/kalender"
    ),
    TheaterKrefeldMoenchengladbach(
        "theater-krefeld-moenchengladbach",
        "https://theater-kr-mg.de/kalender/",
    ),
    OperWuppertal("oper-wuppertal", "https://www.oper-wuppertal.de/"),
    TheaterEssen(
        "theater-essen", "https://www.theater-essen.de/programm/kalender/"
    ),
    OperKoeln("oper-koeln", "https://www.oper.koeln/programm"),
    SchauspielhausBochum(
        "schauspielhaus-bochum",
        "https://www.schauspielhausbochum.de/de/spielplan/13/schauspiel",
    ),
    PinaBausch("pina-bausch", "https://www.pina-bausch.de/de"),
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
