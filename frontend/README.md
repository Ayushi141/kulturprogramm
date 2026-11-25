# Kulturprogramm — kulturprogramm.eu

Theatre, opera, dance, concerts and movies in NRW on one timeline.
Pick a day, add events to your evening, open the venue page for tickets.

## Start

Requirements: Node.js 22 or newer, pnpm.

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

- Events from 6 hours ago to 183 days ahead are loaded. The day strip shows the first 7 days; the "later" button shows the rest, one line per production.
- Database categories `theater`, `oper`, `tanz`, `konzert` and `film` become
  `theatre`, `opera`, `dance`, `concerts` and `movies`.
- `ends_at` NULL becomes a missing `end` ("end not announced"). For layout
  only, the frontend estimates the length per category (`TYPICAL_LENGTH` in
  `lib/plan.ts`: theatre 150, opera 180, dance, concerts and movies 120 minutes). The timeline draws
  such a bar with an open end: solid colour under the label, then a halftone
  that fades to nothing, with no right edge (`components/explorer/open-end.ts`).
- Venues are ordered by city, then name.
- Event images come from the `images` table and are served at `/img/<key>`
  (`app/img/[key]/route.ts`), so visitors never load images from the venues.

The page is rendered on each request (`dynamic` in `app/(de)/page.tsx` and `app/(en)/en/page.tsx`). If the
query fails, the page shows an error. It never falls back to the demo when
`PGPASSWORD_FILE` is set.

## Languages

German is the default at `/`; English is at `/en`. The DE | EN switch in the header
keeps the current view. Client components get their texts with `useT()` from
`components/i18n.tsx`. Add a text to both `en` and `de` in `lib/i18n.ts`; the `Dict`
type makes a missing German text a type error.

## Concepts

- **Culture day.** A day runs from 06:00 to 06:00. An event that starts at 23:30 belongs to the evening on which it starts.
- **Upcoming.** On today, the events that have not started yet. On other days, all events.
- **Your evening.** The events that a visitor picks for a day, in time order. The plan panel shows the break between two picks, or the overlap. Picks are saved in the visitor's browser (`localStorage`).
- **Timeline window.** The part of the day that the timeline shows. Visitors drag or click on the whole-day strip to change it. Nothing else depends on it.

## Files

| Path | Contents |
|---|---|
| `app/(de)/page.tsx`, `app/(en)/en/page.tsx` | German page at `/`, English page at `/en`. Each gets the programme on the server. |
| `app/(de)/layout.tsx`, `app/(en)/en/layout.tsx` | One root layout per language, so `<html lang>` is right. Both use `components/root-layout.tsx`. |
| `lib/i18n.ts` | All interface texts, German (default) and English. Programme data is not translated. |
| `lib/types.ts` | Data contract between backend and frontend. |
| `lib/get-programme.ts` | The only place that gets data. |
| `lib/plan.ts` | Planning logic: index by day, upcoming, overlaps, add/remove. No UI code. |
| `lib/time.ts` | Berlin time zone and culture-day helpers. |
| `lib/demo-programme.ts` | Demo data, used when no database is configured. |
| `components/guide.tsx` | Page: header, headline, day strip, control bar, views, plan panel, details dialog. |
| `components/explorer/*` | Timeline, poster view, day strip, plan panel, category colours. |
| `app/explorer.css` | Styles for the explorer. Uses the tokens in `app/globals.css`. |

## Clean-up candidates

`app/globals.css` still has rules from the first design (`.hero`, `.marquee`, `.artwork`). The page does not use them.
