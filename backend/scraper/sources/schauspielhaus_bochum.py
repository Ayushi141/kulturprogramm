
import re
from datetime import datetime

from core import BERLIN, Category, Event, Source, Venue, absolute_url, end_time_from_text, log


class SchauspielhausBochum(Source):
    DANCE_URL = "https://www.schauspielhausbochum.de/de/spielplan/11/tanz"

    def scrape(self) -> list[Event]:
        events = []
        # The Schauspiel page also lists the dance pieces; the first listing
        # wins, so the dance page is read first.
        seen: set[tuple[str, str, datetime]] = set()
        for url, default in (
            (self.DANCE_URL, Category.TANZ),
            (self.website, Category.THEATER),
        ):
            response, soup = self.fetch_soup(url)
            groups = soup.select(".schedule__group[data-groupdate]")
            log.info(f"{self.ctx} found {len(groups)} schedule groups")

            for group in groups:
                for item in group.select(".schedule__item"):
                    link = item.select_one(".schedule__title a")
                    stage_tag = item.select_one(".schedule__stage")
                    time_tag = item.select_one(".schedule__times")
                    if not link or not stage_tag or not time_tag:
                        continue
                    stage = stage_tag.get_text(" ", strip=True)
                    if stage == "Theater Hagen":  # a guest stage, not in Bochum
                        continue
                    # status badges, e.g. "Fällt aus", "Wenige Karten"
                    badges = [
                        tag.get_text(" ", strip=True)
                        for tag in item.select(".schedule__cards")
                    ]
                    if "Fällt aus" in badges:
                        continue
                    title = link.get_text(" ", strip=True).replace("\xad", "")
                    # e.g. "Premiere", "Schulvorstellung"
                    attributes = item.select_one(".schedule__attributes")
                    category = self.event_category(
                        default,
                        title,
                        (
                            attributes.get_text(" ", strip=True)
                            if attributes
                            else ""
                        ),
                    )
                    if not category:
                        continue

                    starts_at = datetime.fromisoformat(
                        group["data-groupdate"]
                    ).replace(tzinfo=BERLIN)
                    time_text = time_tag.get_text(" ", strip=True)
                    clock_match = re.search(
                        r"\b(\d{1,2}:\d{2})\b", time_text
                    )
                    start_clock = datetime.strptime(
                        clock_match[1], "%H:%M"
                    ).time()
                    starts_at = datetime.combine(
                        starts_at.date(), start_clock, tzinfo=BERLIN
                    )
                    venue = Venue(
                        name=stage,
                        city="Bochum",
                    )
                    if (title, venue, starts_at) in seen:
                        continue
                    seen.add((title, venue, starts_at))
                    events.append(
                        Event(
                            title=title,
                            venue=venue,
                            category=category,
                            starts_at=starts_at,
                            ends_at=end_time_from_text(starts_at, time_text),
                            url=absolute_url(response.url, link["href"]),
                        )
                    )
        return events

    def scrape_image(self, event: Event) -> str | None:
        """
        The production page has no og:image. Its title image is the inline
        background of div.production__title-image (body has a site-wide
        ensemble background). Without one (a title video), the first gallery
        photo: img.lazyimage, whose URL is in data-src.
        """
        if not event.url:
            return None
        response, soup = self.fetch_soup(event.url, detail=True)
        title = soup.select_one(".production__title-image[style]")
        match = title and re.search(
            r"background-image:\s*url\(['\"]?([^'\")]+)", title["style"]
        )
        if match:
            return absolute_url(response.url, match[1])
        gallery = soup.select_one("img.lazyimage[data-src]")
        return absolute_url(response.url, gallery["data-src"]) if gallery else None
