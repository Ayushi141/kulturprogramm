
import httpx
from datetime import datetime
from bs4 import BeautifulSoup
from zoneinfo import ZoneInfo

from core import Category, Event, Source, Venue, absolute_url, log, size


class TheaterOberhausen(Source):
    """
    The Spielplan page lists all published dates: in div.programmlisting, an
    h3 ("Fr. 27.11.26") starts a day, each div.programm-item is one event of
    that day. Its .kategorie is the division; only the stage divisions are
    kept ("Open Haus" holds neighbourhood meetings, quizzes and readings;
    city concerts in other halls are not the theatre's).
    """

    CITY = "Oberhausen"
    DIVISIONS = {
        "Schauspiel": Category.THEATER,
        "Junges Theater": Category.THEATER,
        "Urban Arts": Category.TANZ,  # urban dance
    }

    def scrape_image(self, event: Event) -> str | None:
        """The first photo of the event page's gallery (the og:image is the logo)."""
        if not event.url:
            return None
        response = httpx.get(event.url, follow_redirects=True, timeout=60)
        log.debug(f"{self.ctx} page {response.url} -> {size(response)}")
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        photo = soup.select_one(".entry-content-wrap .kb-gallery-figure img[src]")
        return absolute_url(response.url, photo["src"]) if photo else None

    def scrape(self) -> list[Event]:
        response = httpx.get(self.website, follow_redirects=True, timeout=60)
        log.info(f"{self.ctx} GET {response.url} -> {size(response)}")
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        berlin = ZoneInfo("Europe/Berlin")

        events = []
        day = None
        items = soup.select(".programmlisting > h3, .programmlisting > div.programm-item")
        log.info(f"{self.ctx} found {sum(1 for i in items if i.name == 'div')} div.programm-item")
        for item in items:
            if item.name == "h3":
                # "Fr. 27.11.26"
                day = datetime.strptime(item.get_text(strip=True).split()[-1], "%d.%m.%y").date()
                continue
            text = lambda selector: " ".join(t.get_text(" ", strip=True) for t in item.select(selector))
            heading = item.select_one(".inhalt h4")
            age = heading.select_one(".altersfreigabe")  # "6+"
            if age:
                age.extract()
            title = heading.get_text(" ", strip=True)
            division = text(".kategorie")
            category = self.event_category(self.DIVISIONS.get(division), title, text(".untertitel1"))
            # info line: "Einführung 30 Minuten vor …", "Eintritt frei: Buchen Sie sich …"
            if not category or self.CLOSED.search(text(".untertitel3")):
                log.debug(f"{self.ctx}   skipped {title!r} ({division})")
                continue
            clock = datetime.strptime(text(".zeit").removesuffix("Uhr").strip(), "%H:%M").time()
            events.append(
                Event(
                    title=title,
                    venue=Venue(name=text(".location"), city=self.CITY),
                    category=category,
                    starts_at=datetime.combine(day, clock, tzinfo=berlin),
                    ends_at=None,  # the list gives only the start
                    url=heading.get("data-href"),
                )
            )
        return events
