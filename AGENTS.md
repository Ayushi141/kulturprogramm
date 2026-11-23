# AGENTS.md

Repository notes for coding agents. Verify operational details against the server before relying on them.

## Purpose and layout

This project collects cultural events from venue websites, stores them in PostgreSQL, and displays upcoming events in a Next.js frontend.

```text
aggregator/
├── backend/
│   ├── deploy/       # Docker Compose and database initialization SQL
│   ├── enricher/     # writes the context notes through OpenRouter (main.py, Dockerfile)
│   └── scraper/      # Python scraper and its Dockerfile
├── frontend/         # Next.js frontend
└── pyproject.toml    # uv project for local scraper development (with uv.lock)
```

## Runtime and services

- `backend/deploy/compose.yaml` defines PostgreSQL, scraper, enricher, frontend and pgAdmin services
  (paths relative to `backend/deploy/`; run Compose there, project `deploy`).
- PostgreSQL uses `postgres:18`; the configured database and user are both `kultur`.
- Scraper and enricher use `python:3.15-slim` with unpinned `httpx`, `psycopg[binary]` 3 (scraper
  also `beautifulsoup4`, `pillow`).
- The frontend is a Next.js application (`node:22-alpine` image, built from
  `frontend/Dockerfile`). `getProgramme()` in `frontend/lib/get-programme.ts`
  reads `venues` and events from 6 hours ago to 183 days ahead, and maps
  categories `theater`, `oper`, `tanz`, `konzert`, `film` to `theatre`, `opera`,
  `dance`, `concerts`, `movies`; others are not shown. Without `PGPASSWORD_FILE`
  it shows a demo programme. The data contract is `frontend/lib/types.ts`.
- The day strip shows 7 days plus a "later" button for days 8–183: one line
  per production with one square per performance (`season-timeline.tsx`) or
  one card per production (`SeasonPoster`). Picks are saved under the day of
  each performance.
- Event card: "+N" opens a drawer of the production's dates (`CardContext`, `guide.tsx`), a 14-day or 7-month grid, then rows; a tap switches the card in place.
  "Kontext" (looked-up productions only) opens the note as a whispered speech bubble: the Souffleur
  speaks, the Abriss for films (`mascots.tsx`); without a note a fixed line from `i18n.ts`.
  "Teilen" shares `/e/<id>` (`components/share-page.tsx`) and warms its preview `/e/<id>/preview.jpg`
  (`lib/og-image.tsx`: JPEG, photos via sharp, last 300 kept in memory).
- Interface texts: `frontend/lib/i18n.ts`, German at `/` (default), English at `/en`; data untranslated.
- The Compose configuration expects the host password file at
  `/etc/kulturprogramm/pg_password` (not `/run`, which is emptied at boot).
  PostgreSQL and the frontend restart with the host (`unless-stopped`).

## Database

The schema, in short (full: `backend/deploy/init.sql`):

```sql
-- venues (id, name, city); images (key: first 32 hex digits of the bytes' sha256,
-- source_url, content_type, data, fetched_at), served at /img/<key>
CREATE TABLE productions (  -- one per title per source (Source.name)
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source      text NOT NULL,
    title       text NOT NULL,
    category    text NOT NULL CHECK (category IN ('film', 'theater', 'oper', 'konzert', 'tanz')),
    image_key   text REFERENCES images (key),
    note_de     text,          -- context note (enricher); NULL with enriched_at set: nothing found
    note_en     text,
    enriched_at timestamptz,   -- NULL: not looked up yet
    UNIQUE (source, title)
);

CREATE TABLE events (  -- one dated performance or screening
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    production_id bigint      NOT NULL REFERENCES productions (id),
    venue_id      text        NOT NULL REFERENCES venues (id),
    starts_at     timestamptz NOT NULL,
    ends_at       timestamptz,
    url           text,
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (production_id, venue_id, starts_at)
);
CREATE INDEX events_starts_at ON events (starts_at);  -- the frontend's window
CREATE INDEX events_production_id ON events (production_id);

CREATE TABLE featured (  -- productions shown in the "In focus" card
    production_id bigint PRIMARY KEY REFERENCES productions (id) ON DELETE CASCADE,
    until         date,  -- last day (inclusive); NULL = until deleted
    added_at      timestamptz NOT NULL DEFAULT now()
);
```

