
import re
from datetime import datetime

from core import BERLIN, Category, Event, Source, Venue, end_time_from_text, log


class Dhaus(Source):
    DEFAULT = Category.THEATER

    def scrape(self) -> list[Event]:
        response, soup = self.fetch_soup(self.website)

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
            category = self.classify(texts=[title, *subtitles])
            if not category:
                continue
            url = str(response.url.join(link["href"]))

            # "Schauspielhaus, Großes Haus": the stage; the organizer already names the house
            location = (
                performance.select_one(".performance__location")
                .get_text(strip=True)
                .removeprefix("📍")
                .strip()
            )
            building, _, stage = location.partition(",")
            name = stage.strip() or building
            address = performance.select_one(
                "[itemprop=location] [itemprop=address]"
            ).get_text(strip=True)
            city = re.fullmatch(r".*\b\d{5}\s+(.+)", address).group(1)
            venue = Venue(name=name, city=city)

            starts_at = datetime.fromisoformat(
                performance.select_one("meta[itemprop=startDate]")["content"]
            ).replace(tzinfo=BERLIN)

            # The end time is only given as text, e.g. "19:00 – 20:15".
            # Some performances list only the start time.
            time_text = performance.select_one(".performance__time").get_text(strip=True)
            ends_at = end_time_from_text(starts_at, time_text)

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
