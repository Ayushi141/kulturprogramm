
import re
import httpx
from datetime import datetime, timedelta
from bs4 import BeautifulSoup
from zoneinfo import ZoneInfo

from core import Event, Source, Venue, absolute_url, log, size


class FilmmuseumDuesseldorf(Source):
    """
    The cinema of the Filmmuseum ("Black Box" is the name of its program).
    The program page lists about 15 screenings per page, one div.event-item
    each, and links the next page with "Weiter" ("#" on the last page). A
    card gives weekday and date without a year ("Sa 28.11."), the time
    ("20:00 Uhr") and the film page. The film page gives the length
    ("USA 1925 · 83 min · …") and the image.
    """

    VENUE = Venue(
        name="Filmmuseum Düsseldorf",
        city="Düsseldorf",
    )
    WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]  # Python's order
    MAX_PAGES = 20  # stops a "Weiter" link that never ends

    def get(self, url: str) -> tuple[httpx.Response, BeautifulSoup]:
        response = httpx.get(url, follow_redirects=True, timeout=60)
        log.debug(f"{self.ctx} page {response.url} -> {size(response)}")
        response.raise_for_status()
        return response, BeautifulSoup(response.text, "html.parser")

    def date(self, text: str, today: datetime) -> datetime:
        """
        The date of "Sa 28.11.": this year or the next, whichever has that
        weekday on that day. The weekday of a date moves by one or two days
        from one year to the next, so only one of the two years fits.
        """
        match = re.fullmatch(r"(\w\w)\.? (\d\d)\.(\d\d)\.", text)
        if not match:
            raise ValueError(f"unknown date {text!r}")
        weekday, day, month = self.WEEKDAYS.index(match[1]), int(match[2]), int(match[3])
        for year in (today.year, today.year + 1):
            try:
                date = datetime(year, month, day)
            except ValueError:  # 29.02. in a year that has none
                continue
            if date.weekday() == weekday:
                return date
        raise ValueError(f"no year has {text!r}")

    def film(self, url: str) -> tuple[timedelta | None, str | None]:
        """Length and image from a film page; None for what it does not give."""
        response, soup = self.get(url)
        length = None
        for p in soup.select("p"):
            # e.g. "USA 1925 · 83 min · engl. Zwischentitel · digitalDCP · FSK 6"
            if match := re.search(r"·\s*(\d+)\s*min\b", p.get_text(" ")):
                length = timedelta(minutes=int(match[1]))
                break
        image = soup.select_one('meta[property="og:image"][content]')
        image_url = absolute_url(response.url, image["content"]) if image else None
        log.debug(f"{self.ctx}   {url}: length {length}, image {image_url}")
        return length, image_url

    def scrape(self) -> list[Event]:
        berlin = ZoneInfo("Europe/Berlin")
        today = datetime.now(berlin)
        events = []
        films: dict[str, tuple[timedelta | None, str | None]] = {}  # one fetch per film page
        url = self.website
        for _ in range(self.MAX_PAGES):
            response, soup = self.get(url)
            cards = soup.select("div.event-item")
            log.info(f"{self.ctx} GET {response.url} -> {size(response)}, {len(cards)} div.event-item")
            for card in cards:
                when, clock = [p.get_text(" ", strip=True) for p in card.select("p.mb-0")[:2]]
                link = card.select_one("a.mb-2[href]")
                title = link.get_text(" ", strip=True)
                film_url = absolute_url(response.url, link["href"])
                # the series is only in the path: …/kinoprogramm/stummfilm-musik/go-west-der-cowboy
                series = film_url.rstrip("/").split("/")[-2].replace("-", " ")
                starts_at = datetime.combine(
                    self.date(when, today).date(),
                    datetime.strptime(clock, "%H:%M Uhr").time(),
                    tzinfo=berlin,
                )
                if film_url not in films:
                    try:
                        films[film_url] = self.film(film_url)
                    except Exception as error:
                        # the screening is still valid without length and image
                        log.warning(f"{self.ctx} no details for {title!r}: {error!r}")
                        films[film_url] = (None, None)
                length, image_url = films[film_url]
                log.debug(f"{self.ctx}   {title!r} [{series}] {starts_at}")
                events.append(
                    Event(
                        title=title,
                        venue=self.VENUE,
                        category=self.screening_category(title, series),
                        starts_at=starts_at,
                        ends_at=starts_at + length if length else None,
                        url=film_url,
                        image_url=image_url,
                    )
                )
            # "Weiter" links the next page; on the last page it is "#"
            more = next(
                (a["href"] for a in soup.select("a[href]") if a.get_text(strip=True) == "Weiter"),
                "#",
            )
            if more == "#":
                return events
            url = absolute_url(response.url, more)
        raise RuntimeError(f"more than {self.MAX_PAGES} pages")
