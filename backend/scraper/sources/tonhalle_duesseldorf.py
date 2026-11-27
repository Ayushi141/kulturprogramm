
import json
import re
import httpx
from datetime import datetime

from core import BERLIN, Category, Event, Source, Venue, absolute_url, log


class TonhalleDuesseldorf(Source):
    """
    The calendar reads /api/events?type=dynamic (upcoming events, pages by
    nextOffset). An event has one or more dates (isoDateStrings, UTC) with
    one ticket id each (projectEventEvisIds); /api/events/metadata gives each
    ticket id's state. The second path part of the link is the series:
    "komet" is the guest promoters' programme (pop tours, comedy, readings)
    and is skipped, as the halls' own programme is what this source shows.
    The event page names the hall and holds the share image.
    """

    CITY = "Düsseldorf"
    API = "https://www.tonhalle.de/api/events"
    SKIPPED_SERIES = {"komet"}
    SKIPPED_STATES = {"CANCELLED", "POSTPONED"}
    PAGE_DATA = re.compile(r'<script data-page="app" type="application/json">(.*?)</script>', re.S)
    MAX_PAGES = 20

    def page(self, url: str) -> tuple[str | None, str | None]:
        """The hall ("Mendelssohn-Saal") and share image of an event page; (None, None) if it fails."""
        try:
            response = self.fetch(url, detail=True)
            props = json.loads(self.PAGE_DATA.search(response.text)[1])["props"]
        except Exception as error:
            log.warning(f"{self.ctx} no event page {url}: {error!r}")
            return None, None
        hall = next((i["text"] for i in props["event"].get("iconTextList", []) if i["icon"] == "marker"), None)
        return hall, props.get("meta", {}).get("ogImage")

    def scrape(self) -> list[Event]:
        items, offset = [], 0
        for _ in range(self.MAX_PAGES):
            response = self.fetch(self.API, params={"type": "dynamic", "size": 500, "from": offset})
            data = response.json()
            items += data["events"]
            offset = data.get("nextOffset")
            if not offset:
                break
        else:
            raise RuntimeError(f"more than {self.MAX_PAGES} pages")
        response = self.fetch(f"{self.API}/metadata", detail=True)
        states = {m["evisId"]: m["state"] for m in response.json()}

        events = []
        for item in items:
            # "/veranstaltung/<series>/<id>-<slug>"; some links have no series
            parts = item["link"].strip("/").split("/")
            series = parts[1] if len(parts) == 3 else ""
            title = item["title"].strip()
            category = self.event_category(Category.CONCERT, title, item.get("subTitle") or "")
            if series in self.SKIPPED_SERIES or not category:
                log.debug(f"{self.ctx}   skipped {title!r} ({series})")
                continue
            url = absolute_url(httpx.URL(self.API), item["link"])
            hall, image_url = self.page(url)
            venue = Venue(name=hall or self.organizer, city=self.CITY)
            for iso, ticket in zip(item["isoDateStrings"], item["projectEventEvisIds"], strict=True):
                if states.get(ticket) in self.SKIPPED_STATES:
                    continue
                events.append(
                    Event(
                        title=title,
                        venue=venue,
                        category=category,
                        starts_at=datetime.fromisoformat(iso).astimezone(BERLIN),
                        ends_at=None,  # neither the list nor the page gives an end
                        url=url,
                        image_url=image_url,
                    )
                )
        return events
