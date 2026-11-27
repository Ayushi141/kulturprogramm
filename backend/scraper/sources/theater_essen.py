
from datetime import datetime

from core import BERLIN, Category, Event, Source, Venue, absolute_url, end_time_from_text, log


class TheaterEssen(Source):
    # by the first category the card lists
    CATEGORIES = {
        "Aalto Ballett Essen": Category.TANZ,
        "Aalto Musiktheater": Category.OPER,
        "Schauspiel Essen": Category.THEATER,
        "Essener Philharmoniker": Category.CONCERT,
        "Philharmonie Essen": Category.CONCERT,
    }
    # The house orchestra; "Philharmonie Essen" is the concert hall's own series.
    ORCHESTRA = "Essener Philharmoniker"

    def scrape(self) -> list[Event]:
        response, soup = self.fetch_soup(self.website)

        events = []
        performances = soup.select("div.performance")
        log.info(f"{self.ctx} found {len(performances)} div.performance")
        for performance in performances:
            if "performance--is-cancelled" in performance["class"]:
                continue
            category_tag = performance.select_one(".performance__category")
            category_name = (
                category_tag.get_text(" ", strip=True) if category_tag else ""
            )
            default = self.CATEGORIES.get(category_name)
            if not default:
                continue
            location = performance.select_one(
                ".performance__location"
            ).get_text(" ", strip=True)
            # a meeting point: guided tours and walks
            if location.startswith("Treffpunkt:"):
                continue

            title_tag = performance.select_one(
                ".performance__title [itemprop=name]"
            )
            title = title_tag.get_text(" ", strip=True).replace("\xad", "")
            subtitle = performance.select_one(".performance__subtitle")
            category = self.event_category(
                default,
                title,
                subtitle.get_text(" ", strip=True) if subtitle else "",
            )
            if not category:
                continue
            # The ticket line says "Schulvorstellung" or "geschlossene
            # Vorstellung"; only closed bookings are read from it.
            ticket = performance.select_one(".performance__ticketbutton")
            if ticket and self.CLOSED.search(ticket.get_text(" ", strip=True)):
                continue

            link = performance.select_one(".performance__title a")
            starts_at = datetime.fromisoformat(
                performance.select_one(
                    'meta[itemprop="startDate"]'
                )["content"]
            )
            if starts_at.tzinfo is None:
                starts_at = starts_at.replace(tzinfo=BERLIN)
            else:
                starts_at = starts_at.astimezone(BERLIN)

            time_tag = performance.select_one(
                ".performance__col--date .performance__time"
            )
            ends_at = end_time_from_text(
                starts_at, time_tag.get_text(" ", strip=True)
            )
            venue = Venue(
                name=location,
                city="Essen",
            )
            url = absolute_url(response.url, link["href"]) if link else None
            events.append(
                Event(
                    title=title,
                    venue=venue,
                    category=category,
                    starts_at=starts_at,
                    ends_at=ends_at,
                    url=url,
                    organizer=self.ORCHESTRA if category_name == self.ORCHESTRA else None,
                )
            )
        return events