`init.sql` runs when PostgreSQL initializes an empty data volume; changing it does not update an
existing database. Recreate the database (`docker compose down -v`, then start PostgreSQL and run
the scraper; it refills everything in minutes). No migration files.

Title, category and image live once per production; events hold only the date data. `save()`
upserts venues and new images, then productions (category, `image_key` kept when the new lookup
found none), then events (`ends_at`, `url`, `updated_at` on a conflict). Two writers share
`productions`: the scraper and the enricher each update only their own columns, never whole rows.
Events that disappear from a program are not removed, so cancelled or expired rows can remain.

## Frontend typography

All text styles are in the "Type system" block at the end of `frontend/app/explorer.css`; the
timeline SVG uses them through `T` in `timeline.tsx`. Use one of these seven, no new sizes or weights:

| Style | Font | Use |
|---|---|---|
| label | mono 700 11, tracked `.08em` | tags, badges, kickers, axis times |
| mark | mono 400 11 | small timeline marks only (overview ticks, times in bars) |
| text | mono 400 12 | every sentence and meta line |
| ui | Arial 700 13 | buttons, controls, venue names |
| title-s | Poster 15 | timeline bar titles |
| title-m | Poster 22 | card, step and tooltip titles |
| title-l | Poster 32 | section headings |

- Sizes are `calc(N * var(--zs))`; `--zs` scales 1–1.5px with the page, like the timeline's zoom `Z`.
- Secondary text is grey (`#565247`), never smaller or lighter.
- Fixed sizes: logo, hero headline, view toggle and category buttons (Poster 18px, upper case, 15px
  on phones), day-card dates (Poster 24px), small day-card and "In focus" lines (mono 11px), hint,
  "Stand" and zoom-hint lines (mono 12px). `globals.css` holds v0 leftovers; set no fonts there.

## Configuration and secrets

Compose sets `PGHOST`, `PGUSER`, `PGDATABASE`, `PGPASSWORD_FILE` (frontend also `PGPORT`). libpq
ignores `PGPASSWORD_FILE`: scraper, enricher and frontend read the file and pass the password on.
All receive the `pg_password` Compose secret at `/run/secrets/pg_password`; PostgreSQL bind-mounts
the host file to that path and reads it through `POSTGRES_PASSWORD_FILE`. Do not put credentials in
the repository. PostgreSQL and frontend ports are bound to `127.0.0.1` on the host.

## Scraper code model

All scraper classes and the run loop are in `backend/scraper/main.py`.

- `Category` is a `StrEnum`: `FILM = "film"`, `THEATER = "theater"`, `OPER =
  "oper"`, `CONCERT = "konzert"`, and `TANZ = "tanz"` (ballet and dance
  theatre). These values are written to the database; add new ones to the `category` check in `init.sql`, `CATEGORY` in
  `frontend/lib/get-programme.ts`, and every `Record<Category, …>` the type
  checker then flags (colour, labels, icon, typical length, `.cat-*` fallback).
- A `Source` is one website; a `Venue` is one physical place. One source can
  list several venues (Filmkunstkinos lists four cinemas).
- `Venue` is a frozen dataclass with `id`, `name`, and `city`; it becomes a
  `venues` row, like the frontend's `Venue`. Build its `id` as
  `f"{self.name}-{slugify(name)}"`.
- `Event` is a dataclass with `title`, `venue`, `category`, an aware
  `starts_at`, an optional aware `ends_at`, an optional absolute `url`, and
  optional `image_url` (set by `scrape()` when the program page shows one) and
  `image_key` (set by `add_images()`).
