from abc import ABC, abstractmethod
from dataclasses import dataclass

import os
import traceback
import httpx
import psycopg
from enum import StrEnum
from datetime import datetime
from bs4 import BeautifulSoup
from pathlib import Path
from zoneinfo import ZoneInfo
from time import sleep


class Category(StrEnum):
    FILM = "film"
    THEATER = "theater"
    OPER = "oper"
    CONCERT = "konzert"


@dataclass
class Event(ABC):
    title: str
    venue: str
    category: Category
    starts_at: datetime


class Venue(ABC):
    def __init__(self, name, website):
        self.name = name
        self.website = website

    @abstractmethod
    def scrape(self) -> list[Event]: ...

    def save(self, events: list[Event]) -> None:
        rows = [
            (e.title, e.venue, e.category.value, e.starts_at) for e in events
        ]
        password = Path(os.environ["PGPASSWORD_FILE"]).read_text().strip()

        with psycopg.connect(password=password) as conn:
            conn.cursor().executemany(
                """
                INSERT INTO events (title, venue, category, starts_at)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (title, venue, starts_at)
                DO UPDATE SET
                    category = EXCLUDED.category,
                    updated_at = now()
                """,
                rows,
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

        events = []
        for performance in soup.select("div.performance"):
            title = performance.select_one(
                ".performance__title [itemprop=name]"
            ).get_text(strip=True)

            venue = (
                performance.select_one(".performance__location")
                .get_text(strip=True)
                .removeprefix("📍")
                .strip()
            )

            starts_at = datetime.fromisoformat(
                performance.select_one("meta[itemprop=startDate]")["content"]
            ).replace(tzinfo=ZoneInfo("Europe/Berlin"))

            events.append(
                Event(
                    title=title,
                    venue=venue,
                    category=Category.THEATER,
                    starts_at=starts_at,
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
