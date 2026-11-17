from abc import ABC, abstractmethod

import httpx
from datetime import datetime
from bs4 import BeautifulSoup

class Venue(ABC):
    def __init__(self, name, website):
        self.name = name
        self.website = website

    @abstractmethod
    def scrape(self):
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

            print(title, dates)
venues = [Filmkunstkinos("filmkunstkinos", "https://filmkunstkinos.de/programm/")]

if __name__ == "__main__":
    for venue in venues:
        venue.scrape()
