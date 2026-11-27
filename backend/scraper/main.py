"""The scraper's run loop: scrape, add images and save each source, report, then sleep one day."""

from dataclasses import dataclass, field
from time import sleep

from core import CTX_WIDTH, Saved, log, send_telegram
from sources import sources


@dataclass
class Run:
    """The results of one run, for the report: what each source saved, which failed."""

    saved: dict[str, Saved] = field(default_factory=dict)  # by source name
    failed: list[str] = field(default_factory=list)

    @property
    def events(self) -> int:
        return sum(s.events for s in self.saved.values())

    @property
    def new_productions(self) -> int:
        return sum(len(s.new_productions) for s in self.saved.values())

    @property
    def empty(self) -> list[str]:
        """Sources that saved no events: often a changed website, not a real empty programme."""
        return [name for name, s in self.saved.items() if not s.events]

    def changes(self) -> list[str]:
        """One message per source with new productions or new dates of known ones."""
        messages = []
        for name, saved in self.saved.items():
            if not saved.new_productions and not saved.new_dates:
                continue
            lines = [f"🆕 {name}"]
            lines += [f"• {title}" for title in saved.new_productions]
            if saved.new_dates:
                lines.append("New dates:")
                lines += [f"• {title} (+{n})" for title, n in saved.new_dates.items()]
            messages.append("\n".join(lines))
        return messages

    def report(self) -> str:
        lines = [
            f"📊 Scraper · {len(self.saved)}/{len(self.saved) + len(self.failed)} sources saved",
            f"Events: {self.events} · new productions: {self.new_productions}",
        ]
        if self.failed:
            lines.append(f"❌ Failed: {', '.join(self.failed)}")
        if self.empty:
            lines.append(f"⚠️ No events: {', '.join(self.empty)}")
        return "\n".join(lines)


if __name__ == "__main__":
    while True:
        run = Run()
        for source in sources:
            try:
                events = source.scrape()
                log.info(f"{source.ctx} scraped {len(events)} events")
                images = source.add_images(events)
                run.saved[source.name] = source.save(events, images)
            except Exception:
                run.failed.append(source.name)
                # the traceback follows on the next lines
                log.exception(f"{source.ctx} failed, nothing saved")
        log.info(
            f"{'run':<{CTX_WIDTH}} | {len(run.saved)}/{len(sources)} sources saved"
            + (f", failed: {', '.join(run.failed)}" if run.failed else "")
            + "; next run in 24 h"
        )
        # the changes per source first, the summary last: it is the newest message in the chat
        for message in run.changes() + [run.report()]:
            send_telegram(message)
        sleep(60 * 60 * 24)
