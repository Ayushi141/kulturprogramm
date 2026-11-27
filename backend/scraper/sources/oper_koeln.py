
import re
from datetime import datetime

from core import BERLIN, Category, Event, Source, Venue, absolute_url, log


class OperKoeln(Source):
    VENUE = Venue(
        name="Oper Köln",
        city="Köln",
    )

    def scrape(self) -> list[Event]:
        response, soup = self.fetch_soup(self.website)

        events = []
        activities = soup.select("li.s-bko-activity--schedule")
        log.info(f"{self.ctx} found {len(activities)} .s-bko-activity")
        for activity in activities:
            time_string = activity.select_one(".s-time-string")
            time_text = time_string.get_text(" ", strip=True)
            # e.g. "Premiere", "Konzert", "Führung", "Öffentliche Probe"
            category_tag = activity.select_one(
                ".s-bko-activity__category"
            )
            category_text = (
                category_tag.get_text(" ", strip=True)
                if category_tag
                else ""
            )
            link = activity.select_one(".s-link-container a[href]")
            title = (
                link.get_text(" ", strip=True).replace("\xad", "")
                if link
                else ""
            )
            default = (
                Category.THEATER
                if re.search(r"Schauspiel", category_text, re.IGNORECASE)
                else Category.OPER
            )
            category = self.event_category(default, title, category_text)
            if not category:
                continue
            # The info line names who books it, e.g. "Mobile Kinderoper vor
            # Ort in Ihrer Kita"; only closed bookings are read from it.
            info = activity.select_one(".s-bko-activity__text-infos")
            if info and self.CLOSED.search(info.get_text(" ", strip=True)):
                continue
            if not link:
                raise ValueError(f"{self.name}: event has no production URL")
            url = absolute_url(response.url, link["href"])

            time_tags = time_string.select("time[datetime]")
            clock_match = re.search(r"\b(\d{1,2}:\d{2})\b", time_text)
            date_tag = activity.select_one(
                "time.s-bko-activity__datetime[datetime]"
            )
            starts_at = datetime.combine(
                datetime.fromisoformat(date_tag["datetime"]).date(),
                datetime.strptime(clock_match[1], "%H:%M").time(),
                tzinfo=BERLIN,
            )

            ends_at = None
            if time_tags:
                end_datetime = datetime.fromisoformat(
                    time_tags[-1]["datetime"].replace("Z", "+00:00")
                )
                if end_datetime.tzinfo is None:
                    end_datetime = end_datetime.replace(tzinfo=BERLIN)
                ends_at = end_datetime.astimezone(BERLIN)

            events.append(
                Event(
                    title=title,
                    venue=self.VENUE,
                    category=category,
                    starts_at=starts_at,
                    ends_at=ends_at,
                    url=url,
                )
            )
        return events
