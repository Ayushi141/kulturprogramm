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
  `beautifulsoup4`, and `psycopg[binary]` 3, installed unpinned in
  `backend/scraper/Dockerfile`.
- The frontend is a Next.js application (`node:22-alpine` image, built from
  `frontend/Dockerfile`). `getProgramme()` in `frontend/lib/get-programme.ts`
  reads `venues` and events from 6 hours ago to 8 days ahead, and maps
  categories `theater`, `oper`, `film` to the frontend's `theatre`, `opera`,
  `movies`; other categories are not shown. Without `PGPASSWORD_FILE` it shows
  a demo programme. The data contract is `frontend/lib/types.ts`.
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

CREATE TABLE events (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title      text        NOT NULL,
    venue_id   text        NOT NULL REFERENCES venues (id),
    category   text        NOT NULL,
    starts_at  timestamptz NOT NULL,
    ends_at    timestamptz,
    url        text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (title, venue_id, starts_at)
);
```

There is no category `CHECK` constraint in the current schema. `init.sql` runs
when PostgreSQL initializes an empty data volume; changing it does not update
an existing database. Apply a separate migration to an existing database when
changing its schema.

Each row represents one event at one start time. `ends_at` is NULL when the
source lists no end time. The unique key lets the scraper update an existing
event with the same title, venue, and start time. `save()` first upserts the
events' venues, then updates `category`, `ends_at`, `url`, and `updated_at` on
event conflict. It does not remove
events that disappear from a venue's program, so cancelled or expired rows can
remain in the database.

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
  `starts_at`, an optional aware `ends_at`, and an optional absolute `url`.
- `Source` stores a source key and URL and defines the abstract `scrape()`
  method.
- Each source's `scrape()` fetches and parses events. `Source.save()` upserts
  the events' venues, then the events.
- The run loop scrapes each source in `sources`, saves its results, and sleeps
  for one day. If a source raises, the loop prints the traceback and continues
  with the next source, so one failing source does not stop the others.

### Scraper implementation rules

- Make datetimes aware using `ZoneInfo("Europe/Berlin")`.
- Use `%s` placeholders in SQL. Do not interpolate values into SQL strings.
- Set an HTTP timeout; the current scrapers use `timeout=60`.
- Let parse errors surface instead of silently dropping malformed records;
  the run loop logs them per source.
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
- Venue: fixed `Schauspiel Köln` in `Köln`; the calendar names no stage.
- End: always `None`; the calendar gives no end or length. Production pages
  list stage and length (for example, `Schauspielhaus 1 h 45 min`), but are
  not fetched.
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
