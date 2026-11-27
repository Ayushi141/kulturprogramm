
import json
import re
import httpx
from datetime import datetime
from zoneinfo import ZoneInfo

from core import Category, Event, Source, Venue, absolute_url, log, size


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
            response = httpx.get(url, follow_redirects=True, timeout=60)
            log.debug(f"{self.ctx} page {response.url} -> {size(response)}")
            response.raise_for_status()
            props = json.loads(self.PAGE_DATA.search(response.text)[1])["props"]
        except Exception as error:
            log.warning(f"{self.ctx} no event page {url}: {error!r}")
            return None, None
        hall = next((i["text"] for i in props["event"].get("iconTextList", []) if i["icon"] == "marker"), None)
        return hall, props.get("meta", {}).get("ogImage")

    def scrape(self) -> list[Event]:
        items, offset = [], 0
        for _ in range(self.MAX_PAGES):
            response = httpx.get(self.API, params={"type": "dynamic", "size": 500, "from": offset}, timeout=60)
            log.info(f"{self.ctx} GET {response.url} -> {size(response)}")
            response.raise_for_status()
            data = response.json()
            items += data["events"]
            offset = data.get("nextOffset")
            if not offset:
                break
        else:
            raise RuntimeError(f"more than {self.MAX_PAGES} pages")
        response = httpx.get(f"{self.API}/metadata", timeout=60)
        response.raise_for_status()
        states = {m["evisId"]: m["state"] for m in response.json()}

        berlin = ZoneInfo("Europe/Berlin")
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
                        starts_at=datetime.fromisoformat(iso).astimezone(berlin),
                        ends_at=None,  # neither the list nor the page gives an end
                        url=url,
                        image_url=image_url,
                    )
                )
        return events
