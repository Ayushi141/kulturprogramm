# AGENTS.md

Repository notes for coding agents. Verify operational details against the
server before relying on them; only files in this repository were checked for
this document.

## Purpose and layout

This project collects cultural events from venue websites, stores them in
PostgreSQL, and displays upcoming events in a Next.js frontend.

```text
aggregator/
├── backend/
│   ├── deploy/       # Docker Compose and database initialization SQL
│   └── scraper/      # Python scraper and its Dockerfile
├── frontend/         # Next.js frontend
└── pyproject.toml    # uv project for local scraper development (with uv.lock)
```

Compose files use paths relative to `backend/deploy/`. Run Compose commands
from that directory, or pass the Compose file explicitly.

## Runtime and services

- `backend/deploy/compose.yaml` defines PostgreSQL, scraper, and frontend
  services. The Compose project name defaults to `deploy` when run from
  `backend/deploy/`.
- PostgreSQL uses `postgres:18`; the configured database and user are both
  `kultur`.
- The scraper image uses `python:3.15-slim`. Its dependencies are `httpx`,
  `beautifulsoup4`, `psycopg[binary]` 3, and `pillow`, installed unpinned in
  `backend/scraper/Dockerfile`.
- The frontend is a Next.js application (`node:22-alpine` image, built from
  `frontend/Dockerfile`). `getProgramme()` in `frontend/lib/get-programme.ts`
  reads `venues` and events from 6 hours ago to 183 days ahead, and maps
  categories `theater`, `oper`, `film` to the frontend's `theatre`, `opera`,
  `movies`; other categories are not shown. Without `PGPASSWORD_FILE` it shows
  a demo programme. The data contract is `frontend/lib/types.ts`.
- The day strip shows 7 days plus a "later" button for days 8–183: one line
  per production with one square per performance (`season-timeline.tsx`) or
  one card per production (`SeasonPoster`). Picks are saved under the day of
  each performance.
- Interface texts are in `frontend/lib/i18n.ts`: German at `/` (default),
  English at `/en`. Programme data is not translated.
- The Compose configuration expects the host password file at
  `/run/secrets/pg_password`. That path is outside the repository and must
  exist on the host before starting the services.

## Database

The current schema is in `backend/deploy/init.sql`:

```sql
CREATE TABLE venues (
    id   text PRIMARY KEY,
    name text NOT NULL,
    city text NOT NULL
);

CREATE TABLE images (
    key          text PRIMARY KEY,  -- sha256 of the image bytes (first 32 hex digits)
    source_url   text        NOT NULL,
    content_type text        NOT NULL,
    data         bytea       NOT NULL,
    fetched_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title      text        NOT NULL,
    venue_id   text        NOT NULL REFERENCES venues (id),
    category   text        NOT NULL,
    starts_at  timestamptz NOT NULL,
    ends_at    timestamptz,
    url        text,
    image_key  text REFERENCES images (key),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (title, venue_id, starts_at)
);

CREATE TABLE featured (
    title    text PRIMARY KEY,  -- event title shown in the "In focus" card
    until    date,              -- last day (inclusive); NULL = until deleted
    added_at timestamptz NOT NULL DEFAULT now()
);
```

There is no category `CHECK` constraint in the current schema. `init.sql` runs
when PostgreSQL initializes an empty data volume; changing it does not update
an existing database. To apply a schema change, recreate the database (see
`docker compose down -v` below) or migrate the existing one by hand.

Each row represents one event at one start time. `ends_at` is NULL when the
source lists no end time. The unique key lets the scraper update an existing
event with the same title, venue, and start time. `save()` first upserts the
events' venues and new images, then updates `category`, `ends_at`, `url`,
`image_key` (kept when the new lookup found none), and `updated_at` on event
conflict. It does not remove
events that disappear from a venue's program, so cancelled or expired rows can
remain in the database.

## Frontend typography

All text styles are in the "Type system" block at the end of
`frontend/app/explorer.css`; the timeline SVG uses the same styles through `T`
in `frontend/components/explorer/timeline.tsx`. Use one of these seven styles
instead of adding new sizes or weights:

| Style | Font | Use |
|---|---|---|
| label | mono 700 11, tracked `.08em` | tags, badges, kickers, axis times |
| mark | mono 400 11 | small timeline marks only (overview ticks, times in bars) |
| text | mono 400 12 | every sentence and meta line |
| ui | Arial 700 13 | buttons, controls, venue names |
| title-s | Poster 15 | timeline bar titles |
| title-m | Poster 22 | card, step and tooltip titles |
| title-l | Poster 32 | section headings |

- Sizes are written as `calc(N * var(--zs))`. `--zs` scales from 1px to 1.5px
  with the page, like the timeline's zoom `Z`, so chart and page text match.
