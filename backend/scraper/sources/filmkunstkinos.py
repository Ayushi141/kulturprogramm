
import re
import httpx
from datetime import datetime, timedelta
from bs4 import BeautifulSoup
from zoneinfo import ZoneInfo

from core import Event, Source, Venue, log, size


class Filmkunstkinos(Source):
    # The program page names no city; all four cinemas are in Düsseldorf.
    # Each cinema is its own organizer (one website, four independent houses).
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
                        organizer=venue.name,
                    )
                )

        return events
