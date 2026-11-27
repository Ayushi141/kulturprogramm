from dataclasses import dataclass

import re
from datetime import datetime, timedelta

from core import BERLIN, Category, Event, Source, Venue, log


@dataclass(frozen=True)
class Production:
    """Details from a production page that the calendar does not show."""

    venue: Venue
    length: timedelta | None
    image_url: str | None


class SchauspielKoeln(Source):
    DEFAULT = Category.THEATER
    # Used when a production page names no single stage or cannot be loaded.
    VENUE = Venue(
        name="Schauspiel Köln",
        city="Köln",
    )

    def production(self, url: str) -> Production:
        """
        Stage, length and image from a production page. Missing details fall
        back to the general venue, no length and no image.
        """
        response, soup = self.fetch_soup(url, detail=True)

        # e.g. "Kleines Haus"; a page listing several stages
        # ("Erfrischungsraum & Kleines Haus") does not say which one is meant
        stage_tag = soup.select_one(".field--name-stages")
        stage = " ".join(stage_tag.get_text(" ").split()) if stage_tag else ""
        if stage and "&" not in stage:
            venue = Venue(
                name=stage,
                city=self.VENUE.city,
            )
        else:
            venue = self.VENUE

        # e.g. "1 h 45 min", "5 h"
        length = None
        length_tag = soup.select_one(".field--name-duration")
        if length_tag:
            text = length_tag.get_text(" ", strip=True)
            match = re.fullmatch(r"(?:(\d+)\s*h)?\s*(?:(\d+)\s*min)?", text)
            if match and any(match.groups()):
                length = timedelta(
                    hours=int(match[1] or 0), minutes=int(match[2] or 0)
                )
            else:
                log.warning(f"{self.ctx} unknown length {text!r} on {url}")

        image_tag = soup.select_one('meta[property="og:image"][content]')
        image_url = (
            str(response.url.join(image_tag["content"])) if image_tag else None
        )
        log.debug(f"{self.ctx}   stage {stage!r} -> {venue.name}, length {length}, image {image_url}")
        return Production(venue, length, image_url)

    def scrape(self) -> list[Event]:
        response, soup = self.fetch_soup(self.website)

        events = []
        productions: dict[str, Production] = {}  # one fetch per production page
        activities = soup.select("li.s-bko-activity")
        log.info(f"{self.ctx} found {len(activities)} li.s-bko-activity")
        for activity in activities:
            ticket = activity.select_one(".field--name-ticket")
            if ticket and ticket.get_text(strip=True) == "Entfällt":
                continue
            # e.g. "Premiere", "Konzert", "Lesung", "Führung"
            label_tag = activity.select_one(".field--name-category")
            label = label_tag.get_text(strip=True) if label_tag else ""
            link = activity.select_one(".field--name-production a")
            title = link.get_text(strip=True)
            category = self.classify(texts=[title, label])
            if not category:
                log.debug(f"{self.ctx}   skip {title!r} [{label}]")
                continue
            url = str(response.url.join(link["href"]))

            time_tag = activity.select_one("time.s-bko-activity__datetime")
            clock = list(time_tag.stripped_strings)[-1]
            starts_at = datetime.strptime(
                f"{time_tag['datetime']} {clock}", "%Y-%m-%d %H.%M Uhr"
            ).replace(tzinfo=BERLIN)

            if url not in productions:
                try:
                    productions[url] = self.production(url)
                except Exception as error:
                    # the calendar entry is still valid without the details
                    log.warning(f"{self.ctx} no details for {title!r}: {error!r}")
                    productions[url] = Production(self.VENUE, None, None)
            details = productions[url]
            log.debug(f"{self.ctx}   {title!r} [{label}] {starts_at}")
            events.append(
                Event(
                    title=title,
                    venue=details.venue,
                    category=category,
                    starts_at=starts_at,
                    ends_at=(
                        starts_at + details.length if details.length else None
                    ),
                    url=url,
                    image_url=details.image_url,
                )
            )

        return events
