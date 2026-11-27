"""The scraper's shared code: data model, images, saving, and the Source base class."""

from abc import ABC, abstractmethod
from dataclasses import dataclass

import hashlib
import io
import logging
import os
import re
import sys
import httpx
import psycopg
from enum import StrEnum
from datetime import datetime, timedelta
from bs4 import BeautifulSoup
from pathlib import Path
from PIL import Image, ImageOps
from zoneinfo import ZoneInfo


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
# All sites give local times: make them aware with this zone.
BERLIN = ZoneInfo("Europe/Berlin")


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
    # Who hosts this date, when it differs per event; else the source's organizer.
    organizer: str | None = None


@dataclass(frozen=True)
class StoredImage:
    key: str
    source_url: str
    content_type: str
    data: bytes


@dataclass(frozen=True)
class Saved:
    """What one Source.save() wrote: the counts for the run report."""
    images: int  # new images (known ones are not saved again)
    productions: int
    new_productions: int  # not in the database before: the enricher looks these up
    events: int


def connect() -> psycopg.Connection:
    password = Path(os.environ["PGPASSWORD_FILE"]).read_text().strip()
    return psycopg.connect(password=password)


def send_telegram(text: str) -> None:
    """
    Sends `text` to the Telegram chat TELEGRAM_CHAT_ID through the bot
    TELEGRAM_BOT_TOKEN (both from backend/deploy/.env). Without them: does
    nothing. Never raises: a failed report must not stop a run. The enricher
    has a copy of this function.
    """
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        return
    try:
        httpx.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text[:4096]},  # Telegram's limit
            timeout=10,
        ).raise_for_status()
    except Exception as error:
        # the token is in the URL: log only the error type and the status
        status = getattr(getattr(error, "response", None), "status_code", "")
        log.warning(f"{'telegram':<{CTX_WIDTH}} | report not sent: {type(error).__name__} {status}")


# Longest side of a stored image. Larger ones are shrunk: the site shows them
# at a few hundred pixels (a full-screen poster at most), and serves the stored
# bytes to every visitor. After lowering it, run shrink_stored() once.
MAX_SIDE = 1200
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
    return stored_image(response.content, source_url, ctx)


def stored_image(data: bytes, source_url: str, ctx: str) -> StoredImage:
    """The image to store for these bytes: the bytes themselves, or shrunk to MAX_SIDE."""
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


