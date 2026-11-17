from abc import ABC, abstractmethod
from dataclasses import dataclass

import httpx
from datetime import datetime
from bs4 import BeautifulSoup

@dataclass
class Event(ABC):
    title: str
    venue: str
    dates: list[datetime]

class Venue(ABC):
    def __init__(self, name, website):
        self.name = name
        self.website = website
        self.events : list[Event] = []

    @abstractmethod
    def scrape(self) -> list[Event]:
        ...

class Filmkunstkinos(Venue):
    def scrape(self):
        response = httpx.get(self.website, follow_redirects=True, timeout=20)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")

        for article in soup.select("article.col-group"):
            link = article.select_one("h2.movie-small--title a")
            title = link.find(string=True, recursive=False).strip()

            dates = [
                datetime.fromisoformat(t["datetime"]).replace(tzinfo=None)
                for t in article.select("time[datetime]")
            ]

            self.events.append(Event(title=title, venue=self.name, dates=dates))
        
        print(f"Scraped {len(self.events)} events from {self.name}")

venues = [Filmkunstkinos("filmkunstkinos", "https://filmkunstkinos.de/programm/")]

if __name__ == "__main__":
    for venue in venues:
        venue.scrape()
