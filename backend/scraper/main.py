from abc import ABC, abstractmethod
from dataclasses import dataclass

import hashlib
import io
import json
import os
import re
import traceback
import httpx
import psycopg
from enum import StrEnum
from datetime import datetime, timedelta
from bs4 import BeautifulSoup
from pathlib import Path
from PIL import Image, ImageOps
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
    # ballet and dance theatre
    TANZ = "tanz"


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


# Longest side of a stored image. Larger ones are shrunk: the site shows them
# at a few hundred pixels, and serves the stored bytes to every visitor.
MAX_SIDE = 2000
# Pillow refuses images above about 179 megapixels (decompression bombs);
# download_image() checks sizes itself and decodes large JPEGs at reduced size.
Image.MAX_IMAGE_PIXELS = None
# A non-JPEG must be decoded at full size to shrink it: refuse larger ones.
MAX_FULL_DECODE_PIXELS = 100_000_000


def download_image(source_url: str) -> StoredImage:
    """
    Downloads an image. Up to MAX_SIDE pixels on the long side it keeps the
    original bytes (no re-encoding, which causes compression artifacts);
    Pillow only checks that the bytes are an image and names the format.
    A larger image is shrunk to MAX_SIDE and stored as JPEG (PNG if it has
    transparency). Example: a 14000 x 20000 px, 11 MB poster at Krefeld.
    """
    debug("download image", source_url)
    # some sites (UCI) answer 403 to httpx's default User-Agent
    response = httpx.get(
        source_url,
        follow_redirects=True,
        timeout=60,
        headers={"User-Agent": "Mozilla/5.0"},
    )
    debug("  ->", response.status_code, len(response.content), "bytes")
    response.raise_for_status()
    data = response.content
    with Image.open(io.BytesIO(data)) as image:
        content_type = Image.MIME[image.format]
        image.verify()
    with Image.open(io.BytesIO(data)) as image:
        if max(image.size) > MAX_SIDE:
            data, content_type = shrink(image)
            debug("  shrunk to", len(data), "bytes")
    # The key is a hash of the content, so a changed image gets a new URL
    # and never collides with an old copy in a browser cache.
    key = hashlib.sha256(data).hexdigest()[:32]
    return StoredImage(key, source_url, content_type, data)