- Secondary text is grey (`#565247`), never smaller or lighter.
- Exceptions with fixed sizes: the logo, the hero headline, the view toggle
  (Poster 18px, 15px on phones), the day-card dates (Poster 24px), and the
  small day-card and "In focus" lines (mono 11px), and the hint, "Stand" and
  zoom-hint lines around the chart (mono 12px). `globals.css` holds v0 template leftovers; do not set fonts there.

## Configuration and secrets

Compose sets `PGHOST`, `PGUSER`, `PGDATABASE`, and `PGPASSWORD_FILE` for the
scraper and frontend; the frontend also gets `PGPORT`. libpq reads the `PG*`
connection variables but not `PGPASSWORD_FILE`, so the scraper reads the
password from that path and passes it to `psycopg.connect()`. The frontend
reads the same file itself and passes it to the `pg` `Pool`.

The scraper and frontend receive the `pg_password` Compose secret at
`/run/secrets/pg_password`. The PostgreSQL service instead bind-mounts the host
file at that path and reads it through `POSTGRES_PASSWORD_FILE`. Do not put
credentials in the repository.

The Compose file binds PostgreSQL and frontend ports to `127.0.0.1` on the
host. Confirm server-side access and secret setup before relying on these
services in a deployment.

## Scraper code model

All scraper classes and the run loop are in `backend/scraper/main.py`.

- `Category` is a `StrEnum`: `FILM = "film"`, `THEATER = "theater"`,
  `OPER = "oper"`, and `CONCERT = "konzert"`. These values are written to the
  database; map new ones in `CATEGORY` in `frontend/lib/get-programme.ts`.
- A `Source` is one website; a `Venue` is one physical place. One source can
  list several venues (Filmkunstkinos lists four cinemas).
- `Venue` is a frozen dataclass with `id`, `name`, and `city`; it becomes a
  `venues` row, like the frontend's `Venue`. Build its `id` as
  `f"{self.name}-{slugify(name)}"`.
- `Event` is a dataclass with `title`, `venue`, `category`, an aware
  `starts_at`, an optional aware `ends_at`, an optional absolute `url`, and
  optional `image_url` (set by `scrape()` when the program page shows one) and
  `image_key` (set by `add_images()`).
- `Source` stores a source key and URL and defines the abstract `scrape()`
  method.
- Each source's `scrape()` fetches and parses events. `Source.save()` upserts
  the events' venues, new images, then the events.
- Images: `Source.scrape_image(event)` returns an image URL or `None`; the
  default returns `event.image_url`, else the `og:image` of `event.url`.
  `Source.add_images(events)` calls it once per title and stores the image's
  original bytes (no resizing or re-encoding; Pillow only checks the format),
  keyed by a hash of the bytes. It never raises: a failure is logged in
  one line and the event keeps no image. Images already stored for an event
  page are reused, so a run only fetches pages of new productions. The
  frontend serves images at `/img/<key>` from the database.
- The run loop scrapes each source in `sources`, adds images, saves, and sleeps
  for one day. If a source raises, the loop prints the traceback and continues
  with the next source, so one failing source does not stop the others.

### Scraper implementation rules

- Make datetimes aware using `ZoneInfo("Europe/Berlin")`.
- Use `%s` placeholders in SQL. Do not interpolate values into SQL strings.
- Set an HTTP timeout; the current scrapers use `timeout=60`.
- Let parse errors surface instead of silently dropping malformed records;
  the run loop logs them per source. Images are the exception: they are
  optional, so image errors never stop an event from being saved.
- Pass `category.value` to PostgreSQL.
- Use built-in generic types such as `list[Event]` in type hints.

### Naming

- Use the source's name in ASCII CapWords for its class. Write `oe` for `ö`;
  for example, `SchauspielKoeln`.
- Use a lowercase key for the `Source` name argument, such as
  `"schauspiel-koeln"`.
- The event's `venue` should identify the performance location, not
  automatically the website operator. Check the source page for available
  location information.

## Scraper sources

The notes below describe the parser implementation. They are not a guarantee
that a venue's live page has not changed.

### Filmkunstkinos

- URL: `https://filmkunstkinos.de/programm/`
- Each `article.col-group` represents a film at a cinema.
- Title: direct text of `h2.movie-small--title a`; use
  `find(string=True, recursive=False)` to omit the subtitle in
  `span.extended-title`.
- URL: the title link's `href` (the film page).
- Venue name: `span.meta-theater-logo` (`Metropol`, `Bambi`, `Cinema`, or
  `Atelier`). City: fixed `Düsseldorf`; the program page names no city.
- End: start plus the runtime in `.movie-small--meta p.meta` (`100 Min`). This
  is the film length; trailers before the film are not included.
