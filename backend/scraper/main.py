from abc import ABC, abstractmethod
from dataclasses import dataclass

import os
import httpx
import psycopg
from datetime import datetime
from bs4 import BeautifulSoup
from pathlib import Path
from zoneinfo import ZoneInfo

@dataclass
class Event(ABC):
    title: str
    venue: str
    dates: list[datetime]

class Venue(ABC):
    def __init__(self, name, website):
        self.name = name
        self.website = website

    @abstractmethod
    def scrape(self) -> list[Event]:
        ...

    def save(self, events: list[Event]) -> None:
        rows = [(e.title, e.venue, d) for e in events for d in e.dates]

        with psycopg.connect("localhost:5432") as conn:
            conn.cursor().executemany(
                """
                INSERT INTO events (title, venue, starts_at)
                VALUES (%s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                rows,
            )

class Filmkunstkinos(Venue):
    def scrape(self) -> List[Event]:
        response = httpx.get(self.website, follow_redirects=True, timeout=60)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        events = []
        for article in soup.select("article.col-group"):
            link = article.select_one("h2.movie-small--title a")
            title = link.find(string=True, recursive=False).strip()

            dates = [
                datetime.fromisoformat(t["datetime"]).replace(tzinfo=ZoneInfo("Europe/Berlin"))
                for t in article.select("time[datetime]")
            ]

            events.append(Event(title=title, venue=self.name, dates=dates))
        
        return events

def save(events: list[Event]) -> None:
    rows = [(e.title, e.venue, d) for e in events for d in e.dates]
    password = Path(os.environ["PGPASSWORD_FILE"]).read_text().strip()

    with psycopg.connect(password=password) as conn:
        conn.cursor().executemany(
            """
            INSERT INTO events (title, venue, starts_at)
            VALUES (%s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            rows,
        )


venues = [Filmkunstkinos("filmkunstkinos", "https://filmkunstkinos.de/programm/")]

if __name__ == "__main__":
    for venue in venues:
        events =venue.scrape()
        save(events)
        print(f"Scraped {len(events)} events from {venue.name}")