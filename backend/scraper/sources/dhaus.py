
import re
import httpx
from datetime import datetime, timedelta
from bs4 import BeautifulSoup
from zoneinfo import ZoneInfo

from core import Category, Event, Source, Venue, log, size


class Dhaus(Source):
    def scrape(self) -> list[Event]:
        response = httpx.get(self.website, follow_redirects=True, timeout=60)
        log.info(f"{self.ctx} GET {response.url} -> {size(response)}")
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        berlin = ZoneInfo("Europe/Berlin")

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
            category = self.event_category(Category.THEATER, title, *subtitles)
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