- Each `time[datetime]` is a screening. The parser replaces its timezone with
  Berlin time because the page labels these local times with `+00:00`; it does
  not convert the clock time.
- Category: `FILM`.
- The source may be slow or return errors; the request timeout is 60 seconds.

### Dhaus (Düsseldorfer Schauspielhaus)

- URL used in the venue configuration: `https://www.dhaus.de/programm/spielplan/schauspiel`.
- Each `div.performance` is parsed as one performance.
- Title: `.performance__title [itemprop=name]`, with soft hyphens (`\xad`)
  removed. URL: that title link's `href`, made absolute.
- Start: `meta[itemprop=startDate]` attribute `content`; the parser attaches
  the Berlin timezone to the naive datetime.
- End: only in `.performance__time` text such as `19:00 – 20:15`; some
  performances show only the start, giving `ends_at = None`. An end at or
  before the start is moved to the next day.
- Venue name: `.performance__location`, with a leading `📍` removed (for
  example, `Schauspielhaus, Großes Haus`). City: the text after the postal code
  in the hidden `[itemprop=location] [itemprop=address]`.
- Category: currently always `THEATER`, including special events.

### Schauspiel Köln

- URL: `https://www.schauspiel.koeln/kalender`.
- Each `li.s-bko-activity` is parsed as one event.
- Title: `.field--name-production a`. URL: its `href` (the production page).
- Start: the date in `time.s-bko-activity__datetime[datetime]` and the last
  text piece from that element, parsed with
  `strptime(..., "%Y-%m-%d %H.%M Uhr")`; the parser attaches Berlin time.
- The calendar names no stage or length, so `production(url)` fetches each
  production page once per run and reads:
  - Venue: `.field--name-stages` (`Schauspielhaus`, `Kleines Haus`,
    `Erfrischungsraum`, `Offenbachplatz`, `Kolumba`) in `Köln`. A page listing
    several stages (`Erfrischungsraum & Kleines Haus`) or none uses the general
    `VENUE` `Schauspiel Köln`.
  - End: start plus `.field--name-duration` (`1 h 45 min`, `5 h`); `None` when
    missing (about a third of the productions). Unknown formats are logged.
  - Image: `og:image`, passed on as `image_url`.
- A production page that fails to load is logged; its events are still saved
  with the general venue and no end or image.
- Label: `.field--name-category`, or an empty string if missing. Labels in
  `EXCLUDED_LABELS` (`Führung`, `Workshop`) are skipped. `Schulvorstellung`
  is not filtered.
- Category: `CONCERT` for the `Konzert` label, otherwise `THEATER`.

## Common operations

Run these commands from `backend/deploy/`:

Start PostgreSQL:

```bash
docker compose up -d postgres
```

Run the scraper image, rebuilding it from the current source. The run loop
never exits, so this stays in the foreground until stopped:

```bash
docker compose run --rm --build scraper
```

Query the event count:

```bash
docker compose exec postgres psql -U kultur -d kultur -c "SELECT count(*) FROM events;"
```

Show event times in Berlin time:

```sql
SELECT title, starts_at AT TIME ZONE 'Europe/Berlin'
FROM events
ORDER BY starts_at;
```

Delete all rows while keeping the table:

```sql
TRUNCATE events;
```

Feature a production in the "In focus" card (title as in `events`; the card
shows its next performance, from the selected day on):

```sql
INSERT INTO featured (title, until) VALUES ('Der Hobbit', '2026-11-30');
DELETE FROM featured WHERE title = 'Der Hobbit';
```

`docker compose down -v` deletes the PostgreSQL data volume and its data.

## Deployment scheduling

The repository does not configure a systemd timer. If a timer is installed on
the server, verify its unit files and schedule directly on that server; do not
assume the following values are active configuration. The previously proposed
schedule was daily at 06:00 with up to 10 minutes of random delay, using a
oneshot service in `/home/deploy/aggregator/backend/deploy/`. A oneshot
service does not fit the current scraper, which loops forever and sleeps
between runs; the scraper Compose service also has no `restart` policy.

## Working in this repository

- Keep changes within the scope of the request.
- Prefer one simple, consistent model over source-specific patches when the
  sources support it.
- Keep documentation direct and easy to follow.
- Hard limit: `AGENTS.md` must not exceed 350 lines. Condense or remove
  outdated content before adding more.
- HTML samples supplied as text may be Python `repr()` output, with a leading
  quote and literal `\r\n`. Decode such samples with
  `ast.literal_eval` before parsing them. The scraper receives real HTML from
  `response.text`.

## Open implementation questions

- `Event` inherits from `ABC`, although it has no abstract methods; it may be
  a plain dataclass.
- Decide how to remove or mark cancelled events.
- Decide whether to include `Lesung`, `Party`, and Dhaus special events, and
  how to categorize them.
