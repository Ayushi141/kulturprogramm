
from datetime import datetime

from core import BERLIN, Category, Event, Source, Venue, absolute_url, end_time_from_text, log


class MusiktheaterImRevier(Source):
    """
    The calendar page lists the whole season: one article.m-event per date,
    with an introduction or talk as a nested article.m-event--subevent. The
    article's data attributes hold the ids of its divisions (data-filter-genre)
    and audiences (data-filter-category); the filter form names them.
    """

    CITY = "Gelsenkirchen"
    # division name -> category; the first in this order wins
    DIVISIONS = {
        "Konzert": Category.CONCERT,
        "TanzGelsenkirchen": Category.TANZ,
        "Musiktheater": Category.OPER,
        "MiR.LAB": Category.THEATER,  # the theatre lab's productions
        "Gastspiel": Category.THEATER,
    }
    # audiences that are not performances: workshops, sing-alongs, open rehearsals, tours
    SKIPPED = {"Mitmachen", "MiR offen"}

    def scrape(self) -> list[Event]:
        response, soup = self.fetch_soup(self.website)
        # ("genre", "3") -> "Konzert", ("category", "27") -> "Mitmachen"
        names = {
            (group["data-group"], label.input["value"]): label.get_text(" ", strip=True)
            for group in soup.select("fieldset.a-checkbox-group[data-group]")
            for label in group.select("label:has(input[value])")
        }

        events = []
        cards = soup.select("article.m-event:not(.m-event--subevent)")
        log.info(f"{self.ctx} found {len(cards)} article.m-event")
        for card in cards:
            divisions = [names.get(("genre", i), i) for i in card.get("data-filter-genre", "").split(",") if i]
            audiences = [names.get(("category", i), i) for i in card.get("data-filter-category", "").split(",") if i]
            link = card.select_one("a.m-event__content__title")
            title = link.get_text(" ", strip=True)
            # "Oper von Giacomo Puccini", "Workshop Plans & Plants"
            subtitle = card.select_one(".m-event__content__details__subtitle")
            default = next((c for d, c in self.DIVISIONS.items() if d in divisions), None)
            category = self.event_category(
                default, title, subtitle.get_text(" ", strip=True) if subtitle else "", *divisions
            )
            if not category or self.SKIPPED.intersection(audiences):
                log.debug(f"{self.ctx}   skipped {title!r} ({divisions}, {audiences})")
                continue
            time_tag = card.select_one(".m-event__content__info time[datetime]")
            # "2026-11-27 19:00"
            starts_at = datetime.strptime(time_tag["datetime"], "%Y-%m-%d %H:%M").replace(tzinfo=BERLIN)
            stage = card.select_one(".m-event__content__info__location").get_text(" ", strip=True)
            photo = card.select_one(".m-event__content__media img[src]")
            events.append(
                Event(
                    title=title,
                    venue=Venue(name=stage, city=self.CITY),
                    category=category,
                    starts_at=starts_at,
                    # "19:00 – 21:15 Uhr"
                    ends_at=end_time_from_text(starts_at, time_tag.get_text(" ", strip=True)),
                    url=absolute_url(response.url, link["href"]),
                    image_url=absolute_url(response.url, photo["src"]) if photo else None,
                )
            )
        return events
