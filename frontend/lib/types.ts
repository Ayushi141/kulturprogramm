/**
 * Data contract between your backend and the frontend.
 *
 * The frontend reads one `Programme` object. `getProgramme()` in
 * `lib/get-programme.ts` builds it from the database.
 */

/** Order of the filter buttons, legends and stacked overview. */
export const CATEGORIES = ['theatre', 'opera', 'dance', 'concerts', 'movies'] as const
export type Category = (typeof CATEGORIES)[number]

/**
 * One row of the timeline: an organizer at one venue. The same building can be two
 * venues here when two organizers play in it (Oper Wuppertal and Pina Bausch).
 */
export type Venue = {
  /** Stable ID. `Event.venueId` refers to it. */
  id: string
  /** Who hosts the events, written out in full, for example "Düsseldorfer Schauspielhaus". */
  organizer: string
  /** Where, for example "Schauspielhaus, Großes Haus". */
  name: string
  /**
   * City display name, for example "Köln".
   * The timeline groups rows by city, then by organizer, in the order of
   * their first venue in `Programme.venues`.
   */
  city: string
}

export type Event = {
  /** Stable ID of this one session (not of the production or the film). */
  id: string
  /** ID of the production: all sessions of one staging, film run or concert programme share it. */
  productionId: string
  title: string
  category: Category
  venueId: string
  /** ISO 8601 with offset or Z, for example "2026-11-20T19:30:00+01:00". */
  start: string
  /**
   * ISO 8601. Null or missing when the venue announced no end. The frontend
   * then lays the bar out with `TYPICAL_LENGTH` (lib/plan.ts) and shows the
   * end as not announced.
   */
  end?: string | null
  /**
   * Absolute URL of the event page on the venue site, where people buy
   * tickets or read details. The frontend opens it in a new tab.
   */
  url?: string
  /** Free text, for example "18–49 €". */
  price?: string
  /** Image URL, absolute or a path on this site (`/img/<key>`, served from the database). If it is missing or fails, a typographic fallback shows. */
  image?: string
  /** Optional subtitle, for example the director or the cast. */
  note?: string
}

/**
 * The context note of one production. Null texts: the enricher found nothing; the card then says so.
 * `isNew`: added to the programme in the last 7 days.
 */
export type Context = { de: string | null; en: string | null; isNew: boolean }

export type Programme = {
  venues: Venue[]
  events: Event[]
  /** ISO 8601 time when the data was produced. */
  generatedAt: string
  /** ISO 8601 time of the last scraper run (newest `updated_at`), or null when there are no events. */
  updatedAt?: string | null
  /** Production IDs picked for the "In focus" card (table `featured`). The card shows the next performance of one of them. */
  featured?: string[]
  /**
   * Context notes by production ID, for productions the enricher has looked up.
   * A production without an entry has not been looked up: its card offers no context.
   */
  contexts?: Record<string, Context>
  /** True when the data is the built-in demo fixture. The UI then shows a notice. */
  demo?: boolean
}
