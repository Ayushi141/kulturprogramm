
import re
from datetime import datetime
from bs4 import Tag

from core import BERLIN, Category, Event, Source, Venue, absolute_url, end_time_from_text, log, size


class TheaterDortmund(Source):
    """
    The calendar lists 15 events per page and links the next page with "»".
    A div.event carries its start as Unix time (data-start; 0 marks dates
    booked by schools, mobile plays); data-endtime is always 6 hours later,
    so the end comes from the time line ("19:00 Uhr – 22:00 Uhr"). Its division
    ("Oper", "Ballett", "Philharmoniker", "Schauspiel") gives the category; the
    youth theatre ("KJT") is skipped. The first span in .event__details names the
    venue, often with an address in brackets.
    """

    CITY = "Dortmund"
    DIVISIONS = {
        "Oper": Category.OPER,
        "Ballett": Category.TANZ,
        "Philharmoniker": Category.CONCERT,
        "Schauspiel": Category.THEATER,
    }
    SKIPPED = {"KJT"}  # Kinder- und Jugendtheater
    # The house orchestra: events of the "Philharmoniker" division are its own.
    ORCHESTRA = "Dortmunder Philharmoniker"
    # A venue named after another theatre or a festival: a guest performance
    # in another city ("Theater Bonn", "55. Hong Kong Arts Festival (…)").
    ELSEWHERE = re.compile(r"^Theater (?!Dortmund\b)\S+$|\bFestival\b")
    MAX_PAGES = 60

    def venue(self, details: Tag | None) -> Venue | None:
        """The venue of an event, without an address in brackets; None: not public or elsewhere."""
        spans = [s.get_text(" ", strip=True) for s in details.select(":scope > span")] if details else []
        place = next((s for s in spans if not re.match(r"\d{1,2}:\d{2} Uhr", s)), None)
        if place is None:
            return Venue(name=self.organizer, city=self.CITY)  # the calendar names no venue
        if place == "Mobile Vorstellung" or self.ELSEWHERE.search(place):
            return None
        # "Fritz-Henßler-Haus (Geschwister-Scholl-Straße 33)": brackets with a digit are an address
        name = re.sub(r"\s*\([^)]*\d[^)]*\)", "", place).strip()
        return Venue(name=name, city=self.CITY)

    # The production page has no og:image. Its header photo is a CSS
    # background, one rule per screen width; the last rule is the widest.
    HEADER_IMAGE = re.compile(r"#tx-ra-eventim-header-\d+\s*\{\s*background-image:\s*url\(['\"]?([^'\")]+)")

    def scrape_image(self, event: Event) -> str | None:
        """URL of the widest header photo on the event's production page, or None."""
        if not event.url:
            return None
        response = self.fetch(event.url, detail=True)
        found = self.HEADER_IMAGE.findall(response.text)
        log.debug(f"{self.ctx}   header image {found[-1] if found else None}")
        return absolute_url(response.url, found[-1]) if found else None

    def scrape(self) -> list[Event]:
        events = []
        url = self.website
        for _ in range(self.MAX_PAGES):
            # one INFO line per page, with the number of cards
            response, soup = self.fetch_soup(url, detail=True)
            cards = soup.select("div.event")
            log.info(f"{self.ctx} GET {response.url} -> {size(response)}, {len(cards)} div.event")
            for card in cards:
                start = int(card.get("data-start") or 0)
                if not start:
                    continue
                title = card.select_one("h2").get_text(" ", strip=True).replace("\xad", "")
                division_tag = card.select_one(".event__division")
                division = division_tag.get_text(" ", strip=True) if division_tag else ""
                if division in self.SKIPPED:
                    continue
                details = card.select_one(".event__details")
                subtitle = details.select_one("p") if details else None
                category = self.event_category(
                    self.DIVISIONS.get(division, Category.THEATER),
                    title,
                    division,
                    subtitle.get_text(" ", strip=True) if subtitle else "",
                )
                venue = self.venue(details)
                if not category or not venue:
                    log.debug(f"{self.ctx}   skipped {title!r} ({division}, {venue})")
                    continue
                starts_at = datetime.fromtimestamp(start, BERLIN)
                link = card.select_one(".event__info a[href]")
                events.append(
                    Event(
                        title=title,
                        venue=venue,
                        category=category,
                        starts_at=starts_at,
                        ends_at=end_time_from_text(starts_at, details.get_text(" ", strip=True)) if details else None,
                        url=absolute_url(response.url, link["href"]) if link else None,
                        organizer=self.ORCHESTRA if division == "Philharmoniker" else None,
                    )
                )
            more = next((a for a in soup.select("a.page-link[href]") if a.get_text(strip=True) == "»"), None)
            if not more:
                return events
            url = absolute_url(response.url, more["href"])
        raise RuntimeError(f"more than {self.MAX_PAGES} pages")