- `Source` stores a key and URL; its abstract `scrape()` fetches and parses
  events, and `save()` upserts their venues, new images, productions, then the events.
- Images: `Source.scrape_image(event)` returns an image URL or `None`; the
  default returns `event.image_url`, else the `og:image` of `event.url`.
  `Source.add_images(events)` calls it once per title and stores the original bytes (Pillow checks
  the format; over `MAX_SIDE` 2000 px shrunk to JPEG, PNG if transparent), keyed by a hash of the
  bytes. It never raises: a failure is a warning, the event keeps no image. A production's stored
  image (same source and title) is reused, so a run only looks up new productions.
- The run loop scrapes each source, adds images, saves, logs which sources failed, sleeps one day.
  A raising source is logged with its traceback; the others continue.
- Logging (scraper and enricher): `log.info(f"{self.ctx} …")`, every line `time LEVEL <source or
  production, fixed column> | message`, stdout only. INFO: a few lines per source; per-event detail
  is `log.debug` (`LOG_LEVEL=DEBUG`). Keep this format; no `print()`.

### Scraper implementation rules

- Make datetimes aware using `ZoneInfo("Europe/Berlin")`.
- Use `%s` placeholders in SQL. Do not interpolate values into SQL strings.
- Set an HTTP timeout; the current scrapers use `timeout=60`. Sites that
  answer 403 to httpx get `User-Agent: Mozilla/5.0`, as `download_image()` sends.
- Let parse errors surface instead of silently dropping malformed records;
  the run loop logs them per source. Images are the exception: they are
  optional, so image errors never stop an event from being saved.
- Store public performances and concerts. Skip cancelled cards by the site's
  marker, then classify with `self.event_category(default, *texts)` (on
  `Source`, with its word lists as class attributes) on short texts
  (title, label, badge, subtitle; never descriptions): `CLOSED` (school, Kita)
  skips, `CONCERT` words give `CONCERT`, `NON_PERFORMANCE` words (Führung,
  Workshop, Lesung, Gespräch, Matinee, Party) skip. Prefer page structure;
  keep the word lists generic, never per event. `+ Einführung` is ignored.
  Cinemas use `self.screening_category(title, *labels)` instead, which skips
  nothing: genre/series labels matching `DANCE_LABEL`/`OPERA_LABEL` give
  `TANZ`/`OPER` (never titles), a `CONCERT` word gives `CONCERT`, else `FILM`.
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

The notes below describe the parser implementation. They are not a guarantee that a venue's live
page has not changed.

### Filmkunstkinos
- `https://filmkunstkinos.de/programm/`: one `article.col-group` per film and
  cinema. Title: direct text of `h2.movie-small--title a`
  (`find(string=True, recursive=False)` drops `span.extended-title`); URL: its
  `href`. Venue `span.meta-theater-logo` (`Metropol`, `Bambi`, `Cinema`,
  `Atelier`) in Düsseldorf. Each `time[datetime]` is a screening labelled
  `+00:00` but local: replace the timezone, do not convert. End: start plus
  `.movie-small--meta p.meta` (`100 Min`, without trailers). Labels: the
  genres before its first `•`.

### Dhaus (Düsseldorfer Schauspielhaus)
- `https://www.dhaus.de/programm/spielplan/schauspiel`: one `div.performance`
  each. Title `.performance__title [itemprop=name]` without soft hyphens, its
  link made absolute. Start: naive `meta[itemprop=startDate]`; end only from
  `.performance__time` (`19:00 – 20:15`), moved to the next day if not after
  the start. Venue `.performance__location` without `📍`; city after the postal
  code in the hidden `[itemprop=location] [itemprop=address]`. Cancelled cards
  are skipped; title and `.performance__infos .performance__text` are
  classified, default `THEATER`.

