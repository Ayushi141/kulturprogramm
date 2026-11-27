"""The scraper's run loop: scrape, add images and save each source, then sleep one day."""


from time import sleep

from core import CTX_WIDTH, log
from sources import sources

if __name__ == "__main__":
    while True:
        failed = []
        for source in sources:
            try:
                events = source.scrape()
                log.info(f"{source.ctx} scraped {len(events)} events")
                images = source.add_images(events)
                source.save(events, images)
            except Exception:
                failed.append(source.name)
                # the traceback follows on the next lines
                log.exception(f"{source.ctx} failed, nothing saved")
        log.info(
            f"{'run':<{CTX_WIDTH}} | {len(sources) - len(failed)}/{len(sources)} sources saved"
            + (f", failed: {', '.join(failed)}" if failed else "")
            + "; next run in 24 h"
        )
        sleep(60 * 60 * 24)
