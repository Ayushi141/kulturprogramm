
import re
import httpx
from datetime import datetime
from bs4 import BeautifulSoup, Tag
from time import sleep

from core import BERLIN, Category, Event, Source, Venue, absolute_url, end_time_from_text, log, size


class RheinischesLandestheater(Source):
    """
    The Spielplan page loads its list with POST requests to
    spielplan/programm.html, one month per request (offset 0, 1, …). Each
    answer ends with a hidden div.letzterTermin, which the next request sends
    back; the last answer is the text "ende erreicht.". A div.performance
    carries its date (date-DDMMYY) and its divisions (sparte-N) as classes.
    Only the stage divisions are kept: the others are community offers
    (workshops, choir, crafts, knitting, quiz). Touring dates outside Neuss
    are skipped.
    """

    CITY = "Neuss"
    AJAX = "https://www.rheinisches-landestheater.de/spielplan/programm.html"
    # The pages set <base href> to the site root: the list's links ("./produktionen/…") are relative to it.
    BASE = httpx.URL("https://www.rheinisches-landestheater.de/")
    # sparte-N classes of the stage divisions (names: the Spielplan's filter);
    # the other divisions are community offers and are skipped (DEFAULT None)
    LABELS = {
        "2": Category.THEATER,  # Schauspiel
        "5": Category.THEATER,  # Kabarett/Comedy
        "9": Category.THEATER,  # Kinder- und Jugendtheater
        "17": Category.TANZ,  # Tanz
        "26": Category.TANZ,  # Tanz/Ballett
    }
    MAX_PAGES = 30

    def scrape_image(self, event: Event) -> str | None:
        """The wide header photo of the production page (no og:image), else the list's small photo."""
        if event.url:
            response = self.fetch(event.url, detail=True)
            header = BeautifulSoup(response.text, "html.parser").select_one("main img.w-100[src]")
            if header:
                return absolute_url(response.url, header["src"])
        return event.image_url

    def page(self, client: httpx.Client, offset: int, last: str) -> httpx.Response:
        """One month of the Spielplan. The site throttles by IP: after a 429 it waits and asks once more."""
        url = f"{self.AJAX}?ajax=1&offset={offset}&letzterTermin={last}"
        response = client.post(url)
        if response.status_code == 429:
            wait = int(response.headers.get("Retry-After", "60"))
            log.info(f"{self.ctx} 429 for offset {offset}, waiting {wait} s")
            sleep(wait)
            response = client.post(url)
        log.info(f"{self.ctx} POST offset {offset} -> {size(response)}")
        response.raise_for_status()
        return response

    def scrape(self) -> list[Event]:
        events = []
        last = "0"
        with httpx.Client(follow_redirects=True, timeout=60, headers={"User-Agent": "Mozilla/5.0"}) as client:
            for offset in range(self.MAX_PAGES):
                response = self.page(client, offset, last)
                if response.text.strip() == "ende erreicht.":
                    return events
                soup = BeautifulSoup(response.text, "html.parser")
                last = soup.select_one("div.letzterTermin").get_text(strip=True)
                for card in soup.select("div.performance"):
                    event = self.event(card, self.BASE)
                    if event:
                        events.append(event)
                sleep(1)  # the site answers 429 to fast requests
        raise RuntimeError(f"more than {self.MAX_PAGES} pages")

    def event(self, card: Tag, base: httpx.URL) -> Event | None:
        """The event of one div.performance, or None to skip it."""
        classes = " ".join(card["class"])
        link = card.select_one(".head-bold-l a[href]")
        title = card.select_one(".head-bold-l").get_text(strip=True).replace("\xad", "")
        divisions = re.findall(r"\bsparte-(\d+)\b", classes)
        # "Märchen von Michael Ende | ab 6 Jahren", "Comedy zu Gast"
        subtitle = card.select_one(".spielplan-uebertitel")
        # "nur Gruppenbuchung über die Theaterkasse", "Geschlossene Veranstaltung"
        comment = card.select_one(".spielplan-kommentar")
        category = self.classify(
            labels=divisions,
            texts=[title, subtitle.get_text(" ", strip=True) if subtitle else ""],
            info=[comment.get_text(" ", strip=True)] if comment else [],
        )
        # "Große Bühne" with the city in span.spielplan-ort
        place = card.select_one(".spielplan-raum > div")
        city = place.select_one(".spielplan-ort") if place else None
        if not category or not city or city.get_text(strip=True) != self.CITY:
            log.debug(f"{self.ctx}   skipped {title!r} ({divisions}, {place.get_text(' ', strip=True) if place else None})")
            return None
        stage = place.find(string=True, recursive=False).strip()

        day = datetime.strptime(re.search(r"\bdate-(\d{6})\b", classes)[1], "%d%m%y")
        # "19:30 Uhr", "09:30–10:40 Uhr"
        clock = card.select_one(".spielplan-zeit").get_text(" ", strip=True)
        start = datetime.strptime(re.match(r"(\d{1,2}:\d{2})", clock)[1], "%H:%M").time()
        starts_at = datetime.combine(day.date(), start, tzinfo=BERLIN)
        photo = card.select_one("img[src]:not(.img-fluid)")  # .img-fluid: partner logos
        return Event(
            title=title,
            venue=Venue(name=stage, city=self.CITY),
            category=category,
            starts_at=starts_at,
            ends_at=end_time_from_text(starts_at, clock),
            url=absolute_url(base, link["href"]) if link else None,
            image_url=absolute_url(base, photo["src"]) if photo else None,
        )
