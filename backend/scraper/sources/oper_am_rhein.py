
import re
import httpx
from datetime import datetime, timedelta
from bs4 import BeautifulSoup
from zoneinfo import ZoneInfo

from core import Category, Event, Source, Venue, log, size


class OperAmRhein(Source):
    """
    One company, two houses: each city has its own calendar page
    (`website` + city key). Only the main house of each city is kept,
    as the location line names it; foyer, studio and outdoor dates are not.
    """

    HOUSES = {
        "duesseldorf": Venue(name="Opernhaus Düsseldorf", city="Düsseldorf"),
        "duisburg": Venue(name="Theater Duisburg", city="Duisburg"),
    }

    def scrape(self) -> list[Event]:
        return [e for key, venue in self.HOUSES.items() for e in self.scrape_city(key, venue)]

    def scrape_city(self, key: str, house: Venue) -> list[Event]:
        response = httpx.get(f"{self.website}{key}/", follow_redirects=True, timeout=60)
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
            location_tag = performance.select_one(".performance__location")
            location = location_tag.get_text(strip=True)
            if location != house.name:
                continue

            # e.g. "Oper", "Ballett", "Junge Oper, Konzert"; tours have none
            category_tag = performance.select_one(".performance__category")
            if not category_tag:
                continue
            label = category_tag.get_text(" ", strip=True)

            link = performance.select_one("a.performance__link")
            title_tag = link.select_one(".performance__title [itemprop=name]")
            title = title_tag.get_text(" ", strip=True).replace("\xad", "")
            # badges, e.g. "Schulvorstellung"
            attributes = [
                tag.get_text(" ", strip=True)
                for tag in performance.select(".attribute")
            ]
            category = self.event_category(
                Category.TANZ if "Ballett" in label else Category.OPER,
                title,
                label,
                *attributes,
            )
            if not category:
                continue
            url = str(response.url.join(link["href"]))

            starts_at = datetime.fromisoformat(
                performance.select_one('meta[itemprop="startDate"]')["content"]
            )
            if starts_at.tzinfo is None:
                starts_at = starts_at.replace(tzinfo=berlin)
            else:
                starts_at = starts_at.astimezone(berlin)

            time_tag = performance.select_one(
                ".performance__col--date .performance__time"
            )
            time_text = time_tag.get_text(" ", strip=True)
            end_match = re.search(
                r"\b\d{1,2}:\d{2}\s*[-–]\s*(\d{1,2}:\d{2})\b",
                time_text,
            )
            ends_at = None
            if end_match:
                end_clock = datetime.strptime(end_match[1], "%H:%M").time()
                ends_at = datetime.combine(
                    starts_at.date(), end_clock, tzinfo=berlin
                )
                if ends_at <= starts_at:
                    ends_at += timedelta(days=1)

            log.debug(f"{self.ctx}   {title!r} at {house.name}: {starts_at} - {ends_at}")
            events.append(
                Event(
                    title=title,
                    venue=house,
                    category=category,
                    starts_at=starts_at,
                    ends_at=ends_at,
                    url=url,
                )
            )
        return events
