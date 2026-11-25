# Kulturprogramm

**[kulturprogramm.eu](https://kulturprogramm.eu)** shows theatre, opera, dance, concerts and films
from venues in North Rhine-Westphalia on one timeline. Pick a day, see what is on, plan your evening,
and go to the venue's page for tickets.

![Kulturprogramm: the day strip, the categories and the timeline (demo programme)](docs/screenshot.webp)

## Features

- **One timeline per day.** Every performance and screening of the day, by venue, from morning to
  night. The "later" view shows the next six months, one line per production.
- **Your evening.** Pick performances, and the plan shows the breaks and overlaps between them.
  Picks stay in your browser. Nothing is sent to a server.
- **Context.** A short note on each production: what it is about, who made it, why it is worth a look.
  An AI model with web search writes the notes. The Souffleur (stage) and the Ticket (films) present them.
- **German and English.** German at `/`, English at `/en`. Programme data is not translated.
- **Installable.** The site is a progressive web app.

## How it works

```text
venue websites ──▶ scraper ──▶ PostgreSQL ──▶ Next.js frontend ──▶ visitors
                                  ▲
                    enricher ─────┘  (context notes, through OpenRouter)
```

| Part | Path | What it does |
|---|---|---|
| Scraper | `backend/scraper/main.py` | Reads each venue's programme page once a day and stores productions, performances and images. One class per website. |
| Enricher | `backend/enricher/main.py` | Writes the context note of each new production. |
| Database | `backend/deploy/init.sql` | Venues, productions, events, images. |
| Frontend | `frontend/` | Next.js. Reads the database on each request; serves the stored images, so visitors never load anything from the venues. |
| Deployment | `backend/deploy/` | Docker Compose, plus a systemd timer that deploys new commits on `main`. |

[`AGENTS.md`](AGENTS.md) is the full technical reference: schema, conventions, every scraper source,
and the operations on the server. It is written for people and for coding agents.

## Run it locally

The frontend runs without a database. It then shows a demo programme with invented titles and times.

```bash
cd frontend
pnpm install
pnpm dev            # http://localhost:3000
```

Requirements: Node.js 22 and pnpm. More in [`frontend/README.md`](frontend/README.md).

### The full stack

Requirements: Docker with Compose.

1. Put a database password into `/etc/kulturprogramm/pg_password`. For context notes, also put an
   [OpenRouter](https://openrouter.ai) API key into `/etc/kulturprogramm/openrouter_api_key`.
2. In `backend/deploy/`, start the database and the frontend, then run the scraper once:

   ```bash
   docker compose up -d postgres
   docker compose up -d --build frontend      # http://localhost:3000
   docker compose run --rm --build scraper    # scrapes all sources, then waits a day; stop with Ctrl+C
   ```

## Add a venue

Each website is one subclass of `Source` in `backend/scraper/main.py`. Its `scrape()` method returns
the events on the programme page. Read "Scraper code model" and "Scraper implementation rules" in
[`AGENTS.md`](AGENTS.md) first: they explain the shared helpers for categories, images and dates.
Then add a short note on the new source to `AGENTS.md`.

## Contributing

Issues and pull requests are welcome, for example a venue that is missing or a page that a scraper
reads incorrectly. Keep each pull request to one change. For a larger change, open an issue first.

## Programme data and images

The programme data and the images belong to the venues. The site shows them to point visitors to the
venues and links to the venue's own page for tickets. If you run a venue and want a change, please
open an issue.

## License

The code is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE). If you run
a changed version as a public website, you must publish your changes under the same license.

The fonts in `frontend/public/` (Anton, Courier Prime, IBM Plex Mono) are licensed under the SIL Open
Font License 1.1; the license texts are in `frontend/public/fonts/`.