### Schauspiel Köln
- `https://www.schauspiel.koeln/kalender`: one `li.s-bko-activity` each. Title
  and link `.field--name-production a`; start: date of
  `time.s-bko-activity__datetime[datetime]` plus its last text piece
  (`"%Y-%m-%d %H.%M Uhr"`). `production(url)` reads each production page once
  per run: stage `.field--name-stages` in Köln (several or none: general
  `VENUE` Schauspiel Köln), length `.field--name-duration` (`1 h 45 min`,
  `5 h`; missing for about a third, unknown formats logged), `og:image`. A
  failing page is logged; its events keep the general venue, no end or image.
  Label `.field--name-category` is classified with the title, default
  `THEATER`; `Entfällt` tickets are skipped.

### Deutsche Oper am Rhein (Opernhaus Düsseldorf)
- `https://www.operamrhein.de/spielplan/kalender/duesseldorf/`: `div.performance`
  at Opernhaus with a `.performance__category` (tours have none), default
  `TANZ` for `Ballett`, else `OPER`. Cards give title/link, start, optional end.

### Theater Krefeld-Mönchengladbach
- `https://theater-kr-mg.de/kalender/` (`article.performance`): the first
  listed branch in `BRANCHES` gives the default category; `Extras` keeps only
  concerts. Cards provide title, URL, venue, start; no end.

### Oper Wuppertal
- `https://api.wb.c4c.it/api/performances`, JSON-LD Accept, all pages (at most 50 items each). Keep
  Oper at Opernhaus (`OPER`) and all Sinfonieorchester concerts; API gives title, URL, venue, times.
  Image: `production.image.src` of `/api/performances/<id>` (id ends the page URL; not in the list).

### Theater und Philharmonie Essen
- `https://www.theater-essen.de/programm/kalender/` (`div.performance`): the
  first category in `CATEGORIES` (Schauspiel, Aalto, Philharmonie) gives the
  default; `Treffpunkt:` locations (tours) are skipped and the ticket line
  marks closed shows. Cards provide title/times/venue.

### Oper Köln
- `https://www.oper.koeln/programm` (`li.s-bko-activity--schedule`): cards
  provide label, local times and production links; the info line marks Kita
  bookings. Venue Oper Köln, default `OPER`; image: `og:image` of the link.

### Schauspielhaus Bochum
- Read `/de/spielplan/11/tanz` (`TANZ`), then `/de/spielplan/13/schauspiel`
  (`THEATER`, also lists dance; first listing wins). `.schedule__group`/`.schedule__item`
  give date/title/stage/times; skip Theater Hagen, `Fällt aus`. Image (no og:image): inline
  background of `.production__title-image`, else first `img.lazyimage[data-src]`.

### Pina Bausch
- `https://www.pina-bausch.de/de/calendar`: season JSON in `data-page`. Keep
  Wuppertal dates whose event links played pieces (`plays`); labs and classes
  link none. `TANZ`, UTC times, no end; image from the event page JSON.

### UFA Palast Düsseldorf
- `https://ufa-duesseldorf.de/programm/`: every announced day (presales months
  ahead) as `section.day-section`, one `article.movie-row` per film: title `h2`
  in `a.group` (the film page), runtime in the div after it (`2 Std 39 Min`,
  `2 Std`, `95 Min`), poster `img`. Each `.showtime-wrap[data-date][data-time]`
  is a screening; screens (`Kino 13`) are halls of venue `UFA Palast`. Labels:
  the row's `.prog-badge`s (`MET Opera`). `#all-movies-view` repeats all rows.

