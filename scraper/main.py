from abc import ABC, abstractmethod

import httpx

class Venue(ABC):
    def __init__(self, name, website):
        self.name = name
        self.website = website

    @abstractmethod
    def scrape(self):
        ...

class Filmkunstkinos(Venue):
    def scrape(self):
        print(f"Scraping {self.name} at {self.website}")
        httpx.get(self.website)  # Placeholder for actual scraping logic
        


venues = [Filmkunstkinos("filmkunstkinos", "https://filmkunstkinos.de/programm/")]

if __name__ == "__main__":
    for venue in venues:
        venue.scrape()
