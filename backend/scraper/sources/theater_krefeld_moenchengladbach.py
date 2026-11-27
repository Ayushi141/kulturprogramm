
import re
import httpx
from datetime import datetime
from bs4 import BeautifulSoup, Tag

from core import BERLIN, Category, Event, Source, Venue, absolute_url, log


class TheaterKrefeldMoenchengladbach(Source):
    # Category by the first listed branch an event has. Other branches
    # ("Extras": tours, talks, trips) give no category, so only their
    # concerts are kept.
    LABELS = {
        "Musiktheater": Category.OPER,
        "Ballett": Category.TANZ,
        "Konzerte": Category.CONCERT,
        "Schauspiel": Category.THEATER,
        "Kinder & Jugend": Category.THEATER,
    }
    # The house orchestra: events of the "Konzerte" branch are its own.
    ORCHESTRA = "Niederrheinische Sinfoniker"
    # Some location lines abbreviate the two theatres ("Theater MG – Studio").
    ABBREVIATIONS = {
        "Theater MG": "Theater Mönchengladbach",
        "Theater KR": "Theater Krefeld",
    }
    # Seating notes after the stage ("Konzertsaal Freie Platzwahl", "Große Bühne FP").
    SEATING = re.compile(r"\s+(?:Freie Platzwahl|FP)$")
    # The company's seat: the city of a venue whose directions page gives no address.
    SEAT = "Krefeld"

    def venue(self, location: Tag, cities: dict[str, str]) -> Venue:
        """
        One venue per stage. The line is "building – stage" ("Theater MG –
        Studio") or only the building ("Seidenweberhaus"). The venue is the
        stage, else the building: organizer and city already say which
        theatre. The city comes from the address on the building's directions
        page (its link), read once per building and run.
        """
        building, _, stage = location.get_text(" ", strip=True).partition(" – ")
        name = self.SEATING.sub("", stage) or self.ABBREVIATIONS.get(building, building)
        link = location.select_one("a[href]")
        if link and link["href"] not in cities:
            cities[link["href"]] = self.city(link["href"])
        city = cities[link["href"]] if link else self.SEAT
        return Venue(name=name, city=city)

    def city(self, url: str) -> str:
        """The city in the address of a directions page ("…, 5911 HH Venlo")."""
        try:
            response = self.fetch(url, detail=True)
        except httpx.HTTPError as error:
            log.warning(f"{self.ctx} no address from {url}: {error!r}; city {self.SEAT}")
            return self.SEAT
        address = BeautifulSoup(response.text, "html.parser").select_one("span.has-icon--multiline")
        if not address:
            log.info(f"{self.ctx} no address on {url}; city {self.SEAT}")
            return self.SEAT
        # "Theater Mönchengladbach | Odenkirchener Straße 78, 41236 Mönchengladbach"
        place = address.get_text(" ", strip=True).rsplit(",", 1)[-1]
        return re.sub(r"^\s*\d{4,5}(?: [A-Z]{2})?\s+", "", place).strip()

    def scrape(self) -> list[Event]:
        response, soup = self.fetch_soup(self.website)

        events = []
        cities: dict[str, str] = {}  # directions page URL -> city
        performances = soup.select("article.performance")
        log.info(f"{self.ctx} found {len(performances)} article.performance")
        for performance in performances:
            # badge "Entfällt"
            if "performance--canceled" in performance["class"]:
                continue
            branch_tags = performance.select(".performance__branch-link")
            branches = {
                tag.get_text(" ", strip=True) for tag in branch_tags
            }

            title_tag = performance.select_one(".performance__title")
            title = title_tag.get_text(" ", strip=True).replace("\xad", "")
            # badges, e.g. "Premiere", "Soiree", "+ Einführung"
            meta = performance.select_one(".performance__meta")
            subtitle = performance.select_one(".performance__subtitle")
            category = self.classify(
                labels=list(branches),
                texts=[
                    title,
                    meta.get_text(" ", strip=True) if meta else "",
                    subtitle.get_text(" ", strip=True) if subtitle else "",
                ],
            )
            if not category:
                continue

            link = performance.select_one(".performance__title a")
            date_tag = performance.select_one("time.date[datetime]")
            starts_at = datetime.fromisoformat(date_tag["datetime"])
            if starts_at.tzinfo is None:
                starts_at = starts_at.replace(tzinfo=BERLIN)
            else:
                starts_at = starts_at.astimezone(BERLIN)

            venue = self.venue(performance.select_one(".performance__location"), cities)
            url = absolute_url(response.url, link["href"]) if link else None
            events.append(
                Event(
                    title=title,
                    venue=venue,
                    category=category,
                    starts_at=starts_at,
                    ends_at=None,
                    url=url,
                    organizer=self.ORCHESTRA if "Konzerte" in branches else None,
                )
            )
        return events