def shrink(image: Image.Image) -> tuple[bytes, str]:
    """The image at MAX_SIDE pixels on its long side, as bytes and content type."""
    size = image.size
    if image.format == "JPEG":
        # decode at 1/2, 1/4 or 1/8 scale, still at least MAX_SIDE: little memory
        image.draft("RGB", (MAX_SIDE, MAX_SIDE))
    elif size[0] * size[1] > MAX_FULL_DECODE_PIXELS:
        raise ValueError(f"{image.format} image of {size[0]} x {size[1]} px is too large to shrink")
    image = ImageOps.exif_transpose(image)  # the saved file drops EXIF orientation
    image.thumbnail((MAX_SIDE, MAX_SIDE))
    out = io.BytesIO()
    if image.mode in ("RGBA", "LA") or "transparency" in image.info:
        image.save(out, "PNG", optimize=True)
        return out.getvalue(), "image/png"
    image.convert("RGB").save(out, "JPEG", quality=88, optimize=True)
    return out.getvalue(), "image/jpeg"


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
    # Generic German event-type words, matched against an event's short texts
    # (title, label, badge, subtitle); never against production descriptions,
    # which mention anything. Info and ticket lines are only checked for
    # CLOSED. The same for every source: keep them generic and do not
    # override them per source.
    #
    # Closed performances: booked by schools or kindergartens, or not on sale.
    CLOSED = re.compile(
        r"\b(?:\w*schul(?:vorstellung|konzert)\w*|kita\w*|\w*kindergarten\w*|"
        r"für\s+schulen|geschlossene\s+vorstellung\w*)\b",
        re.IGNORECASE,
    )
    # "live viewing": a concert shown live in cinemas
    CONCERT = re.compile(
        r"\b(?:\w*konzert\w*|jazz\w*|\w*gala|live[\s-]+viewing)\b",
        re.IGNORECASE,
    )
    # A cinema's genre or series labels ("Oper", "Ballett", "MET Opera") for
    # broadcasts of stage works. Labels only: film titles mention anything.
    OPERA_LABEL = re.compile(r"\b(?:oper|opera)\b", re.IGNORECASE)
    DANCE_LABEL = re.compile(r"\b(?:ballett?|tanz|dance)\b", re.IGNORECASE)
    # Not a performance: tours, workshops and classes, readings, talks, intro
    # events, parties. "führung" excludes (Ur-, Erst-, Vor-)Aufführung and
    # Einführung, which label real performances ("18:15 Einführung").
    NON_PERFORMANCE = re.compile(
        r"\b(?:\w*workshops?|atelier|\w*(?<!auf|ein)führung(?:en)?|rundg\w*|"
        r"\w*tour(?:en)?|open\s+classes?|mitmach\w*|trainings?|"
        r"\w*kurs(?:e|en)?|labs?|"
        r"\w*lesung(?:en)?|liest|talks?|vortr[aä]g\w*|gespr[aä]ch\w*|"
        r"diskussion\w*|moderation|salon\w*|soiree|\w*matinee|partys?)\b",
        re.IGNORECASE,
    )

    def __init__(self, name, website):
        self.name = name
        self.website = website

    def event_category(
        self, default: Category | None, *labels: str
    ) -> Category | None:
        """
        The category of an event with these short texts, or None to skip it.
        Closed performances are skipped. A concert word gives CONCERT and wins
        over NON_PERFORMANCE ("Benefiz-Matinee" with the label "Konzert"),
        which skips the event. Otherwise the event gets `default`; None skips
        it.
        """
        # "+ Einführung", "+ Gespräch": an extra before or after a performance
        text = " ".join(re.sub(r"\+[^+]*", " ", label) for label in labels)
        if self.CLOSED.search(text):
            return None
        if self.CONCERT.search(text):
            return Category.CONCERT
        if self.NON_PERFORMANCE.search(text):
            return None
        return default

    def screening_category(self, title: str, *labels: str) -> Category:
        """
        The category of a cinema screening: TANZ or OPER when its labels
        (genre, series badge) name a ballet or opera broadcast, CONCERT for a
        concert word in the title or labels ("Weihnachtskonzert", "Live
        Viewing"), otherwise FILM. Unlike event_category() it skips nothing.
        """
        text = " ".join(labels)
        if self.DANCE_LABEL.search(text):
            return Category.TANZ
        if self.OPERA_LABEL.search(text):
            return Category.OPER
        if self.CONCERT.search(f"{title} {text}"):
            return Category.CONCERT
        return Category.FILM

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

        Images already stored for a production (this source, this title) are
        reused, so a daily run only looks up new productions. Events with the
        same title share one lookup (Dhaus has one page per performance).
        """
        try:
            with connect() as conn:
                known = dict(
                    conn.execute(
                        """
                        SELECT title, image_key FROM productions
                        WHERE source = %s AND image_key IS NOT NULL
                          AND title = ANY(%s)
                        """,
                        [self.name, list({e.title for e in events})],
                    ).fetchall()
                )
        except Exception as error:
            print(f"{self.name}: could not read stored images: {error!r}")
            known = {}
        debug(f"{self.name}: {len(known)} productions already have an image")

        new: dict[str, StoredImage] = {}
        by_title: dict[str, str | None] = {}
        for event in events:
            if event.title in known:
                event.image_key = known[event.title]
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
        """
        Upserts the events' venues, new images and productions, then the
        events. Writes only the scraper's columns of `productions`: the
        enricher's notes stay as they are.
        """
        venues = {e.venue for e in events}
        venue_rows = [(v.id, v.name, v.city) for v in venues]
        image_rows = [
            (i.key, i.source_url, i.content_type, i.data) for i in images
        ]
        # one row per title; the last event of a title wins
        productions = {
            e.title: (self.name, e.title, e.category.value, e.image_key)
            for e in events
        }

        debug(
            f"{self.name}: saving {len(venue_rows)} venues,"
            f" {len(image_rows)} images, {len(productions)} productions,"
            f" {len(events)} events"
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
            production_ids = {}
            for row in productions.values():
                production_ids[row[1]] = cursor.execute(
                    """
                    INSERT INTO productions (source, title, category, image_key)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (source, title)
                    DO UPDATE SET
                        category = EXCLUDED.category,
                        -- a failed image lookup keeps the image found earlier
                        image_key = COALESCE(EXCLUDED.image_key, productions.image_key)
                    RETURNING id
                    """,
                    row,
                ).fetchone()[0]
            cursor.executemany(
                """
                INSERT INTO events
                    (production_id, venue_id, starts_at, ends_at, url)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (production_id, venue_id, starts_at)
                DO UPDATE SET
                    ends_at = EXCLUDED.ends_at,
                    url = EXCLUDED.url,
                    updated_at = now()
                """,
                [
                    (production_ids[e.title], e.venue.id, e.starts_at, e.ends_at, e.url)
                    for e in events
                ],
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
            # the genres before the first "•" ("Oper", "Ballett" for broadcasts)
            category = self.screening_category(title, meta.split("•")[0])

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
                        category=category,
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
            if "performance--is-cancelled" in performance["class"]:
                continue
            link = performance.select_one(".performance__title a")
            title = (
                link.select_one("[itemprop=name]")
                .get_text(strip=True)
                .replace("\xad", "")
            )
            # credits or format, e.g. "Szenische Konzertreihe"
            subtitles = [
                tag.get_text(" ", strip=True)
                for tag in performance.select(
                    ".performance__infos .performance__text"
                )
            ]
            category = self.event_category(Category.THEATER, title, *subtitles)
            if not category:
                continue
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
                    category=category,
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
            if "performance--is-cancelled" in performance["class"]:
                continue
            location_tag = performance.select_one(".performance__location")
            location = location_tag.get_text(strip=True)
            if location != self.VENUE.name:
                continue

            # e.g. "Oper", "Ballett", "Junge Oper, Konzert"; tours have none
            category_tag = performance.select_one(".performance__category")
            if not category_tag:
                continue
            label = category_tag.get_text(" ", strip=True)

            link = performance.select_one("a.performance__link")
            title_tag = link.select_one(".performance__title [itemprop=name]")
            title = title_tag.get_text(" ", strip=True).replace("\xad", "")
            # badges, e.g. "Schulvorstellung"
            attributes = [
                tag.get_text(" ", strip=True)
                for tag in performance.select(".attribute")
            ]
            category = self.event_category(
                Category.TANZ if "Ballett" in label else Category.OPER,
                title,
                label,
                *attributes,
            )
            if not category:
                continue
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
                    category=category,
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
            ticket = activity.select_one(".field--name-ticket")
            if ticket and ticket.get_text(strip=True) == "Entfällt":
                continue
            # e.g. "Premiere", "Konzert", "Lesung", "Führung"
            label_tag = activity.select_one(".field--name-category")
            label = label_tag.get_text(strip=True) if label_tag else ""
            link = activity.select_one(".field--name-production a")
            title = link.get_text(strip=True)
            category = self.event_category(Category.THEATER, title, label)
            if not category:
                debug(f"  skip {title!r} [{label}]")
                continue
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
    # Category by the first listed branch an event has. Other branches
    # ("Extras": tours, talks, trips) give no category, so only their
    # concerts are kept.
    BRANCHES = {
        "Musiktheater": Category.OPER,
        "Ballett": Category.TANZ,
        "Konzerte": Category.CONCERT,
        "Schauspiel": Category.THEATER,
        "Kinder & Jugend": Category.THEATER,
    }

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
            # badge "Entfällt"
            if "performance--canceled" in performance["class"]:
                continue
            branch_tags = performance.select(".performance__branch-link")
            branches = {
                tag.get_text(" ", strip=True) for tag in branch_tags
            }
            default = next(
                (c for b, c in self.BRANCHES.items() if b in branches), None
            )

            title_tag = performance.select_one(".performance__title")
            title = title_tag.get_text(" ", strip=True).replace("\xad", "")
            # badges, e.g. "Premiere", "Soiree", "+ Einführung"
            meta = performance.select_one(".performance__meta")
            subtitle = performance.select_one(".performance__subtitle")
            category = self.event_category(
                default,
                title,
                meta.get_text(" ", strip=True) if meta else "",
                subtitle.get_text(" ", strip=True) if subtitle else "",
            )
            if not category:
                continue

            link = performance.select_one(".performance__title a")
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
            url = absolute_url(response.url, link["href"]) if link else None
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
        performances = []
        page = 1
        while True:
            # The API returns at most 50 performances (of all branches) per
            # page; one page covers only a few weeks.
            params = {
                "startDateTime[after]": after,
                "itemsPerPage": 50,
                "page": page,
            }
            debug(f"{self.name}: GET", self.API, "page", page)
            response = httpx.get(
                self.API,
                params=params,
                headers={"Accept": "application/ld+json"},
                timeout=60,
            )
            debug("  ->", response.status_code, len(response.text), "chars")
            response.raise_for_status()
            data = response.json()
            performances += data["hydra:member"]
            if "hydra:next" not in data.get("hydra:view", {}):
                break
            page += 1

        events = []
        for performance in performances:
            production = performance["production"]
            branch = production["branch"]["title"]
            location = (performance.get("location") or {}).get("title")
            # Opera at the Opernhaus (not its foyers) and all orchestra
            # concerts; the other branches are Schauspiel and "Sonstiges".
            if branch == "Oper" and location == "Opernhaus":
                default = Category.OPER
            elif branch == "Sinfonieorchester" and location:
                default = Category.CONCERT
            else:
                continue

            title = production["title"].replace("\xad", "").strip()
            event_label = performance.get("event") or {}
            # a subtitle, e.g. "Crashkurs für Neugierige"
            description = BeautifulSoup(
                production.get("shortDescription") or "",
                "html.parser",
            ).get_text(" ", strip=True)
            category = self.event_category(
                default, title, event_label.get("title", ""), description
            )
            if not category:
                continue
            venue = (
                self.VENUE
                if location == "Opernhaus"
                else Venue(
                    id=f"{self.name}-{slugify(location)}",
                    name=location,
                    city=self.VENUE.city,
                )
            )

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
                    venue=venue,
                    category=category,
                    starts_at=starts_at,
                    ends_at=ends_at,
                    url=absolute_url(response.url, performance["url"]),
                )
            )

        debug(f"{self.name}: {len(events)} qualifying performances")
        return events

    def scrape_image(self, event: Event) -> str | None:
        """
        The production image from the API's single performance: neither the
        list above nor the page's HTML has it (the page loads it with
        JavaScript). The page URL ends with the performance id, e.g.
        .../schostakowitsch-acht/5878 -> /api/performances/5878.
        """
        match = re.search(r"/(\d+)/?$", event.url or "")
        if not match:
            return None
        url = f"{self.API}/{match[1]}"
        debug(f"{self.name}: image lookup on", url)
        response = httpx.get(
            url, headers={"Accept": "application/ld+json"}, timeout=60
        )
        debug("  ->", response.status_code)
        response.raise_for_status()
        image = response.json()["production"].get("image") or {}
        return image.get("src")


class TheaterEssen(Source):
    # by the first category the card lists
    CATEGORIES = {
        "Aalto Ballett Essen": Category.TANZ,
        "Aalto Musiktheater": Category.OPER,
        "Schauspiel Essen": Category.THEATER,
        "Essener Philharmoniker": Category.CONCERT,
        "Philharmonie Essen": Category.CONCERT,
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
            if "performance--is-cancelled" in performance["class"]:
                continue
            category_tag = performance.select_one(".performance__category")
            category_name = (
                category_tag.get_text(" ", strip=True) if category_tag else ""
            )
            default = self.CATEGORIES.get(category_name)
            if not default:
                continue
            location = performance.select_one(
                ".performance__location"
            ).get_text(" ", strip=True)
            # a meeting point: guided tours and walks
            if location.startswith("Treffpunkt:"):
                continue

            title_tag = performance.select_one(
                ".performance__title [itemprop=name]"
            )
            title = title_tag.get_text(" ", strip=True).replace("\xad", "")
            subtitle = performance.select_one(".performance__subtitle")
            category = self.event_category(
                default,
                title,
                subtitle.get_text(" ", strip=True) if subtitle else "",
            )
            if not category:
                continue
            # The ticket line says "Schulvorstellung" or "geschlossene
            # Vorstellung"; only closed bookings are read from it.
            ticket = performance.select_one(".performance__ticketbutton")
            if ticket and self.CLOSED.search(ticket.get_text(" ", strip=True)):
                continue

            link = performance.select_one(".performance__title a")
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
            venue = Venue(
                id=f"{self.name}-{slugify(location)}",
                name=location,
                city="Essen",
            )
            url = absolute_url(response.url, link["href"]) if link else None
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
        activities = soup.select("li.s-bko-activity--schedule")
        debug(f"{self.name}: {len(activities)} .s-bko-activity")
        for activity in activities:
            time_string = activity.select_one(".s-time-string")
            time_text = time_string.get_text(" ", strip=True)
            # e.g. "Premiere", "Konzert", "Führung", "Öffentliche Probe"
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
            default = (
                Category.THEATER
                if re.search(r"Schauspiel", category_text, re.IGNORECASE)
                else Category.OPER
            )
            category = self.event_category(default, title, category_text)
            if not category:
                continue
            # The info line names who books it, e.g. "Mobile Kinderoper vor
            # Ort in Ihrer Kita"; only closed bookings are read from it.
            info = activity.select_one(".s-bko-activity__text-infos")
            if info and self.CLOSED.search(info.get_text(" ", strip=True)):
                continue
            if not link:
                raise ValueError(f"{self.name}: event has no production URL")
            url = absolute_url(response.url, link["href"])

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

            events.append(
                Event(
                    title=title,
                    venue=self.VENUE,
                    category=category,
                    starts_at=starts_at,
                    ends_at=ends_at,
                    url=url,
                )
            )
        return events


class SchauspielhausBochum(Source):
    DANCE_URL = "https://www.schauspielhausbochum.de/de/spielplan/11/tanz"

    def scrape(self) -> list[Event]:
        events = []
        # The Schauspiel page also lists the dance pieces; the first listing
        # wins, so the dance page is read first.
        seen: set[tuple[str, str, datetime]] = set()
        berlin = ZoneInfo("Europe/Berlin")
        for url, default in (
            (self.DANCE_URL, Category.TANZ),
            (self.website, Category.THEATER),
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
                    if stage == "Theater Hagen":  # a guest stage, not in Bochum
                        continue
                    # status badges, e.g. "Fällt aus", "Wenige Karten"
                    badges = [
                        tag.get_text(" ", strip=True)
                        for tag in item.select(".schedule__cards")
                    ]
                    if "Fällt aus" in badges:
                        continue
                    title = link.get_text(" ", strip=True).replace("\xad", "")
                    # e.g. "Premiere", "Schulvorstellung"
                    attributes = item.select_one(".schedule__attributes")
                    category = self.event_category(
                        default,
                        title,
                        (
                            attributes.get_text(" ", strip=True)
                            if attributes
                            else ""
                        ),
                    )
                    if not category:
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
                    if (title, venue.id, starts_at) in seen:
                        continue
                    seen.add((title, venue.id, starts_at))
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

    def scrape_image(self, event: Event) -> str | None:
        """
        The production page has no og:image. Its title image is the inline
        background of div.production__title-image (body has a site-wide
        ensemble background). Without one (a title video), the first gallery
        photo: img.lazyimage, whose URL is in data-src.
        """
        if not event.url:
            return None
        debug(f"{self.name}: image lookup on", event.url)
        response = httpx.get(event.url, follow_redirects=True, timeout=60)
        debug("  ->", response.status_code)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        title = soup.select_one(".production__title-image[style]")
        match = title and re.search(
            r"background-image:\s*url\(['\"]?([^'\")]+)", title["style"]
        )
        if match:
            return absolute_url(response.url, match[1])
        gallery = soup.select_one("img.lazyimage[data-src]")
        return absolute_url(response.url, gallery["data-src"]) if gallery else None


class PinaBausch(Source):
    """
    The calendar page is rendered in the browser from the JSON in its
    data-page attribute, which holds the whole season. The home page shows
    only the next few dates.
    """

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
        page = json.loads(soup.select_one("[data-page]")["data-page"])
        berlin = ZoneInfo("Europe/Berlin")

        events = []
        dates = [d for month in page["props"]["months"] for d in month["dates"]]
        debug(f"{self.name}: {len(dates)} dates")
        for date in dates:
            piece = date["event"]
            place = piece["place"]
            # performances link the pieces played; labs and classes none
            if place["city"] != self.CITY or not piece["plays"]:
                continue

            # the same stage as Oper Wuppertal's
            venue = (
                OperWuppertal.VENUE
                if place["name"] == OperWuppertal.VENUE.name
                else Venue(
                    id=f"{self.name}-{slugify(place['name'])}",
                    name=place["name"],
                    city=place["city"],
                )
            )
            events.append(
                Event(
                    title=piece["title"].replace("\xad", "").strip(),
                    venue=venue,
                    category=Category.TANZ,
                    # UTC, e.g. "2027-01-15T18:30:00.000000Z"
                    starts_at=datetime.fromisoformat(
                        date["date_time"]
                    ).astimezone(berlin),
                    ends_at=None,
                    url=absolute_url(response.url, piece["route"]),
                )
            )
        return events

    def scrape_image(self, event: Event) -> str | None:
        """The share image from the event page's data-page (no og:image)."""
        debug(f"{self.name}: image lookup on", event.url)
        response = httpx.get(
            event.url,
            follow_redirects=True,
            timeout=60,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        debug("  ->", response.status_code)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        page = json.loads(soup.select_one("[data-page]")["data-page"])
        return page["props"]["event"]["data"]["meta"]["thumbnail"]


class UfaPalastDuesseldorf(Source):
    """
    The program page lists every announced day (presales months ahead), one
    section.day-section per day with one article.movie-row per film. The
    screens ("Kino 13 – UFA Lounge") are halls of one cinema, not venues.
    """

    VENUE = Venue(
        id="ufa-palast-duesseldorf-ufa-palast",
        name="UFA Palast",
        city="Düsseldorf",
    )

    @staticmethod
    def runtime(text: str) -> timedelta | None:
        """ "2 Std 39 Min", "2 Std" or "95 Min" in the row's info line."""
        match = re.search(r"\b(\d+)\s*Std\b(?:\s*(\d+)\s*Min\b)?|\b(\d+)\s*Min\b", text)
        if not match:
            return None
        hours, minutes, only_minutes = match.groups()
        if only_minutes:
            return timedelta(minutes=int(only_minutes))
        return timedelta(hours=int(hours), minutes=int(minutes or 0))

    def scrape(self) -> list[Event]:
        debug(f"{self.name}: GET", self.website)
        response = httpx.get(self.website, follow_redirects=True, timeout=60)
        debug("  ->", response.status_code, len(response.text), "chars")
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        berlin = ZoneInfo("Europe/Berlin")

        events = []
        rows = soup.select("section.day-section article.movie-row")
        debug(f"{self.name}: {len(rows)} article.movie-row")
        for row in rows:
            link = row.select_one("a.group[href]")
            title = link.select_one("h2").get_text(" ", strip=True)
            # FSK badge, year and runtime; the description is in a later div
            runtime = self.runtime(link.find_next_sibling("div").get_text(" "))
            # badges such as "2D", "OV", "MET Opera", "First Preview"
            badges = [b.get_text(" ", strip=True) for b in row.select(".prog-badge")]
            category = self.screening_category(title, *badges)
            poster = row.select_one("img[src]")
            for show in row.select(".showtime-wrap[data-date][data-time]"):
                # local clock time; after midnight it is already the next date
                starts_at = datetime.strptime(
                    f"{show['data-date']} {show['data-time']}", "%Y-%m-%d %H:%M"
                ).replace(tzinfo=berlin)
                events.append(
                    Event(
                        title=title,
                        venue=self.VENUE,
                        category=category,
                        starts_at=starts_at,
                        ends_at=starts_at + runtime if runtime else None,
                        url=absolute_url(response.url, link["href"]),
                        image_url=(
                            absolute_url(response.url, poster["src"]) if poster else None
                        ),
                    )
                )
        return events


class UciKinowelt(Source):
    """
    The cinema's program page without "/day" lists every film with all its
    announced screenings (the "/day" page shows only today). One
    div.film-container per film, with a table of a.badge-performance links.
    """

    VENUE = Venue(
        id="uci-kinowelt-uci-kino",
        name="UCI Kino",
        city="Düsseldorf",
    )

    def scrape(self) -> list[Event]:
        debug(f"{self.name}: GET", self.website)
        # the site answers 403 to httpx's default User-Agent
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
        films = soup.select("div.film-container")
        debug(f"{self.name}: {len(films)} div.film-container")
        for film in films:
            link = film.select_one(
                "h2.film-container__description__text__eventtitle a[href]"
            )
            title = link.get_text(" ", strip=True)
            # e.g. ["Neu", "159min", "Action, Science-Fiction"]; some films have no length
            info = [li.get_text(strip=True) for li in film.select("ul.film-info li")]
            minutes = next(
                (int(m[1]) for i in info if (m := re.fullmatch(r"(\d+)\s*min", i))),
                None,
            )
            # genres such as "Oper", "Ballett", "Live"
            category = self.screening_category(title, *info)
            poster = film.select_one("img.film-thumb[src]")
            shows = film.select("a.badge-performance[data-date][data-time]")
            debug(f"  {title!r}: {len(shows)} screenings, {minutes} min")
            for show in shows:
                # local clock time; after midnight it is already the next date
                starts_at = datetime.strptime(
                    f"{show['data-date']} {show['data-time']}", "%Y%m%d %H:%M"
                ).replace(tzinfo=berlin)
                events.append(
                    Event(
                        title=title,
                        venue=self.VENUE,
                        category=category,
                        starts_at=starts_at,
                        ends_at=(
                            starts_at + timedelta(minutes=minutes) if minutes else None
                        ),
                        url=absolute_url(response.url, link["href"]),
                        image_url=(
                            absolute_url(response.url, poster["src"]) if poster else None
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
    PinaBausch("pina-bausch", "https://www.pina-bausch.de/de/calendar"),
    UfaPalastDuesseldorf(
        "ufa-palast-duesseldorf", "https://ufa-duesseldorf.de/programm/"
    ),
    UciKinowelt(
        "uci-kinowelt",
        "https://www.uci-kinowelt.de/kinoprogramm/duesseldorf/50",
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