### UCI Kinowelt Düsseldorf
- `https://www.uci-kinowelt.de/kinoprogramm/duesseldorf/50` (`/day` shows only
  today): one `div.film-container` per film, title link
  `h2.film-container__description__text__eventtitle a`, `159min` in
  `ul.film-info` (missing for unreleased films), poster `img.film-thumb`;
  screenings `a.badge-performance[data-date="20261120"][data-time]`. Venue
  `UCI Kino`; labels: the `ul.film-info` genres (`Oper`, `Ballett`). Page and
  posters need a browser User-Agent. Both cinemas date after-midnight
  screenings by calendar day (UFA's ticket page: "Mittwoch, 16.12.26 00:05").

### Rheinisches Landestheater
- Not registered: its page has filters but no dated events yet.

## Common operations

Run these commands from `backend/deploy/`. Start PostgreSQL: `docker compose up -d postgres`.

Run the scraper image, rebuilt from the current source (the loop never exits; stops with Ctrl+C):

```bash
docker compose run --rm --build scraper
```

Query the database (`docker compose exec postgres psql -U kultur -d kultur`), for example event
times in Berlin time:

```sql
SELECT p.title, e.starts_at AT TIME ZONE 'Europe/Berlin'
FROM events e JOIN productions p ON p.id = e.production_id
ORDER BY e.starts_at;
```

Feature a production in the "In focus" card (the card shows its next performance, from the
selected day on):

```sql
INSERT INTO featured (production_id, until)
SELECT id, '2026-11-30' FROM productions WHERE title = 'Der Hobbit';
DELETE FROM featured USING productions p WHERE p.id = production_id AND p.title = 'Der Hobbit';
```

`docker compose down -v` deletes the PostgreSQL data volume and its data.

Enricher (`backend/enricher/main.py`): for productions with upcoming dates and `enriched_at` NULL,
one request through OpenRouter with its server tools (`TOOLS`: search via Parallel turbo, fetch via
plain HTTP; model `ENRICH_MODEL`, default `deepseek/deepseek-v4.1-flash`); the answer is German, `---`,
English, or `NICHTS`. The prompt (`SYSTEM`) holds the Souffleur's voice and rules. Once: put an
OpenRouter key into `/etc/kulturprogramm/openrouter_api_key`. Try it: `docker compose run --rm
--build enricher python main.py --dry-run --limit 5`. Run: `docker compose up -d --build enricher`
(30 every 6 hours, sent at once; `ENRICH_PARALLEL`). Look up again: `UPDATE productions SET enriched_at = NULL WHERE …`.

pgAdmin (database admin in the browser) listens only on the server, `127.0.0.1:5050`; never publish
it (it has had remote-code-execution bugs for logged-in users). Once: `sudo install -o 5050 -g 5050
-m 600 /dev/null /etc/kulturprogramm/pgadmin_password` (5050: the container user), write a password
into it, `docker compose -p deploy up -d pgadmin`. Use: `ssh -L 5050:127.0.0.1:5050 <user>@<server>`,
`http://localhost:5050`, login `admin@kulturprogramm.eu`; connection "kulturprogramm" asks for the
`kultur` password. Update: `docker compose -p deploy pull pgadmin`, then `up -d pgadmin` again.

## Deployment

The server's `~/aggregator` is a git clone (read-only deploy key). The systemd timer
`aggregator-deploy.timer` (files in `backend/deploy/systemd/`) runs `backend/deploy/update.sh` a
minute after each run: when `main` has new commits, it resets the clone to them and rebuilds the
frontend (project `deploy`); logs: `journalctl -u aggregator-deploy`. Scraper and enricher are not
redeployed (they loop forever): rebuild them by hand after changes.

## Working in this repository

- Keep changes within the scope of the request.
- Prefer one simple, consistent model over source-specific patches when the
  sources support it.
- Keep documentation direct and easy to follow.
- Hard limit: `AGENTS.md` must not exceed 350 lines. Condense or remove
  outdated content before adding more.
- HTML samples supplied as text may be Python `repr()` output (a leading quote,
  literal `\r\n`): decode them with `ast.literal_eval` before parsing.

## Open implementation questions

- `Event` inherits from `ABC` without abstract methods; make it a dataclass? Removing events saved
  before they were cancelled?
