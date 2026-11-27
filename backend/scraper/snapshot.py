"""
Snapshot test for the scraper: proves that a code change does not change
what the sources scrape.

    python snapshot.py record [source …]   # fetch the live sites, store everything
    python snapshot.py check [source …]    # replay offline, compare with the record

`record` runs every source against the live websites. It stores each HTTP
response (in `snapshots/responses/`) and the result (`snapshots/expected.json`):
per source, the events of `scrape()` and the image URL that
`scrape_image()` gives for the first event of each title. It does not
download images or write to the database.

`check` runs the same code again, but every HTTP request gets the stored
response. In both modes the clock (`datetime.now()`) stands at the time the
record started.
So the result depends only on the code: any difference is a change in
behaviour. A request that was not recorded fails, and shows as a difference.

Record once before a refactor; check after each step. Record again when you
change what a source requests (a new detail page, a new parameter).
"""

import base64
import gzip
import hashlib
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

DIR = Path(__file__).parent / "snapshots"
RESPONSES = DIR / "responses"
EXPECTED = DIR / "expected.json"
ACTUAL = DIR / "actual.json"
# the real class: freeze() replaces `datetime` in the scraper's modules
REAL_DATETIME = datetime
# decoded content is stored, so these headers would be wrong on replay
DROPPED_HEADERS = {"content-encoding", "content-length", "transfer-encoding"}


def key(request: httpx.Request) -> str:
    """The name of a stored response: method, full URL and a hash of the body."""
    body = request.read()  # a request's body can still be a stream (redirects)
    digest = hashlib.sha256(body).hexdigest()[:16] if body else "-"
    return f"{request.method} {request.url} {digest}"


def path(request_key: str) -> Path:
    return RESPONSES / f"{hashlib.sha256(request_key.encode()).hexdigest()[:32]}.json.gz"


def patch_http(mode: str) -> None:
    """Records each response (mode "record") or answers from the records (mode "check")."""
    original = httpx.HTTPTransport.handle_request

    def recording(self, request: httpx.Request) -> httpx.Response:
        response = original(self, request)
        content = response.read()
        record = {
            "key": key(request),
            "status": response.status_code,
            "headers": [(k, v) for k, v in response.headers.items() if k.lower() not in DROPPED_HEADERS],
            "content": base64.b64encode(content).decode(),
        }
        path(record["key"]).write_bytes(gzip.compress(json.dumps(record).encode()))
        return response

    def replaying(self, request: httpx.Request) -> httpx.Response:
        file = path(key(request))
        if not file.exists():
            raise httpx.ConnectError(f"not recorded: {key(request)}", request=request)
        record = json.loads(gzip.decompress(file.read_bytes()))
        return httpx.Response(
            record["status"],
            headers=record["headers"],
            content=base64.b64decode(record["content"]),
            request=request,
        )

    httpx.HTTPTransport.handle_request = recording if mode == "record" else replaying


def freeze(modules: list, now: datetime, no_sleep: bool) -> None:
    """
    Sets `datetime.now()` to `now` in these modules, in both modes: some
    sources put the time into their requests (Oper Wuppertal: dates after
    now), so the record and the replay must use the same time. With
    `no_sleep`, `sleep()` returns at once (the replay needs no pauses).
    """

    class Frozen(REAL_DATETIME):
        frozen = True

        @classmethod
        def now(cls, tz=None):
            return now.astimezone(tz) if tz else now.astimezone().replace(tzinfo=None)

    for module in modules:
        current = getattr(module, "datetime", None)
        if current is REAL_DATETIME or getattr(current, "frozen", False):
            module.datetime = Frozen
        if no_sleep and hasattr(module, "sleep"):
            module.sleep = lambda seconds: None


def scraper_modules() -> list:
    """The loaded modules of the scraper (main and the modules next to it), without this script."""
    here = Path(__file__).parent.resolve()
    me = Path(__file__).resolve()
    return [
        m
        for m in list(sys.modules.values())
        if getattr(m, "__file__", None)
        and Path(m.__file__).resolve().is_relative_to(here)
        and Path(m.__file__).resolve() != me
    ]


