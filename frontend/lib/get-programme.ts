import { readFileSync } from 'node:fs'
import { Pool } from 'pg'
import type { Category, Event, Programme, Venue } from './types'
import { demoProgramme } from './demo-programme'

/** Category values the scraper writes → frontend categories. Rows with other values (such as "konzert") are not shown. */
const CATEGORY: Record<string, Category> = { theater: 'theatre', oper: 'opera', film: 'movies' }

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
 *   starts in the next 8 days.
 * - Otherwise it returns the demo programme.
 *
 * If the database query fails, the function throws an error. It does not fall
 * back to the demo, because invented events must never show on the live site.
 */
export async function getProgramme(): Promise<Programme> {
  const db = getPool()
  if (!db) return demoProgramme()

  const [venues, events, updated, featured] = await Promise.all([
    // Cities appear in the order of their first venue. Alphabetical happens to
    // be north to south for Duisburg, Düsseldorf and Köln.
    db.query<Venue>('SELECT id, name, city FROM venues ORDER BY city, name'),
    db.query<{ id: string; title: string; category: string; venue_id: string; starts_at: Date; ends_at: Date | null; url: string | null; image_key: string | null }>(
      `SELECT id, title, category, venue_id, starts_at, ends_at, url, image_key
       FROM events
       WHERE starts_at > now() - interval '6 hours'
         AND starts_at < now() + interval '8 days'
       ORDER BY starts_at`,
    ),
    // every run sets updated_at on the events it saves, so the newest one is the last run
    db.query<{ max: Date | null }>('SELECT max(updated_at) FROM events'),
    db.query<{ title: string }>(
      `SELECT title FROM featured
       WHERE until IS NULL OR until >= (now() AT TIME ZONE 'Europe/Berlin')::date`,
    ),
  ])

  return {
    venues: venues.rows,
    events: events.rows.flatMap((r): Event[] => {
      const category = CATEGORY[r.category]
      if (!category) return []
      return [{
        id: String(r.id),
        title: r.title,
        category,
        venueId: r.venue_id,
        start: r.starts_at.toISOString(),
        end: r.ends_at?.toISOString(),
        url: r.url ?? undefined,
        image: r.image_key ? `/img/${r.image_key}` : undefined,
      }]
    }),
    generatedAt: new Date().toISOString(),
    updatedAt: updated.rows[0].max?.toISOString() ?? null,
    featured: featured.rows.map(r => r.title),
  }
}
