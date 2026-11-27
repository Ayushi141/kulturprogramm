
import re
from datetime import datetime, timedelta

from core import BERLIN, Event, Source, Venue, absolute_url, log


class UfaPalastDuesseldorf(Source):
    """
    The program page lists every announced day (presales months ahead), one
    section.day-section per day with one article.movie-row per film. The
    screens ("Kino 13 – UFA Lounge") are halls of one cinema, not venues.
    """

    VENUE = Venue(
        name="UFA Palast Düsseldorf",  # = organizer: the timeline shows no extra venue line
        city="Düsseldorf",
    )

    @staticmethod
    def runtime(text: str) -> timedelta | None:
        """ "2 Std 39 Min", "2 Std" or "95 Min" in the row's info line."""
        match = re.search(r"\b(\d+)\s*Std\b(?:\s*(\d+)\s*Min\b)?|\b(\d+)\s*Min\b", text)
        if not match:
            return None
        hours, minutes, only_minutes = match.groups()
        if only_minutes:
            return timedelta(minutes=int(only_minutes))
        return timedelta(hours=int(hours), minutes=int(minutes or 0))

    def scrape(self) -> list[Event]:
        response, soup = self.fetch_soup(self.website)

        events = []
        rows = soup.select("section.day-section article.movie-row")
        log.info(f"{self.ctx} found {len(rows)} article.movie-row")
        for row in rows:
            link = row.select_one("a.group[href]")
            title = link.select_one("h2").get_text(" ", strip=True)
            # FSK badge, year and runtime; the description is in a later div
            runtime = self.runtime(link.find_next_sibling("div").get_text(" "))
            # badges such as "2D", "OV", "MET Opera", "First Preview"
            badges = [b.get_text(" ", strip=True) for b in row.select(".prog-badge")]
            category = self.screening_category(title, *badges)
            poster = row.select_one("img[src]")
            for show in row.select(".showtime-wrap[data-date][data-time]"):
                # local clock time; after midnight it is already the next date
                starts_at = datetime.strptime(
                    f"{show['data-date']} {show['data-time']}", "%Y-%m-%d %H:%M"
                ).replace(tzinfo=BERLIN)
                events.append(
                    Event(
                        title=title,
                        venue=self.VENUE,
                        category=category,
                        starts_at=starts_at,
                        ends_at=starts_at + runtime if runtime else None,
                        url=absolute_url(response.url, link["href"]),
                        image_url=(
                            absolute_url(response.url, poster["src"]) if poster else None
                        ),
                    )
                )
        return events
