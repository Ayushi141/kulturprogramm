# Offscript — kulturprogramm.eu

Theatre, opera and movies in NRW on one timeline.
Pick a day, add events to your evening, open the venue page for tickets.

## Start

Requirements: Node.js 20 or newer, pnpm.

```bash
pnpm install
pnpm dev          # development server on http://localhost:3000
```

Production:

```bash
pnpm build
pnpm start        # serves the built site on port 3000
```

Without configuration, the site shows a demo programme. A yellow notice on the page tells you this.

## Database

When `PGPASSWORD_FILE` is set, `getProgramme()` in `lib/get-programme.ts` reads
the `venues` and `events` tables from PostgreSQL. The Compose file in
`backend/deploy/` sets it, together with `PGHOST`, `PGPORT`, `PGUSER` and
`PGDATABASE`, which `pg` reads itself. To use the database with `pnpm dev`, set
the same variables, for example `PGHOST=127.0.0.1`.

- Events from 6 hours ago to 8 days ahead are loaded.
- Database categories `theater`, `oper` and `film` become `theatre`, `opera`
  and `movies`. Other categories, such as `konzert`, are not shown.
- `ends_at` NULL becomes a missing `end`; the frontend then assumes 2 hours and
  marks the end as estimated.
- Venues are ordered by city, then name.

The page is rendered on each request (`dynamic` in `app/page.tsx`). If the
query fails, the page shows an error. It never falls back to the demo when
`PGPASSWORD_FILE` is set.

## Concepts

- **Culture day.** A day runs from 06:00 to 06:00. An event that starts at 23:30 belongs to the evening on which it starts.
- **Upcoming.** On today, the events that have not started yet. On other days, all events.
- **Your evening.** The events that a visitor picks for a day, in time order. The plan panel shows the break between two picks, or the overlap. Picks are saved in the visitor's browser (`localStorage`).
- **Timeline window.** The part of the day that the timeline shows. Visitors drag or click on the whole-day strip to change it. Nothing else depends on it.

## Files

| Path | Contents |
|---|---|
| `app/page.tsx` | Gets the programme on the server and renders the page. |
| `lib/types.ts` | Data contract between backend and frontend. |
| `lib/get-programme.ts` | The only place that gets data. |
| `lib/plan.ts` | Planning logic: index by day, upcoming, overlaps, add/remove. No UI code. |
| `lib/time.ts` | Berlin time zone and culture-day helpers. |
| `lib/demo-programme.ts` | Demo data. Delete it when your backend is connected (and remove its import in `get-programme.ts`). |
| `components/guide.tsx` | Page: header, headline, day strip, control bar, views, plan panel, details dialog. |
| `components/explorer/*` | Timeline, poster view, day strip, plan panel, category colours. |
| `app/explorer.css` | Styles for the explorer. Uses the tokens in `app/globals.css`. |

## Clean-up candidates

`app/globals.css` still has rules from the first design (`.hero`, `.marquee`, `.feature`, `.artwork`). The page does not use them.
