# Visitor statistics (Umami)

This page tells you what the site counts, where to see it, and how to add a new count.

[Umami](https://umami.is) is open-source web analytics software. It runs on our own server and
sets no cookies. It has three parts that this site uses:

| Part | What it records | Where you see it |
|---|---|---|
| Page views | Each page that a visitor opens, also each view change (`#poster`, `#context`) | Dashboard → **Pages** |
| Events | Named clicks that the site sends with `track()` | Dashboard → **Events** |
| Recorder | Session replays (a video-like playback of one visit) and heatmaps (where many visitors click and how far they scroll), for a part of the visits | Dashboard, on the website's page |

The dashboard is at `https://stats.kulturprogramm.eu` (login: Umami's own accounts).

## Page views

The tracker script counts page views without code from us. It also counts a page view when the
URL changes without a page load: it watches `history.pushState` and `history.replaceState`, and it
keeps the hash (the part after `#`). The view toggle calls `history.replaceState(null, '', '#' + view)`
(`setView` in `guide.tsx`), so each view change is a page view:

| Path in **Pages** | Meaning |
|---|---|
| `/` | The start page, before a view change |
| `/#timeline`, `/#poster`, `/#context` | The visitor selected this view |
| `/en`, `/en#…` | The same for the English site |
| `/e/<id>` | A shared event link |

To learn how many visitors open the "Kontext" view, compare the visits with the page views of
`/#context`.

## Events

A click that does not change the URL (for example, a click that opens the event card) is not a
page view. Umami sees it only when the site sends an event.

All events go through one function, `track()` in `frontend/lib/track.ts`. It sends the event
name and the production's `title` and `category`. Some events add more fields. When the
tracker is not loaded (Do Not Track, an ad blocker), `track()` does nothing.

| Event | Sent when | Extra fields |
|---|---|---|
| `bar-open` | A bar in the timeline or a mark in the season timeline opens the event card. A click that closes the card is not counted. | `from`: `timeline` or `season` |
| `card-preview` | The "Vorschau" poster opens (tap or hold) | – |
| `card-dates` | The dates drawer opens (not when it closes) | – |
| `card-kontext` | The "Kontext" drawer opens (not when it closes) | – |
| `card-add` | The bookmark button adds the event to "Mein Abend" | – |
| `card-remove` | The bookmark button removes it | – |
| `card-tickets` | "Tickets & Details" | – |
| `card-share` | "Teilen" | – |
| `card-close` | The ✕ button. Escape and a click outside the card are not counted. | – |
| `kontext-card` | A context card above the day strip opens the event card. The card opens with its "Kontext" drawer already open, so this click sends no `card-kontext`. | – |

In the dashboard, **Events** shows the fields of each event, for example the titles that
visitors open most.

### Read the numbers as a funnel

A funnel is a row of steps where each step is a part of the step before it. Compare:

1. Visits (dashboard overview)
2. `bar-open`
3. `card-kontext`, `card-tickets`

The context cards are a second way to the notes: to count all notes that visitors read, add
`kontext-card` and `card-kontext`.

The step where the number drops most is the step to improve. After a change, compare the same
numbers for a week before and a week after the change: with few visitors, single days vary too much.

### Add an event

1. Add the name to the `TrackEvent` type in `frontend/lib/track.ts`.
2. Call `track('<name>', it)` in the click handler. For a toggle (a button that opens and
   closes), send the event only when it opens.
3. Add the event to the table in this file.
4. If the event records a new kind of data, add it to the privacy text in `frontend/lib/legal.tsx`
   (German and English).

Use `track()` also where a `data-umami-event` attribute would work. The attribute does not work
on the timeline bars: they are SVG groups, and the click target is a shape inside the group.
One function for all events keeps all names in one place.

## Recorder

The recorder (`/k/r.js`, `frontend/components/umami-recorder.tsx`) records replays and heatmaps.
Its settings (on or off, sample rate, masking) are in the dashboard: website → **Edit** →
"Replays & Heatmaps". Use it to see why visitors stop at a step. Use events to count how many stop.

The tracker itself respects Do Not Track (`data-do-not-track="true"`), the recorder does not.
So `UmamiRecorder` loads the recorder only when the browser sends no Do Not Track signal.

## Setup

- Compose service `umami` (`backend/deploy/compose.yaml`), on `127.0.0.1:3001`. Its database
  `umami` is in the site's PostgreSQL; `backend/deploy/umami-db.sh` creates it once, when
  PostgreSQL initializes an empty data volume.
- The site loads all Umami files from its own domain under `/k/` (`backend/deploy/Caddyfile`):
  the tracker `/k/s.js`, events `/k/e`, the recorder `/k/r.js` and its data `/k/api/…`. The
  neutral names keep ad blockers from matching them. `TRACKER_SCRIPT_NAME` and
  `COLLECT_API_ENDPOINT` in `compose.yaml` set the names; change them only together with the
  Caddyfile. All other paths under `/k/` answer 404, so the dashboard and API stay on
  `stats.kulturprogramm.eu`.
- The website ID is `UMAMI_WEBSITE_ID` in `frontend/components/root-layout.tsx`.
- After a change to the Umami settings in `compose.yaml`: `docker compose -p deploy up -d umami`.
