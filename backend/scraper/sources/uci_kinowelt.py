
import re
import httpx
from datetime import datetime, timedelta
from bs4 import BeautifulSoup
from zoneinfo import ZoneInfo

from core import Event, Source, Venue, absolute_url, log, size


class UciKinowelt(Source):
    """
    The cinema's program page without "/day" lists every film with all its
    announced screenings (the "/day" page shows only today). One
    div.film-container per film, with a table of a.badge-performance links.
    """

    VENUE = Venue(
        name="UCI Kinowelt Düsseldorf",  # = organizer: the timeline shows no extra venue line
        city="Düsseldorf",
    )

    def scrape(self) -> list[Event]:
        # the site answers 403 to httpx's default User-Agent
        response = httpx.get(
            self.website,
            follow_redirects=True,
            timeout=60,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        log.info(f"{self.ctx} GET {response.url} -> {size(response)}")
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        berlin = ZoneInfo("Europe/Berlin")

        events = []
        films = soup.select("div.film-container")
        log.info(f"{self.ctx} found {len(films)} div.film-container")
        for film in films:
            link = film.select_one(
                "h2.film-container__description__text__eventtitle a[href]"
            )
            title = link.get_text(" ", strip=True)
            # e.g. ["Neu", "159min", "Action, Science-Fiction"]; some films have no length
            info = [li.get_text(strip=True) for li in film.select("ul.film-info li")]
            minutes = next(
                (int(m[1]) for i in info if (m := re.fullmatch(r"(\d+)\s*min", i))),
                None,
            )
            # genres such as "Oper", "Ballett", "Live"
            category = self.screening_category(title, *info)
            poster = film.select_one("img.film-thumb[src]")
            shows = film.select("a.badge-performance[data-date][data-time]")
            log.debug(f"{self.ctx}   {title!r}: {len(shows)} screenings, {minutes} min")
            for show in shows:
                # local clock time; after midnight it is already the next date
                starts_at = datetime.strptime(
                    f"{show['data-date']} {show['data-time']}", "%Y%m%d %H:%M"
                ).replace(tzinfo=berlin)
                events.append(
                    Event(
                        title=title,
                        venue=self.VENUE,
                        category=category,
                        starts_at=starts_at,
                        ends_at=(
                            starts_at + timedelta(minutes=minutes) if minutes else None
                        ),
                        url=absolute_url(response.url, link["href"]),
                        image_url=(
                            absolute_url(response.url, poster["src"]) if poster else None
                        ),
                    )
                )
        return events
