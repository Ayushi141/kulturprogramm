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

## Connect your backend

1. Copy `.env.example` to `.env.local`.
2. Set `PROGRAMME_URL` to the URL of your programme API.
3. Restart the server.

The API must return one JSON object in the shape of `Programme` in `lib/types.ts`:

- `venues`: `id`, `name`, `city`. The timeline groups rows by city, in the order of the venues.
- `events`: `id`, `title`, `category` (`theatre`, `opera` or `movies`), `venueId`, `start`, `end`, and optionally `url`, `price`, `image`, `note`.
  - Use one event per session. A film that shows three times is three events.
  - `start` and `end` are ISO 8601 times with an offset or `Z`.
  - Keep `id` stable across scraper runs. Saved evenings refer to it.
- Send at least the next 7 days, plus events that started in the last 6 hours.

The page refreshes the data every 15 minutes (`revalidate` in `app/page.tsx`).
If the API fails, Next.js keeps the last good page. The site never falls back to the demo when `PROGRAMME_URL` is set.

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
