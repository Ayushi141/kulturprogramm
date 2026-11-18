import { readFileSync } from 'node:fs'
import { Pool } from 'pg'
import type { Category, Event, Programme, Venue } from './types'
import { demoProgramme } from './demo-programme'

/** Category values the scraper writes → frontend categories. Rows with other values (such as "konzert") are not shown. */
const CATEGORY: Record<string, Category> = { theater: 'theatre', oper: 'opera', film: 'movies' }

let pool: Pool | undefined

/** `pg` reads PGHOST, PGPORT, PGUSER and PGDATABASE itself; the password comes from PGPASSWORD_FILE. */
function getPool(file: string) {
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
  const file = process.env.PGPASSWORD_FILE
  if (!file) return demoProgramme()
  const db = getPool(file)

  const [venues, events] = await Promise.all([
    // Cities appear in the order of their first venue. Alphabetical happens to
    // be north to south for Duisburg, Düsseldorf and Köln.
    db.query<Venue>('SELECT id, name, city FROM venues ORDER BY city, name'),
    db.query<{ id: string; title: string; category: string; venue_id: string; starts_at: Date; ends_at: Date | null; url: string | null }>(
      `SELECT id, title, category, venue_id, starts_at, ends_at, url
       FROM events
       WHERE starts_at > now() - interval '6 hours'
         AND starts_at < now() + interval '8 days'
       ORDER BY starts_at`,
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
      }]
    }),
    generatedAt: new Date().toISOString(),
  }
}