def run(source) -> dict:
    """The result of one source: its events and one image URL per title, or the error."""
    try:
        events = source.scrape()
    except Exception as error:
        return {"error": repr(error)}
    images = {}
    for event in events:
        if event.title in images:
            continue
        try:
            images[event.title] = source.scrape_image(event)
        except Exception as error:
            images[event.title] = f"error: {error!r}"
    rows = sorted(
        (
            {
                "title": e.title,
                "venue": e.venue.name,
                "city": e.venue.city,
                "category": e.category.value,
                "starts_at": e.starts_at.isoformat(),
                "ends_at": e.ends_at.isoformat() if e.ends_at else None,
                "url": e.url,
                "organizer": e.organizer or source.organizer,
            }
            for e in events
        ),
        key=lambda r: (r["starts_at"], r["title"], r["venue"]),
    )
    return {"events": rows, "images": images}


def compare(expected: dict, actual: dict) -> int:
    """Prints the differences per source; returns the number of differing sources."""
    failed = 0
    for name in sorted(set(expected) | set(actual)):
        old, new = expected.get(name), actual.get(name)
        if old == new:
            print(f"ok      {name}: {len(new.get('events', []))} events")
            continue
        failed += 1
        print(f"CHANGED {name}")
        if old is None or new is None:
            print(f"        only in the {'record' if new is None else 'new run'}")
            continue
        for part in ("error", "events", "images"):
            a, b = old.get(part), new.get(part)
            if a == b:
                continue
            if part == "events":
                gone = [r for r in a or [] if r not in (b or [])]
                added = [r for r in b or [] if r not in (a or [])]
                for r in gone[:5]:
                    print(f"        - {r}")
                for r in added[:5]:
                    print(f"        + {r}")
                print(f"        events: {len(gone)} gone, {len(added)} new")
            elif part == "images":
                for title in sorted(set(a or {}) | set(b or {})):
                    if (a or {}).get(title) != (b or {}).get(title):
                        print(f"        image {title!r}: {(a or {}).get(title)} -> {(b or {}).get(title)}")
            else:
                print(f"        error: {a} -> {b}")
    return failed


def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] not in ("record", "check"):
        print(__doc__)
        return 2
    mode, names = sys.argv[1], set(sys.argv[2:])
    logging.disable(logging.WARNING)  # the scraper's own log lines are noise here
    patch_http(mode)

    sys.path.insert(0, str(Path(__file__).parent))
    import main as scraper  # after patching: no request may pass unrecorded

    sources = [s for s in scraper.sources if not names or s.name in names]
    expected = json.loads(EXPECTED.read_text()) if EXPECTED.exists() else {}
    if mode == "record":
        RESPONSES.mkdir(parents=True, exist_ok=True)
        start = datetime.now(timezone.utc)

    results = {}
    for source in sources:
        # each source keeps the clock of its own record (a source can be recorded again alone)
        if mode == "record":
            now = start
        elif source.name in expected:
            now = datetime.fromisoformat(expected[source.name]["recorded_at"])
        else:
            results[source.name] = {"error": "not recorded"}
            continue
        freeze(scraper_modules(), now, no_sleep=mode == "check")
        results[source.name] = {"recorded_at": now.isoformat()} | run(source)
        print(f"{mode:<7} {source.name}: {len(results[source.name].get('events', []))} events", file=sys.stderr)

    if mode == "record":
        # a full record replaces everything; a record of some sources replaces only those
        EXPECTED.write_text(json.dumps((expected if names else {}) | results, ensure_ascii=False, indent=1))
        return 0
    ACTUAL.write_text(json.dumps(results, ensure_ascii=False, indent=1))
    if names:
        expected = {k: v for k, v in expected.items() if k in names}
    failed = compare(expected, results)
    print(f"{len(results) - failed}/{len(results)} sources unchanged")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