def shrink_stored() -> None:
    """
    Shrinks the stored images that are larger than MAX_SIDE. Run it once after
    lowering MAX_SIDE:
        docker compose -p deploy exec scraper python -c "import core; core.shrink_stored()"
    A shrunk image gets a new key (the hash of its new bytes): productions move
    to the new key and the old row is deleted. One transaction: a failure
    changes nothing.
    """
    ctx = f"{'shrink-stored':<{CTX_WIDTH}} |"
    with connect() as conn:
        keys = [row[0] for row in conn.execute("SELECT key FROM images").fetchall()]
        shrunk = saved = 0
        for key in keys:  # one image in memory at a time
            source_url, data = conn.execute(
                "SELECT source_url, data FROM images WHERE key = %s", [key]
            ).fetchone()
            with Image.open(io.BytesIO(data)) as image:  # reads the header only
                if max(image.size) <= MAX_SIDE:
                    continue
            new = stored_image(bytes(data), source_url, ctx)
            conn.execute(
                """
                INSERT INTO images (key, source_url, content_type, data)
                VALUES (%s, %s, %s, %s) ON CONFLICT (key) DO NOTHING
                """,
                [new.key, new.source_url, new.content_type, new.data],
            )
            conn.execute("UPDATE productions SET image_key = %s WHERE image_key = %s", [new.key, key])
            conn.execute("DELETE FROM images WHERE key = %s", [key])
            shrunk += 1
            saved += len(data) - len(new.data)
    log.info(f"{ctx} {shrunk} of {len(keys)} images shrunk, {saved / 1e6:.1f} MB saved")


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
        # "19:00 – 22:00", "19:00 Uhr – 22:00 Uhr"
        r"\b\d{1,2}:\d{2}(?:\s*Uhr)?\s*(?:-|–|—|\bbis\b)\s*(\d{1,2}:\d{2})\b",
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
    # Closed performances: booked by schools or kindergartens, by groups only, or not on sale.
    CLOSED = re.compile(
        r"\b(?:\w*schul(?:vorstellung|konzert)\w*|kita\w*|\w*kindergarten\w*|"
        r"für\s+\w*schulen|geschlossene\s+(?:vorstellung|veranstaltung)\w*|nur\s+gruppenbuchung\w*)\b",
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
        r"diskussion\w*|moderation|salon\w*|soiree|\w*matinee|\w*partys?)\b",
        re.IGNORECASE,
    )

    def __init__(self, name: str, website: str, organizer: str | None):
        """
        `name`: the key of the website, stored as `productions.source`.
        `organizer`: who hosts its events, shown to visitors, written out in
        full. None: the source sets `Event.organizer` on every event (several
        independent organizers on one website, like the Filmkunstkinos).
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

    # The site's own labels (division, genre, branch, series, audience) and
    # what each one means: a category, or None to skip events with this
    # label. Matched exactly, never as words. Each source sets its own.
    LABELS: dict[str, Category | None] = {}
    # The category of an event whose labels give none; None skips it.
    DEFAULT: Category | None = None
    # classify(default=…) when a source computes the default per event
    _UNSET = object()

    def classify(
        self,
        labels: tuple[str, ...] | list[str] = (),
        texts: tuple[str, ...] | list[str] = (),
        info: tuple[str, ...] | list[str] = (),
        default: "Category | None | object" = _UNSET,
    ) -> Category | None:
        """
        The one decision for every event: its category, or None to skip it.

        `labels`: the site's labels of the event, looked up in LABELS.
        `texts`: short texts (title, subtitle, badges; never descriptions),
        matched against the word lists. `info`: info and ticket lines, checked
        for CLOSED only. `default`: replaces DEFAULT for this event.

        In this order:
        1. A label that LABELS maps to None skips the event.
        2. CLOSED in the texts or the info lines skips it (school, Kita).
        3. A CONCERT word in the texts gives CONCERT. It wins over 4
           ("Benefiz-Matinee" with the subtitle "Konzert").
        4. A NON_PERFORMANCE word in the texts skips it (tours, workshops).
        5. The first label that LABELS maps to a category gives it (in the
           order of LABELS, so the table also sets the priority), else the
           default; a None default skips the event.
        """
        if any(label in self.LABELS and self.LABELS[label] is None for label in labels):
            return None
        # "+ Einführung", "+ Gespräch": an extra before or after a performance
        text = " ".join(re.sub(r"\+[^+]*", " ", t) for t in texts)
        if self.CLOSED.search(text) or any(self.CLOSED.search(line) for line in info):
            return None
        if self.CONCERT.search(text):
            return Category.CONCERT
        if self.NON_PERFORMANCE.search(text):
            return None
        found = next((c for label, c in self.LABELS.items() if c is not None and label in labels), None)
        if found:
            return found
        return self.DEFAULT if default is self._UNSET else default

    def screening_category(self, title: str, *labels: str) -> Category:
        """
        The category of a cinema screening: TANZ or OPER when its labels
        (genre, series badge) name a ballet or opera broadcast, CONCERT for a
        concert word in the title or labels ("Weihnachtskonzert", "Live
        Viewing"), otherwise FILM. Unlike classify() it skips nothing.
        """
        text = " ".join(labels)
        if self.DANCE_LABEL.search(text):
            return Category.TANZ
        if self.OPERA_LABEL.search(text):
            return Category.OPER
        if self.CONCERT.search(f"{title} {text}"):
            return Category.CONCERT
        return Category.FILM

    def fetch(self, url: str, *, detail: bool = False, **kwargs) -> httpx.Response:
        """
        GETs `url` (redirects followed, 60 s timeout), logs it and raises on an
        error status. `detail`: a detail page, logged at DEBUG only (a run
        opens many). Other keyword arguments go to httpx.get (headers, params).
        """
        response = httpx.get(url, follow_redirects=True, timeout=60, **kwargs)
        if detail:
            log.debug(f"{self.ctx} page {response.url} -> {size(response)}")
        else:
            log.info(f"{self.ctx} GET {response.url} -> {size(response)}")
        response.raise_for_status()
        return response

    def fetch_soup(self, url: str, *, detail: bool = False, **kwargs) -> tuple[httpx.Response, BeautifulSoup]:
        """fetch(), then the parsed HTML. The response gives the final URL (for absolute_url)."""
        response = self.fetch(url, detail=detail, **kwargs)
        return response, BeautifulSoup(response.text, "html.parser")

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
        response, soup = self.fetch_soup(event.url, detail=True)
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

    def save(self, events: list[Event], images: list[StoredImage]) -> Saved:
        """
        Upserts new images and the productions, then the events with their
        organizer, venue and city. Writes only the scraper's columns of `productions`:
        the enricher's notes stay as they are. Returns the counts.
        """
        image_rows = [
            (i.key, i.source_url, i.content_type, i.data) for i in images
        ]
        # one row per title; the last event of a title wins
        productions = {
            e.title: (self.name, e.title, e.category.value, e.image_key)
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
            new_productions = 0
            for row in productions.values():
                production_ids[row[1]], inserted = cursor.execute(
                    """
                    INSERT INTO productions (source, title, category, image_key)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (source, title)
                    DO UPDATE SET
                        category = EXCLUDED.category,
                        -- a failed image lookup keeps the image found earlier
                        image_key = COALESCE(EXCLUDED.image_key, productions.image_key)
                    -- xmax (a PostgreSQL system column) is 0 in a new row and set in an
                    -- updated one: so this tells an insert from an update
                    RETURNING id, xmax = 0
                    """,
                    row,
                ).fetchone()
                new_productions += inserted
            cursor.executemany(
                """
                INSERT INTO events
                    (production_id, organizer, venue, city, starts_at, ends_at, url)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (production_id, venue, city, starts_at)
                DO UPDATE SET
                    organizer = EXCLUDED.organizer,
                    ends_at = EXCLUDED.ends_at,
                    url = EXCLUDED.url,
                    updated_at = now()
                """,
                [
                    (production_ids[e.title], e.organizer or self.organizer, e.venue.name, e.venue.city, e.starts_at, e.ends_at, e.url)
                    for e in events
                ],
            )
        log.info(
            f"{self.ctx} saved {len(image_rows)} images,"
            f" {len(productions)} productions, {len(events)} events"
        )
        return Saved(len(image_rows), len(productions), new_productions, len(events))
