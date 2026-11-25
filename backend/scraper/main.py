from abc import ABC, abstractmethod
from dataclasses import dataclass

import hashlib
import io
import json
import logging
import os
import re
import sys
import httpx
import psycopg
from enum import StrEnum
from datetime import datetime, timedelta
from bs4 import BeautifulSoup, Tag
from pathlib import Path
from PIL import Image, ImageOps
from zoneinfo import ZoneInfo
from time import sleep


# Every line: time, level, then "<source> | message" (see Source.ctx), so a
# run reads as one table. LOG_LEVEL=DEBUG adds every event and image lookup.
# stdout only: Docker interleaves stdout and stderr, which tore tracebacks apart.
logging.basicConfig(
    stream=sys.stdout,
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("scraper")
# width of the source column (Source.ctx): the longest names but one fit
CTX_WIDTH = 22


def size(response: httpx.Response) -> str:
    """The response's status and size for a log line: "200, 766 kB"."""
    return f"{response.status_code}, {len(response.content) // 1000} kB"


class Category(StrEnum):
    FILM = "film"
    THEATER = "theater"
    OPER = "oper"
    CONCERT = "konzert"
    # ballet and dance theatre
    TANZ = "tanz"


@dataclass(frozen=True)
class Venue:
    """Where an event takes place: a stage or a building, and its city."""

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


def download_image(source_url: str, ctx: str) -> StoredImage:
    """
    Downloads an image. Up to MAX_SIDE pixels on the long side it keeps the
    original bytes (no re-encoding, which causes compression artifacts);
    Pillow only checks that the bytes are an image and names the format.
    A larger image is shrunk to MAX_SIDE and stored as JPEG (PNG if it has
    transparency). Example: a 14000 x 20000 px, 11 MB poster at Krefeld.
    """
    # some sites (UCI) answer 403 to httpx's default User-Agent
    response = httpx.get(
        source_url,
        follow_redirects=True,
        timeout=60,
        headers={"User-Agent": "Mozilla/5.0"},
    )
    log.debug(f"{ctx} image {source_url} -> {size(response)}")
    response.raise_for_status()
    data = response.content
    with Image.open(io.BytesIO(data)) as image:
        content_type = Image.MIME[image.format]
        image.verify()
    with Image.open(io.BytesIO(data)) as image:
        if max(image.size) > MAX_SIDE:
            data, content_type = shrink(image)
            log.debug(f"{ctx}   shrunk to {len(data) // 1000} kB")
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

    def __init__(self, name: str, website: str, organizer: str):
        """
        `name`: the key of the website, stored as `productions.source`.
        `organizer`: who hosts its events, shown to visitors. A future source
        that collects the events of several organizers would set it per event.
        """
        self.name = name
        self.website = website
        self.organizer = organizer

    @property
    def ctx(self) -> str:
        """
        The prefix of every log line about this source: its name in a fixed
        column, so the messages start at the same position. The longest name
        (theater-krefeld-moenchengladbach) is cut.
        """
        return f"{self.name:<{CTX_WIDTH}.{CTX_WIDTH}} |"

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
        response = httpx.get(event.url, follow_redirects=True, timeout=60)
        log.debug(f"{self.ctx} page {response.url} -> {size(response)}")
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        tag = soup.select_one('meta[property="og:image"][content]')
        log.debug(f"{self.ctx}   og:image {tag['content'] if tag else None}")
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
            log.warning(f"{self.ctx} could not read stored images: {error!r}")
            known = {}

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
                        image = download_image(source_url, self.ctx)
                        new[image.key] = image
                        by_title[event.title] = image.key
                except Exception as error:
                    log.warning(f"{self.ctx} no image for {event.title!r}: {error!r}")
            event.image_key = by_title[event.title]
        log.info(
            f"{self.ctx} images: {len(known)} known, {len(by_title)} looked up,"
            f" {len(new)} new; {sum(1 for e in events if e.image_key)}/{len(events)}"
            " events have one"
        )
        return list(new.values())

    def save(self, events: list[Event], images: list[StoredImage]) -> None:
        """
        Upserts new images and the productions, then the events with their
        venue and city. Writes only the scraper's columns of `productions`:
        the enricher's notes stay as they are.
        """
        image_rows = [
            (i.key, i.source_url, i.content_type, i.data) for i in images
        ]
        # one row per title; the last event of a title wins
        productions = {
            e.title: (self.name, self.organizer, e.title, e.category.value, e.image_key)
            for e in events
        }

        with connect() as conn:
            cursor = conn.cursor()
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
                production_ids[row[2]] = cursor.execute(
                    """
                    INSERT INTO productions (source, organizer, title, category, image_key)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (source, title)
                    DO UPDATE SET
                        organizer = EXCLUDED.organizer,
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
                    (production_id, venue, city, starts_at, ends_at, url)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (production_id, venue, city, starts_at)
                DO UPDATE SET
                    ends_at = EXCLUDED.ends_at,
                    url = EXCLUDED.url,
                    updated_at = now()
                """,
                [
                    (production_ids[e.title], e.venue.name, e.venue.city, e.starts_at, e.ends_at, e.url)
                    for e in events
                ],
            )
        log.info(
            f"{self.ctx} saved {len(image_rows)} images,"
            f" {len(productions)} productions, {len(events)} events"
        )


class Filmkunstkinos(Source):
    # The program page names no city; all four cinemas are in Düsseldorf.
    CITY = "Düsseldorf"

    def scrape(self) -> list[Event]:
        response = httpx.get(self.website, follow_redirects=True, timeout=60)
        log.info(f"{self.ctx} GET {response.url} -> {size(response)}")
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        events = []
        articles = soup.select("article.col-group")
        log.info(f"{self.ctx} found {len(articles)} article.col-group")
        for article in articles:
            link = article.select_one("h2.movie-small--title a")
            title = link.find(string=True, recursive=False).strip()
            url = str(response.url.join(link["href"]))

            name = article.select_one("span.meta-theater-logo").get_text(
                strip=True
            )
            venue = Venue(name=name, city=self.CITY)

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
            log.debug(f"{self.ctx}   {title!r} at {name}: {len(times)} screenings, {runtime}")
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
        response = httpx.get(self.website, follow_redirects=True, timeout=60)
        log.info(f"{self.ctx} GET {response.url} -> {size(response)}")
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        berlin = ZoneInfo("Europe/Berlin")

        events = []
        performances = soup.select("div.performance")
        log.info(f"{self.ctx} found {len(performances)} div.performance")
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
            venue = Venue(name=name, city=city)

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

            log.debug(f"{self.ctx}   {title!r} at {venue.name}: {starts_at} - {ends_at}")
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
        name="Opernhaus Düsseldorf",
        city="Düsseldorf",
    )

    def scrape(self) -> list[Event]:
        response = httpx.get(self.website, follow_redirects=True, timeout=60)
        log.info(f"{self.ctx} GET {response.url} -> {size(response)}")
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        berlin = ZoneInfo("Europe/Berlin")

        events = []
        performances = soup.select("div.performance")
        log.info(f"{self.ctx} found {len(performances)} div.performance")
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

            log.debug(f"{self.ctx}   {title!r} at {self.VENUE.name}: {starts_at} - {ends_at}")
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
        name="Schauspiel Köln",
        city="Köln",
    )

    def production(self, url: str) -> Production:
        """
        Stage, length and image from a production page. Missing details fall
        back to the general venue, no length and no image.
        """
        response = httpx.get(url, follow_redirects=True, timeout=60)
        log.debug(f"{self.ctx} page {response.url} -> {size(response)}")
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        # e.g. "Kleines Haus"; a page listing several stages
        # ("Erfrischungsraum & Kleines Haus") does not say which one is meant
        stage_tag = soup.select_one(".field--name-stages")
        stage = " ".join(stage_tag.get_text(" ").split()) if stage_tag else ""
        if stage and "&" not in stage:
            venue = Venue(
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
                log.warning(f"{self.ctx} unknown length {text!r} on {url}")

        image_tag = soup.select_one('meta[property="og:image"][content]')
        image_url = (
            str(response.url.join(image_tag["content"])) if image_tag else None
        )
        log.debug(f"{self.ctx}   stage {stage!r} -> {venue.name}, length {length}, image {image_url}")
        return Production(venue, length, image_url)

    def scrape(self) -> list[Event]:
        response = httpx.get(self.website, follow_redirects=True, timeout=60)
        log.info(f"{self.ctx} GET {response.url} -> {size(response)}")
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        events = []
        productions: dict[str, Production] = {}  # one fetch per production page
        activities = soup.select("li.s-bko-activity")
        log.info(f"{self.ctx} found {len(activities)} li.s-bko-activity")
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
                log.debug(f"{self.ctx}   skip {title!r} [{label}]")
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
                    log.warning(f"{self.ctx} no details for {title!r}: {error!r}")
                    productions[url] = Production(self.VENUE, None, None)
            details = productions[url]
            log.debug(f"{self.ctx}   {title!r} [{label}] {starts_at}")
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
    # Some location lines abbreviate the two theatres ("Theater MG – Studio").
    ABBREVIATIONS = {
        "Theater MG": "Theater Mönchengladbach",
        "Theater KR": "Theater Krefeld",
    }
    # Seating notes after the stage ("Konzertsaal Freie Platzwahl", "Große Bühne FP").
    SEATING = re.compile(r"\s+(?:Freie Platzwahl|FP)$")
    # The company's seat: the city of a venue whose directions page gives no address.
    SEAT = "Krefeld"

    def venue(self, location: Tag, cities: dict[str, str]) -> Venue:
        """
        One venue per stage. The line is "building – stage" ("Theater MG –
        Studio") or only the building ("Seidenweberhaus"). The venue is the
        stage, else the building: organizer and city already say which
        theatre. The city comes from the address on the building's directions
        page (its link), read once per building and run.
        """
        building, _, stage = location.get_text(" ", strip=True).partition(" – ")
        name = self.SEATING.sub("", stage) or self.ABBREVIATIONS.get(building, building)
        link = location.select_one("a[href]")
        if link and link["href"] not in cities:
            cities[link["href"]] = self.city(link["href"])
        city = cities[link["href"]] if link else self.SEAT
        return Venue(name=name, city=city)

    def city(self, url: str) -> str:
        """The city in the address of a directions page ("…, 5911 HH Venlo")."""
        try:
            response = httpx.get(url, follow_redirects=True, timeout=60)
            log.debug(f"{self.ctx} page {response.url} -> {size(response)}")
            response.raise_for_status()
        except httpx.HTTPError as error:
            log.warning(f"{self.ctx} no address from {url}: {error!r}; city {self.SEAT}")
            return self.SEAT
        address = BeautifulSoup(response.text, "html.parser").select_one("span.has-icon--multiline")
        if not address:
            log.info(f"{self.ctx} no address on {url}; city {self.SEAT}")
            return self.SEAT
        # "Theater Mönchengladbach | Odenkirchener Straße 78, 41236 Mönchengladbach"
        place = address.get_text(" ", strip=True).rsplit(",", 1)[-1]
        return re.sub(r"^\s*\d{4,5}(?: [A-Z]{2})?\s+", "", place).strip()

    def scrape(self) -> list[Event]:
        response = httpx.get(self.website, follow_redirects=True, timeout=60)
        log.info(f"{self.ctx} GET {response.url} -> {size(response)}")
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        berlin = ZoneInfo("Europe/Berlin")

        events = []
        cities: dict[str, str] = {}  # directions page URL -> city
        performances = soup.select("article.performance")
        log.info(f"{self.ctx} found {len(performances)} article.performance")
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

            venue = self.venue(performance.select_one(".performance__location"), cities)
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
            response = httpx.get(
                self.API,
                params=params,
                headers={"Accept": "application/ld+json"},
                timeout=60,
            )
            log.info(f"{self.ctx} GET {response.url} -> {size(response)}")
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

        log.info(f"{self.ctx} found {len(events)} qualifying performances")
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
        response = httpx.get(
            url, headers={"Accept": "application/ld+json"}, timeout=60
        )
        log.debug(f"{self.ctx} page {response.url} -> {size(response)}")
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
        response = httpx.get(self.website, follow_redirects=True, timeout=60)
        log.info(f"{self.ctx} GET {response.url} -> {size(response)}")
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        berlin = ZoneInfo("Europe/Berlin")

        events = []
        performances = soup.select("div.performance")
        log.info(f"{self.ctx} found {len(performances)} div.performance")
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
        name="Oper Köln",
        city="Köln",
    )

    def scrape(self) -> list[Event]:
        response = httpx.get(self.website, follow_redirects=True, timeout=60)
        log.info(f"{self.ctx} GET {response.url} -> {size(response)}")
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        berlin = ZoneInfo("Europe/Berlin")

        events = []
        activities = soup.select("li.s-bko-activity--schedule")
        log.info(f"{self.ctx} found {len(activities)} .s-bko-activity")
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
            response = httpx.get(url, follow_redirects=True, timeout=60)
            log.info(f"{self.ctx} GET {response.url} -> {size(response)}")
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")
            groups = soup.select(".schedule__group[data-groupdate]")
            log.info(f"{self.ctx} found {len(groups)} schedule groups")

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
                        name=stage,
                        city="Bochum",
                    )
                    if (title, venue, starts_at) in seen:
                        continue
                    seen.add((title, venue, starts_at))
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
        response = httpx.get(event.url, follow_redirects=True, timeout=60)
        log.debug(f"{self.ctx} page {response.url} -> {size(response)}")
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
        response = httpx.get(
            self.website,
            follow_redirects=True,
            timeout=60,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        log.info(f"{self.ctx} GET {response.url} -> {size(response)}")
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        page = json.loads(soup.select_one("[data-page]")["data-page"])
        berlin = ZoneInfo("Europe/Berlin")

        events = []
        dates = [d for month in page["props"]["months"] for d in month["dates"]]
        log.info(f"{self.ctx} found {len(dates)} dates")
        for date in dates:
            piece = date["event"]
            place = piece["place"]
            # performances link the pieces played; labs and classes none
            if place["city"] != self.CITY or not piece["plays"]:
                continue

            venue = Venue(name=place["name"], city=place["city"])
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
        response = httpx.get(
            event.url,
            follow_redirects=True,
            timeout=60,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        log.debug(f"{self.ctx} page {response.url} -> {size(response)}")
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
        response = httpx.get(self.website, follow_redirects=True, timeout=60)
        log.info(f"{self.ctx} GET {response.url} -> {size(response)}")
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        berlin = ZoneInfo("Europe/Berlin")

        events = []
        rows = soup.select("section.day-section article.movie-row")
        log.info(f"{self.ctx} found {len(rows)} article.movie-row")
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
        name="UCI Kino",
        city="Düsseldorf",
    )

    def scrape(self) -> list[Event]:
        # the site answers 403 to httpx's default User-Agent
        response = httpx.get(
            self.website,
            follow_redirects=True,
            timeout=60,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        log.info(f"{self.ctx} GET {response.url} -> {size(response)}")
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        berlin = ZoneInfo("Europe/Berlin")

        events = []
        films = soup.select("div.film-container")
        log.info(f"{self.ctx} found {len(films)} div.film-container")
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
            log.debug(f"{self.ctx}   {title!r}: {len(shows)} screenings, {minutes} min")
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


class FilmmuseumDuesseldorf(Source):
    """
    The cinema of the Filmmuseum ("Black Box" is the name of its program).
    The program page lists about 15 screenings per page, one div.event-item
    each, and links the next page with "Weiter" ("#" on the last page). A
    card gives weekday and date without a year ("Sa 28.11."), the time
    ("20:00 Uhr") and the film page. The film page gives the length
    ("USA 1925 · 83 min · …") and the image.
    """

    VENUE = Venue(
        name="Filmmuseum Düsseldorf",
        city="Düsseldorf",
    )
    WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]  # Python's order
    MAX_PAGES = 20  # stops a "Weiter" link that never ends

    def get(self, url: str) -> tuple[httpx.Response, BeautifulSoup]:
        response = httpx.get(url, follow_redirects=True, timeout=60)
        log.debug(f"{self.ctx} page {response.url} -> {size(response)}")
        response.raise_for_status()
        return response, BeautifulSoup(response.text, "html.parser")

    def date(self, text: str, today: datetime) -> datetime:
        """
        The date of "Sa 28.11.": this year or the next, whichever has that
        weekday on that day. The weekday of a date moves by one or two days
        from one year to the next, so only one of the two years fits.
        """
        match = re.fullmatch(r"(\w\w)\.? (\d\d)\.(\d\d)\.", text)
        if not match:
            raise ValueError(f"unknown date {text!r}")
        weekday, day, month = self.WEEKDAYS.index(match[1]), int(match[2]), int(match[3])
        for year in (today.year, today.year + 1):
            try:
                date = datetime(year, month, day)
            except ValueError:  # 29.02. in a year that has none
                continue
            if date.weekday() == weekday:
                return date
        raise ValueError(f"no year has {text!r}")

    def film(self, url: str) -> tuple[timedelta | None, str | None]:
        """Length and image from a film page; None for what it does not give."""
        response, soup = self.get(url)
        length = None
        for p in soup.select("p"):
            # e.g. "USA 1925 · 83 min · engl. Zwischentitel · digitalDCP · FSK 6"
            if match := re.search(r"·\s*(\d+)\s*min\b", p.get_text(" ")):
                length = timedelta(minutes=int(match[1]))
                break
        image = soup.select_one('meta[property="og:image"][content]')
        image_url = absolute_url(response.url, image["content"]) if image else None
        log.debug(f"{self.ctx}   {url}: length {length}, image {image_url}")
        return length, image_url

    def scrape(self) -> list[Event]:
        berlin = ZoneInfo("Europe/Berlin")
        today = datetime.now(berlin)
        events = []
        films: dict[str, tuple[timedelta | None, str | None]] = {}  # one fetch per film page
        url = self.website
        for _ in range(self.MAX_PAGES):
            response, soup = self.get(url)
            cards = soup.select("div.event-item")
            log.info(f"{self.ctx} GET {response.url} -> {size(response)}, {len(cards)} div.event-item")
            for card in cards:
                when, clock = [p.get_text(" ", strip=True) for p in card.select("p.mb-0")[:2]]
                link = card.select_one("a.mb-2[href]")
                title = link.get_text(" ", strip=True)
                film_url = absolute_url(response.url, link["href"])
                # the series is only in the path: …/kinoprogramm/stummfilm-musik/go-west-der-cowboy
                series = film_url.rstrip("/").split("/")[-2].replace("-", " ")
                starts_at = datetime.combine(
                    self.date(when, today).date(),
                    datetime.strptime(clock, "%H:%M Uhr").time(),
                    tzinfo=berlin,
                )
                if film_url not in films:
                    try:
                        films[film_url] = self.film(film_url)
                    except Exception as error:
                        # the screening is still valid without length and image
                        log.warning(f"{self.ctx} no details for {title!r}: {error!r}")
                        films[film_url] = (None, None)
                length, image_url = films[film_url]
                log.debug(f"{self.ctx}   {title!r} [{series}] {starts_at}")
                events.append(
                    Event(
                        title=title,
                        venue=self.VENUE,
                        category=self.screening_category(title, series),
                        starts_at=starts_at,
                        ends_at=starts_at + length if length else None,
                        url=film_url,
                        image_url=image_url,
                    )
                )
            # "Weiter" links the next page; on the last page it is "#"
            more = next(
                (a["href"] for a in soup.select("a[href]") if a.get_text(strip=True) == "Weiter"),
                "#",
            )
            if more == "#":
                return events
            url = absolute_url(response.url, more)
        raise RuntimeError(f"more than {self.MAX_PAGES} pages")


# name (stored as productions.source), website, organizer (shown to visitors, written out in full)
sources = [
    Filmkunstkinos(
        "filmkunstkinos", "https://filmkunstkinos.de/programm/", "Filmkunstkinos Düsseldorf"
    ),
    Dhaus(
        "dhaus", "https://www.dhaus.de/programm/spielplan/schauspiel", "Düsseldorfer Schauspielhaus"
    ),
    OperAmRhein(
        "oper-am-rhein",
        "https://www.operamrhein.de/spielplan/kalender/duesseldorf/",
        "Deutsche Oper am Rhein",
    ),
    SchauspielKoeln("schauspiel-koeln", "https://www.schauspiel.koeln/kalender", "Schauspiel Köln"),
    TheaterKrefeldMoenchengladbach(
        "theater-krefeld-moenchengladbach",
        "https://theater-kr-mg.de/kalender/",
        "Theater Krefeld und Mönchengladbach",
    ),
    OperWuppertal(
        "oper-wuppertal", "https://www.oper-wuppertal.de/", "Wuppertaler Bühnen und Sinfonieorchester"
    ),
    TheaterEssen(
        "theater-essen", "https://www.theater-essen.de/programm/kalender/", "Theater und Philharmonie Essen"
    ),
    OperKoeln("oper-koeln", "https://www.oper.koeln/programm", "Oper Köln"),
    SchauspielhausBochum(
        "schauspielhaus-bochum",
        "https://www.schauspielhausbochum.de/de/spielplan/13/schauspiel",
        "Schauspielhaus Bochum",
    ),
    PinaBausch(
        "pina-bausch", "https://www.pina-bausch.de/de/calendar", "Tanztheater Wuppertal Pina Bausch"
    ),
    UfaPalastDuesseldorf(
        "ufa-palast-duesseldorf", "https://ufa-duesseldorf.de/programm/", "UFA Palast Düsseldorf"
    ),
    UciKinowelt(
        "uci-kinowelt",
        "https://www.uci-kinowelt.de/kinoprogramm/duesseldorf/50",
        "UCI Kinowelt Düsseldorf",
    ),
    FilmmuseumDuesseldorf(
        "filmmuseum-duesseldorf",
        "https://filmmuseum-duesseldorf.de/black-box-kino/kinoprogramm",
        "Filmmuseum Düsseldorf",
    ),
]

if __name__ == "__main__":
    while True:
        failed = []
        for source in sources:
            try:
                events = source.scrape()
                log.info(f"{source.ctx} scraped {len(events)} events")
                images = source.add_images(events)
                source.save(events, images)
            except Exception:
                failed.append(source.name)
                # the traceback follows on the next lines
                log.exception(f"{source.ctx} failed, nothing saved")
        log.info(
            f"{'run':<{CTX_WIDTH}} | {len(sources) - len(failed)}/{len(sources)} sources saved"
            + (f", failed: {', '.join(failed)}" if failed else "")
            + "; next run in 24 h"
        )
        sleep(60 * 60 * 24)
