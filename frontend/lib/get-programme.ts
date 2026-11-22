import { readFileSync } from 'node:fs'
import { Pool } from 'pg'
import type { Category, Context, Event, Programme, Venue } from './types'
import { demoProgramme } from './demo-programme'

/** Category values the scraper writes (`Category` in backend/scraper/main.py) → frontend categories. Rows with other values are not shown. */
const CATEGORY: Record<string, Category> = { theater: 'theatre', oper: 'opera', tanz: 'dance', konzert: 'concerts', film: 'movies' }

let pool: Pool | undefined

/**
 * Shared connection pool, or null when no database is configured.
 * `pg` reads PGHOST, PGPORT, PGUSER and PGDATABASE itself; the password comes from PGPASSWORD_FILE.
 */
export function getPool(): Pool | null {
  const file = process.env.PGPASSWORD_FILE
  if (!file) return null
  pool ??= new Pool({ password: readFileSync(file, 'utf8').trim() })
  return pool
}

/**
 * Gets the programme for the page.
 *
 * - If `PGPASSWORD_FILE` is set (as in the Compose setup), the function reads
 *   the events from PostgreSQL: everything that started in the last 6 hours or
 *   starts in the next 183 days (the day strip shows 7, "later" the rest).
 * - Otherwise it returns the demo programme.
 *
 * If the database query fails, the function throws an error. It does not fall
 * back to the demo, because invented events must never show on the live site.
 */
export async function getProgramme(): Promise<Programme> {
  const db = getPool()
  if (!db) return demoProgramme()

  const [venues, events, updated, featured, contexts] = await Promise.all([
    // Cities appear in the order of their first venue. Alphabetical happens to
    // be north to south for Duisburg, Düsseldorf and Köln.
    db.query<Venue>('SELECT id, name, city FROM venues ORDER BY city, name'),
    db.query<EventRow>(
      `SELECT ${EVENT_COLUMNS}
       FROM ${EVENT_TABLES}
       WHERE e.starts_at > now() - interval '6 hours'
         AND e.starts_at < now() + interval '183 days'
       ORDER BY e.starts_at`,
    ),
    // every run sets updated_at on the events it saves, so the newest one is the last run
    db.query<{ max: Date | null }>('SELECT max(updated_at) FROM events'),
    db.query<{ production_id: string }>(
      `SELECT production_id FROM featured
       WHERE until IS NULL OR until >= (now() AT TIME ZONE 'Europe/Berlin')::date`,
    ),
    // looked-up productions with dates in the window; the notes are NULL when nothing was found
    db.query<{ id: string; note_de: string | null; note_en: string | null }>(
      `SELECT p.id, p.note_de, p.note_en FROM productions p
       WHERE p.enriched_at IS NOT NULL
         AND EXISTS (SELECT 1 FROM events e WHERE e.production_id = p.id
                     AND e.starts_at > now() - interval '6 hours'
                     AND e.starts_at < now() + interval '183 days')`,
    ),
  ])

  return {
    venues: venues.rows,
    events: events.rows.flatMap(toEvent),
    generatedAt: new Date().toISOString(),
    updatedAt: updated.rows[0].max?.toISOString() ?? null,
    featured: featured.rows.map(r => String(r.production_id)),
    contexts: Object.fromEntries(contexts.rows.map(r => [String(r.id), { de: r.note_de, en: r.note_en } satisfies Context])),
  }
}

type EventRow = { id: string; production_id: string; title: string; category: string; venue_id: string; starts_at: Date; ends_at: Date | null; url: string | null; image_key: string | null }
const EVENT_COLUMNS = 'e.id, e.production_id, p.title, p.category, e.venue_id, e.starts_at, e.ends_at, e.url, p.image_key'
const EVENT_TABLES = 'events e JOIN productions p ON p.id = e.production_id'

/** One `events` row as an `Event`, or none when its category is not shown. */
function toEvent(r: EventRow): Event[] {
  const category = CATEGORY[r.category]
  if (!category) return []
  return [{
    id: String(r.id),
    productionId: String(r.production_id),
    title: r.title,
    category,
    venueId: r.venue_id,
    start: r.starts_at.toISOString(),
    end: r.ends_at?.toISOString(),
    url: r.url ?? undefined,
    image: r.image_key ? `/img/${r.image_key}` : undefined,
  }]
}

/**
 * Gets one event and its venue for a shared link (`/e/<id>`), at any time: also
 * one that has already ended and so is not in the programme. Returns null when
 * no shown event has the ID.
 */
export async function getEvent(id: string): Promise<{ event: Event; venue: Venue } | null> {
  const db = getPool()
  if (!db) {
    const demo = demoProgramme()
    const event = demo.events.find(e => e.id === id)
    const venue = event && demo.venues.find(v => v.id === event.venueId)
    return event && venue ? { event, venue } : null
  }
  if (!/^\d{1,18}$/.test(id)) return null // database IDs are bigint
  const res = await db.query<EventRow & { name: string; city: string }>(
    `SELECT ${EVENT_COLUMNS}, v.name, v.city
     FROM ${EVENT_TABLES} JOIN venues v ON v.id = e.venue_id
     WHERE e.id = $1`,
    [id],
  )
  const r = res.rows[0]
  const event = r && toEvent(r)[0]
  return event ? { event, venue: { id: r.venue_id, name: r.name, city: r.city } } : null
}
