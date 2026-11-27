
import json
from datetime import datetime

from core import BERLIN, Category, Event, Source, Venue, absolute_url, log


class PinaBausch(Source):
    """
    The calendar page is rendered in the browser from the JSON in its
    data-page attribute, which holds the whole season. The home page shows
    only the next few dates.
    """

    CITY = "Wuppertal"

    def scrape(self) -> list[Event]:
        response, soup = self.fetch_soup(self.website, headers={"User-Agent": "Mozilla/5.0"})
        page = json.loads(soup.select_one("[data-page]")["data-page"])

        events = []
        dates = [d for month in page["props"]["months"] for d in month["dates"]]
        log.info(f"{self.ctx} found {len(dates)} dates")
        for date in dates:
            piece = date["event"]
            place = piece["place"]
            # performances link the pieces played; labs and classes none
            if place["city"] != self.CITY or not piece["plays"]:
                continue

            venue = Venue(name=place["name"], city=place["city"])
            events.append(
                Event(
                    title=piece["title"].replace("\xad", "").strip(),
                    venue=venue,
                    category=Category.TANZ,
                    # UTC, e.g. "2027-01-15T18:30:00.000000Z"
                    starts_at=datetime.fromisoformat(
                        date["date_time"]
                    ).astimezone(BERLIN),
                    ends_at=None,
                    url=absolute_url(response.url, piece["route"]),
                )
            )
        return events

    def scrape_image(self, event: Event) -> str | None:
        """The share image from the event page's data-page (no og:image)."""
        response, soup = self.fetch_soup(event.url, detail=True, headers={"User-Agent": "Mozilla/5.0"})
        page = json.loads(soup.select_one("[data-page]")["data-page"])
        return page["props"]["event"]["data"]["meta"]["thumbnail"]
