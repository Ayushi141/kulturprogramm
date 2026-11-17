from abc import ABC, abstractmethod
from dataclasses import dataclass

import os
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
    def scrape(self) -> list[Event]:
        ...


    def save(self, events: list[Event]) -> None:
        rows = [(e.title, e.venue, e.category.value, e.starts_at) for e in events]
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

            venue = article.select_one("span.meta-theater-logo").get_text(strip=True)

            for time_element in article.select("time[datetime]"):
                starts_at = datetime.fromisoformat(time_element["datetime"]).replace(
                    tzinfo=ZoneInfo("Europe/Berlin")
                )
                events.append(
                    Event(
                        title=title,
                        venue=venue,
                        category=Category.FILM,
                        starts_at=starts_at,
                    )
                )
        
        return events

class DüssSpielhaus(Venue):
    def scrape(self) -> list[Event]:
        response = httpx.get(self.website, follow_redirects=True, timeout=60)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        events = []
        for article in soup.select("article.teaser"):
            link = article.select_one("h2.teaser__title a")
            title = link.get_text(strip=True)

            venue = "Düsseldorfer Schauspielhaus"

            for time_element in article.select("time[datetime]"):
                starts_at = datetime.fromisoformat(time_element["datetime"]).replace(
                    tzinfo=ZoneInfo("Europe/Berlin")
                )
                events.append(
                    Event(
                        title=title,
                        venue=venue,
                        category=Category.THEATER,
                        starts_at=starts_at,
                    )
                )
        
        return events


venues = [
    Filmkunstkinos("filmkunstkinos", "https://filmkunstkinos.de/programm/"),
    DüssSpielhaus("düsselspielhaus", "https://www.dhaus.de/programm/spielplan/schauspiel")
]

if __name__ == "__main__":
    while True:
        for venue in venues:
            events =venue.scrape()
            venue.save(events)
            print(f"Scraped {len(events)} events from {venue.name}")
        sleep(60*60*3)
