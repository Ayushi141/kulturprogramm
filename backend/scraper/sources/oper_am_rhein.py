
from datetime import datetime

from core import BERLIN, Category, Event, Source, Venue, end_time_from_text, log


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
        response, soup = self.fetch_soup(f"{self.website}{key}/")

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
            # The label is free text ("Junge Oper, Konzert"): read as a text.
            category = self.classify(
                texts=[title, label, *attributes],
                default=Category.TANZ if "Ballett" in label else Category.OPER,
            )
            if not category:
                continue
            url = str(response.url.join(link["href"]))

            starts_at = datetime.fromisoformat(
                performance.select_one('meta[itemprop="startDate"]')["content"]
            )
            if starts_at.tzinfo is None:
                starts_at = starts_at.replace(tzinfo=BERLIN)
            else:
                starts_at = starts_at.astimezone(BERLIN)

            time_tag = performance.select_one(
                ".performance__col--date .performance__time"
            )
            time_text = time_tag.get_text(" ", strip=True)
            ends_at = end_time_from_text(starts_at, time_text)

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
