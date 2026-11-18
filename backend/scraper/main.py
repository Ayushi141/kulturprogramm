from abc import ABC, abstractmethod
from dataclasses import dataclass

import os
import re
import traceback
import httpx
import psycopg
from enum import StrEnum
from datetime import datetime, timedelta
from bs4 import BeautifulSoup
from pathlib import Path
from zoneinfo import ZoneInfo
from time import sleep


class Category(StrEnum):
    FILM = "film"
    THEATER = "theater"
    OPER = "oper"
    CONCERT = "konzert"


@dataclass(frozen=True)
class Location:
    id: str
    name: str
    city: str


@dataclass
class Event(ABC):
    title: str
    location: Location
    category: Category
    starts_at: datetime
    ends_at: datetime | None
    url: str | None


def slugify(text: str) -> str:
    text = text.lower()
    for umlaut, replacement in {"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"}.items():
        text = text.replace(umlaut, replacement)
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


class Venue(ABC):
    def __init__(self, name, website):
        self.name = name
        self.website = website

    @abstractmethod
    def scrape(self) -> list[Event]: ...

    def save(self, events: list[Event]) -> None:
        locations = {e.location for e in events}
        location_rows = [(l.id, l.name, l.city) for l in locations]
        event_rows = [
            (
                e.title,
                e.location.id,
                e.category.value,
                e.starts_at,
                e.ends_at,
                e.url,
            )
            for e in events
        ]
        password = Path(os.environ["PGPASSWORD_FILE"]).read_text().strip()

        with psycopg.connect(password=password) as conn:
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
                location_rows,
            )
            cursor.executemany(
                """
                INSERT INTO events
                    (title, venue_id, category, starts_at, ends_at, url)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (title, venue_id, starts_at)
                DO UPDATE SET
                    category = EXCLUDED.category,
                    ends_at = EXCLUDED.ends_at,
                    url = EXCLUDED.url,
                    updated_at = now()
                """,
                event_rows,
            )


class Filmkunstkinos(Venue):
    def scrape(self) -> list[Event]:
        response = httpx.get(self.website, follow_redirects=True, timeout=60)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        events = []
        for article in soup.select("article.col-group"):
            link = article.select_one("h2.movie-small--title a")
            title = link.find(string=True, recursive=False).strip()

            venue = article.select_one("span.meta-theater-logo").get_text(
                strip=True
            )

            for time_element in article.select("time[datetime]"):
                starts_at = datetime.fromisoformat(
                    time_element["datetime"]
                ).replace(tzinfo=ZoneInfo("Europe/Berlin"))
                events.append(
                    Event(
                        title=title,
                        venue=venue,
                        category=Category.FILM,
                        starts_at=starts_at,
                    )
                )

        return events


class Dhaus(Venue):
    def scrape(self) -> list[Event]:
        response = httpx.get(self.website, follow_redirects=True, timeout=60)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        berlin = ZoneInfo("Europe/Berlin")

        events = []
        for performance in soup.select("div.performance"):
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
            location = Location(
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

            events.append(
                Event(
                    title=title,
                    location=location,
                    category=Category.THEATER,
                    starts_at=starts_at,
                    ends_at=ends_at,
                    url=url,
                )
            )
        return events


class SchauspielKoeln(Venue):
    EXCLUDED_LABELS = {"Führung", "Workshop"}

    def scrape(self) -> list[Event]:
        response = httpx.get(self.website, follow_redirects=True, timeout=60)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        events = []
        for activity in soup.select("li.s-bko-activity"):
            label_tag = activity.select_one(".field--name-category")
            label = label_tag.get_text(strip=True) if label_tag else ""
            if label in self.EXCLUDED_LABELS:
                continue

            title = activity.select_one(".field--name-production a").get_text(
                strip=True
            )

            time_tag = activity.select_one("time.s-bko-activity__datetime")
            clock = list(time_tag.stripped_strings)[-1]
            starts_at = datetime.strptime(
                f"{time_tag['datetime']} {clock}", "%Y-%m-%d %H.%M Uhr"
            ).replace(tzinfo=ZoneInfo("Europe/Berlin"))

            category = (
                Category.CONCERT if label == "Konzert" else Category.THEATER
            )
            events.append(
                Event(
                    title=title,
                    venue="Schauspiel Köln",
                    category=category,
                    starts_at=starts_at,
                )
            )

        return events


venues = [
    Filmkunstkinos("filmkunstkinos", "https://filmkunstkinos.de/programm/"),
    Dhaus("dhaus", "https://www.dhaus.de/programm/spielplan/schauspiel"),
    SchauspielKoeln(
        "schauspiel-koeln", "https://www.schauspiel.koeln/kalender"
    ),
]

if __name__ == "__main__":
    while True:
        for venue in venues:
            try:
                events = venue.scrape()
                venue.save(events)
            except Exception:
                print(f"Failed to scrape {venue.name}:", flush=True)
                traceback.print_exc()
                continue
            print(f"Scraped {len(events)} events from {venue.name}", flush=True)
        sleep(60 * 60 * 24)
