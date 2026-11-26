# AGENTS.md

Repository notes for coding agents. Verify operational details against the server before relying on them.

## Purpose and layout

This project collects cultural events from venue websites, stores them in PostgreSQL, and displays upcoming events in a Next.js frontend.

```text
kulturprogramm/
├── backend/
│   ├── deploy/       # Docker Compose and database initialization SQL
│   ├── enricher/     # writes the context notes through OpenRouter (main.py, Dockerfile)
│   └── scraper/      # Python scraper and its Dockerfile
├── docs/             # documentation for specific tasks (scrapers.md), README images
├── frontend/         # Next.js frontend
└── pyproject.toml    # uv project for local scraper development (with uv.lock)
```

## Runtime and services

- `backend/deploy/compose.yaml` defines PostgreSQL, scraper, enricher, frontend and pgAdmin services
  (paths relative to `backend/deploy/`; run Compose there, project `deploy`).
- PostgreSQL uses `postgres:18`; the configured database and user are both `kultur`.
- Scraper and enricher use `python:3.15-slim` with unpinned `httpx`, `psycopg[binary]` 3 (scraper
  also `beautifulsoup4`, `pillow`).
- The frontend is a Next.js application (`node:22-alpine` image, `frontend/Dockerfile`). `getProgramme()`
  (`frontend/lib/get-programme.ts`) reads the events from 6 hours ago to 183 days ahead and maps
  `theater`, `oper`, `tanz`, `konzert`, `film` to `theatre`, `opera`, `dance`, `concerts`, `movies`.
  Without `PGPASSWORD_FILE` it shows a demo programme. Data contract: `frontend/lib/types.ts`.
- Timeline rows: city → organizer → venue (`groupVenues` in `lib/plan.ts`); a frontend `Venue` is one
  organizer at one venue. A venue named like its organizer gets no line of its own. The day strip shows
  7 days plus a "later" button for days 8–183: one line per production with one square per performance
  (`season-timeline.tsx`) or one card per production (`SeasonPoster`). Picks are saved under the day of
  each performance; "Mein Abend" (`plan-panel.tsx`) lists all of them from today on, by day, each as a
  short event card (title: the full card, "+N": the card with its dates drawer open).
- Event card: "+N" opens a drawer of the production's dates (`CardContext`, `guide.tsx`), a 14-day or 7-month grid, then rows; a tap switches the card in place.
  "Kontext" (looked-up productions only) opens the note as a whispered speech bubble: the Souffleur
  speaks, the Ticket for films (`mascots.tsx`); without a note a fixed line from `i18n.ts`. Phones: both drawers are sheets at the bottom of the screen.
  "Teilen" shares `/e/<id>` (`components/share-page.tsx`) and warms its preview `/e/<id>/preview.jpg`
  (`lib/og-image.tsx`: JPEG, photos via sharp, last 300 kept in memory).
- "Kontext" view (`read-view.tsx`, `#context`): follows the day strip; one entry per production with a note, at its
  first performance (a day: by start time; "later": by date and time). NEU: `imported_at` under 7 days old.
- Interface texts: `frontend/lib/i18n.ts`, German at `/` (default), English at `/en`; data untranslated.
- Legal pages: `/impressum`, `/datenschutz` (EN `/en/imprint`, `/en/privacy`), texts in `lib/legal.tsx`; update the
  privacy text with any new data processing. The imprint's contact form stores into `messages` (`/api/contact`).
- Installable (PWA): `frontend/app/manifest.ts`, starts at `/`; icons from `public/icon.svg`, maskable one with the star in the safe zone.
- Compose expects the host password file at `/etc/kulturprogramm/pg_password` (not `/run`, emptied
  at boot). All services restart with the host (`unless-stopped`).

## Database

The schema, in short (full: `backend/deploy/init.sql`):

