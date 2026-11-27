
import re
from datetime import datetime
from bs4 import BeautifulSoup

from core import BERLIN, Category, Event, Source, Venue, absolute_url, log


class OperWuppertal(Source):
    API = "https://api.wb.c4c.it/api/performances"
    # The house orchestra: events of the "Sinfonieorchester" branch are its own.
    ORCHESTRA = "Sinfonieorchester Wuppertal"
    VENUE = Venue(
        name="Opernhaus Wuppertal",
        city="Wuppertal",
    )

    def scrape(self) -> list[Event]:
        after = datetime.now(BERLIN).isoformat(timespec="seconds")
        performances = []
        page = 1
        while True:
            # The API returns at most 50 performances (of all branches) per
            # page; one page covers only a few weeks.
            params = {
                "startDateTime[after]": after,
                "itemsPerPage": 50,
                "page": page,
            }
            response = self.fetch(self.API, params=params, headers={"Accept": "application/ld+json"})
            data = response.json()
            performances += data["hydra:member"]
            if "hydra:next" not in data.get("hydra:view", {}):
                break
            page += 1

        events = []
        for performance in performances:
            production = performance["production"]
            branch = production["branch"]["title"]
            location = (performance.get("location") or {}).get("title")
            # Opera at the Opernhaus (not its foyers) and all orchestra
            # concerts; the other branches are Schauspiel and "Sonstiges".
            if branch == "Oper" and location == "Opernhaus":
                default = Category.OPER
            elif branch == "Sinfonieorchester" and location:
                default = Category.CONCERT
            else:
                continue

            title = production["title"].replace("\xad", "").strip()
            event_label = performance.get("event") or {}
            # a subtitle, e.g. "Crashkurs für Neugierige"
            description = BeautifulSoup(
                production.get("shortDescription") or "",
                "html.parser",
            ).get_text(" ", strip=True)
            category = self.classify(texts=[title, event_label.get("title", ""), description], default=default)
            if not category:
                continue
            venue = (
                self.VENUE
                if location == "Opernhaus"
                else Venue(
                    name=location,
                    city=self.VENUE.city,
                )
            )

            starts_at = datetime.fromisoformat(
                performance["startDateTime"]
            )
            if starts_at.tzinfo is None:
                starts_at = starts_at.replace(tzinfo=BERLIN)
            else:
                starts_at = starts_at.astimezone(BERLIN)
            end_value = performance.get("endDateTime")
            ends_at = datetime.fromisoformat(end_value) if end_value else None
            if ends_at:
                if ends_at.tzinfo is None:
                    ends_at = ends_at.replace(tzinfo=BERLIN)
                else:
                    ends_at = ends_at.astimezone(BERLIN)
                if ends_at <= starts_at:
                    ends_at = None

            events.append(
                Event(
                    title=title,
                    venue=venue,
                    category=category,
                    starts_at=starts_at,
                    ends_at=ends_at,
                    url=absolute_url(response.url, performance["url"]),
                    organizer=self.ORCHESTRA if branch == "Sinfonieorchester" else None,
                )
            )

        log.info(f"{self.ctx} found {len(events)} qualifying performances")
        return events

    def scrape_image(self, event: Event) -> str | None:
        """
        The production image from the API's single performance: neither the
        list above nor the page's HTML has it (the page loads it with
        JavaScript). The page URL ends with the performance id, e.g.
        .../schostakowitsch-acht/5878 -> /api/performances/5878.
        """
        match = re.search(r"/(\d+)/?$", event.url or "")
        if not match:
            return None
        url = f"{self.API}/{match[1]}"
        response = self.fetch(url, detail=True, headers={"Accept": "application/ld+json"})
        image = response.json()["production"].get("image") or {}
        return image.get("src")
