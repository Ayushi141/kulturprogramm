
import re
from datetime import datetime

from core import BERLIN, Category, Event, Source, Venue, absolute_url, log


class KonzerthausDortmund(Source):
    """
    The programme page lists all announced events: one div.card per event,
    with one date and one or more start times. The class "kd" marks the
    Konzerthaus's own productions; the others are guests (promoters, and the
    Dortmunder Philharmoniker, whose concerts the TheaterDortmund source
    already reads) and are skipped. p.genre is the genre; "Musik & Dialog"
    (tours, talks, masterclasses, season presentation) is skipped.
    """

    CITY = "Dortmund"
    GENRES = {
        "Konzertante Oper": Category.OPER,
        "Tanz & Show": Category.TANZ,
    }
    SKIPPED_GENRES = {"Musik & Dialog"}
    # the ticket button's text for a moved or cancelled date ("Verschoben auf 17.03.2027")
    CANCELLED = re.compile(r"\b(?:verschoben|abgesagt|entfällt)\b", re.IGNORECASE)

    def scrape(self) -> list[Event]:
        response, soup = self.fetch_soup(self.website)

        events = []
        cards = soup.select("div.card.grid.kd")
        log.info(f"{self.ctx} found {len(cards)} div.card.kd of {len(soup.select('div.card.grid'))}")
        for card in cards:
            title = card.select_one("p.h2").get_text(" ", strip=True)
            genre_tag = card.select_one("p.genre")
            genre = genre_tag.get_text(" ", strip=True) if genre_tag else ""
            subtitle = card.select_one("p.h2 + p")
            category = self.event_category(
                self.GENRES.get(genre, Category.CONCERT), title, subtitle.get_text(" ", strip=True) if subtitle else ""
            )
            footer = card.select_one(".card-footer").get_text(" ", strip=True)
            if not category or genre in self.SKIPPED_GENRES or self.CANCELLED.search(footer):
                log.debug(f"{self.ctx}   skipped {title!r} ({genre})")
                continue
            # "Fr 27.11.2026", then "20.00 Uhr" (one item per start time)
            date_text, *times = [li.get_text(" ", strip=True) for li in card.select(".timebox li")]
            day = datetime.strptime(date_text.split()[-1], "%d.%m.%Y").date()
            link = card.select_one('a[aria-label^="Zur Detailseite"][href]')
            photo = card.select_one(".card-img img[src]")
            for time_text in times:
                clock = datetime.strptime(time_text.removesuffix("Uhr").strip(), "%H.%M").time()
                events.append(
                    Event(
                        title=title,
                        venue=Venue(name=self.organizer, city=self.CITY),
                        category=category,
                        starts_at=datetime.combine(day, clock, tzinfo=BERLIN),
                        ends_at=None,  # the list gives only the start
                        url=absolute_url(response.url, link["href"]) if link else None,
                        image_url=absolute_url(response.url, photo["src"]) if photo else None,
                    )
                )
        return events
