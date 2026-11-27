
import httpx
from datetime import datetime

from core import BERLIN, Category, Event, Source, Venue, absolute_url, log


class KoelnerPhilharmonie(Source):
    """
    The concert calendar reads /de/api/events/?date=<from> (10 per page,
    "next" links the following page). An event has genres, a room with its
    venue and city, aware start and end times and a share image. The genre
    "Sonstiges (Lesungen, Kabarett)" marks readings and cabaret, and
    "Begleitprogramm" talks around concerts: both are skipped.
    """

    API = "https://www.koelner-philharmonie.de/de/api/events/"
    SKIPPED_GENRES = {"Sonstiges (Lesungen, Kabarett)", "Begleitprogramm"}
    # genre -> category; the first in this order wins, else CONCERT
    GENRES = {
        "Tanz": Category.TANZ,
        "Oper": Category.OPER,
        "Operette": Category.OPER,
        "Oper/Operette konzertant": Category.OPER,
    }
    MAX_PAGES = 100

    def scrape(self) -> list[Event]:
        items = []
        url = f"{self.API}?date={datetime.now(BERLIN).date().isoformat()}"
        for _ in range(self.MAX_PAGES):
            response = self.fetch(url, detail=True)  # 30+ pages: one INFO line after the loop
            data = response.json()
            items += data["results"]
            url = data["next"]
            if not url:
                break
        else:
            raise RuntimeError(f"more than {self.MAX_PAGES} pages")
        log.info(f"{self.ctx} GET {self.API} -> {len(items)} events of {data['count']}")

        base = httpx.URL(self.API)
        events = []
        for item in items:
            title = item["name"].strip()
            genres = [g["name"] for g in item["genres"]]
            default = next((c for g, c in self.GENRES.items() if g in genres), Category.CONCERT)
            # "Familienkonzert", "Grundschulkonzert", "Geschlossene Veranstaltung"
            category = self.event_category(default, title, item.get("subtitle") or "")
            if not category or self.SKIPPED_GENRES.intersection(genres):
                log.debug(f"{self.ctx}   skipped {title!r} ({genres})")
                continue
            room = item["room"]
            starts_at = datetime.fromisoformat(item["date_start"]).astimezone(BERLIN)
            ends_at = datetime.fromisoformat(item["date_end"]).astimezone(BERLIN) if item.get("date_end") else None
            image = (item.get("header_image_thumbs") or {}).get("og_image")
            events.append(
                Event(
                    title=title,
                    # "Kölner Philharmonie", "COMEDIA Theater", "Bürgerhaus Kalk"
                    venue=Venue(name=room["name"], city=room["venue"]["city"]),
                    category=category,
                    starts_at=starts_at,
                    ends_at=ends_at if ends_at and ends_at > starts_at else None,
                    url=absolute_url(base, f"/de/konzerte/{item['slug']['de']}/{item['id']}"),
                    image_url=absolute_url(base, image) if image else None,
                )
            )
        return events