```sql
-- images (key: first 32 hex digits of the bytes' sha256, source_url, content_type, data,
-- fetched_at), served at /img/<key>; messages (contact form)
CREATE TABLE productions (  -- one per title per source (Source.name)
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source      text NOT NULL,  -- the website's key (Source.name)
    title       text NOT NULL,
    category    text NOT NULL CHECK (category IN ('film', 'theater', 'oper', 'konzert', 'tanz')),
    image_key   text REFERENCES images (key),
    imported_at timestamptz NOT NULL DEFAULT now(),  -- first save; never updated (order: id)
    note_de     text,          -- context note (enricher); NULL with enriched_at set: nothing found
    note_en     text,
    enriched_at timestamptz,   -- NULL: not looked up yet
    UNIQUE (source, title)
);

CREATE TABLE events (  -- one dated performance or screening
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    production_id bigint      NOT NULL REFERENCES productions (id),
    organizer     text        NOT NULL,  -- who hosts it, in full ("Tanztheater Wuppertal Pina Bausch")
    venue         text        NOT NULL,  -- stage or building; a production can play at several
    city          text        NOT NULL,
    starts_at     timestamptz NOT NULL,
    ends_at       timestamptz,
    url           text,
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (production_id, venue, city, starts_at)
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

Title, category and image live once per production; events hold date, organizer and place. `save()`
upserts new images, then productions (category, `image_key` kept when the new lookup
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
| text | mono 400 12 | every sentence and meta line; the context note in IBM Plex Mono (sturdier) |
| ui | Arial 700 13 | buttons, controls, venue names |
| title-s | Poster 15 | timeline bar titles |
| title-m | Poster 22 | card, step and tooltip titles |
| title-l | Poster 32 | section headings |

- Sizes are `calc(N * var(--zs))`; `--zs` scales 1–1.5px with the page, like the timeline's zoom `Z`.
- Secondary text is grey (`--grey`), never smaller or lighter. Colours: only in `lib/colors.ts`
  (palette, `CAT`, `CAT_DARK`); CSS reads them as `var(--ink)`, `var(--cat-opera)`, `var(--cat-dark-opera)`.
- Fixed sizes: logo, hero headline, view toggle and category buttons (Poster 18px, upper case, 15px
  on phones), day-card dates (Poster 24px), small day-card and "In focus" lines (mono 11px), hint,
  "Stand" and zoom-hint lines (mono 12px). `globals.css` holds the `@font-face` rules and v0 leftovers; set no fonts there.

## Configuration and secrets

Compose sets `PGHOST`, `PGUSER`, `PGDATABASE`, `PGPASSWORD_FILE` (frontend also `PGPORT`). libpq
ignores `PGPASSWORD_FILE`: scraper, enricher and frontend read the file and pass the password on.
All receive the `pg_password` Compose secret at `/run/secrets/pg_password`; PostgreSQL bind-mounts
the host file to that path and reads it through `POSTGRES_PASSWORD_FILE`. Do not put credentials in
the repository. PostgreSQL and frontend ports are bound to `127.0.0.1` on the host.

## Scraper

`backend/scraper/main.py` holds all sources (one `Source` class per website) and the run loop. Before
you add or change a source, read [`docs/scrapers.md`](docs/scrapers.md): code model, rules, naming,
and the notes per source.

- Logging (scraper and enricher): `log.info(f"{self.ctx} …")`, every line `time LEVEL <source or
  production, fixed column> | message`, stdout only. INFO: a few lines per source; per-event detail
  is `log.debug` (`LOG_LEVEL=DEBUG`). Keep this format; no `print()`.

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
plain HTTP; model `ENRICH_MODEL`, default `deepseek/deepseek-v4.1-flash`); the answer is
`<de>…</de><en>…</en>` (text outside is dropped) or `NICHTS`. The prompt (`SYSTEM`) holds the Souffleur's voice and rules. Once: put an
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

These rules are for every task. Each chat starts without memory of earlier chats: this file and
`docs/` are the shared knowledge. Add what a later chat needs to know; remove what is out of date.

- A question is not a request to change code. Answer it, then ask before you change anything.
- Keep changes within the scope of the request.
- Prefer one simple, consistent model over source-specific patches when the
  sources support it.
- Hard limit: `AGENTS.md` must not exceed 350 lines. Condense or remove
  outdated content before adding more.
- Keep documentation direct: Simplified Technical English (ASD-STE100) and the Google developer
  documentation style. Explain each term that a reader can not know.
- Root files only for what tools load or GitHub shows (`README.md`, `AGENTS.md`, `CLAUDE.md`);
  other documentation goes into `docs/`, linked from here.
- HTML samples supplied as text may be Python `repr()` output (a leading quote,
  literal `\r\n`): decode them with `ast.literal_eval` before parsing.

### Git and pull requests

- Never commit to `main`. For each task: a new branch from a fresh `origin/main`, one pull request.
- Do not push to the branch of a merged pull request: GitHub does not show the new commits in it.
  Open a new branch and pull request.
- Do not base a branch on another unmerged branch unless asked: merging it also merges the other.
- Push with `git -c push.negotiate=true push -u origin <branch>`. Open the pull request with
  `gh api repos/Ayushi141/kulturprogramm/pulls -f title=… -f head=<branch> -f base=main -f body=…`.
- The description says what changed, why, and what to do after the merge (see below).

### Testing

- Frontend: `cd frontend && pnpm install && pnpm dev -p 3000` shows the demo programme (no
  `PGPASSWORD_FILE`, no database). Before each pull request: `npx tsc --noEmit -p .` in `frontend/`.
- Look at each visual change: take screenshots with Playwright (`playwright-core` with an installed
  Chrome) at desktop (1600×1000) and phone (390×844) width, and send them to the user. The demo
  notes are short: to test a long note, replace the note text in the page with a long text.
- Scraper or SQL: use a local PostgreSQL with the schema from `init.sql`. If the cluster encoding is
  not UTF-8, set `PGCLIENTENCODING=UTF8`, else psycopg returns `bytes`.
- CSS trap: the CSS reset sets `[hidden]` to `display: none !important`. To hide an element and keep
  its space, use your own attribute (as `data-off` in `event-card.tsx`) with `visibility: hidden`.
- CSS trap: in a flex row, each text piece between elements (`{a} · {b}`) is its own flex item and
  wraps by itself. Put the text into one `<span>`.
- `npx tsc` before the first `pnpm dev` fails with "Cannot find name 'RouteContext'": Next.js
  generates that type. Start `pnpm dev` once (or run `npx next typegen`), then run `tsc`.
- Screenshot scripts: the demo programme uses real times, so late in the day "today" can be empty.
  Select a later day (`.x-day` buttons) before you pick events. The poster bookmarks (`.bookmark`)
  show only on hover: wait with `{ state: 'attached' }` and click with `el.evaluate(e => e.click())`.

### After a merge

- Frontend only: nothing to do. The deploy timer rebuilds it in a few minutes (see "Deployment").
- Scraper or enricher: on the server, `cd ~/aggregator && git pull && docker compose -p deploy up -d
  --build --force-recreate scraper` (or `enricher`).
- `init.sql`: an existing database does not change (see "Database").
- One-time commands (as `shrink_stored()`): write them into the pull request description.

## Open implementation questions

- `Event` inherits from `ABC` without abstract methods: make it a dataclass? Remove cancelled events?
