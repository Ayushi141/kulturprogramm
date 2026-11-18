/**
 * Data contract between your backend and the frontend.
 *
 * The frontend reads one `Programme` object. `getProgramme()` in
 * `lib/get-programme.ts` builds it from the database.
 */

export const CATEGORIES = ['theatre', 'opera', 'movies'] as const
export type Category = (typeof CATEGORIES)[number]

export type Venue = {
  /** Stable ID. `Event.venueId` refers to it. */
  id: string
  /** Display name, for example "Schauspielhaus". */
  name: string
  /**
   * City display name, for example "Köln".
   * The timeline groups venue rows by city. Cities appear in the order of
   * their first venue in `Programme.venues`. Sort the venues geographically,
   * for example north to south.
   */
  city: string
}

export type Event = {
  /** Stable ID of this one session (not of the production or the film). */
  id: string
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

export type Programme = {
  venues: Venue[]
  events: Event[]
  /** ISO 8601 time when the data was produced. */
  generatedAt: string
  /** ISO 8601 time of the last scraper run (newest `updated_at`), or null when there are no events. */
  updatedAt?: string | null
  /** True when the data is the built-in demo fixture. The UI then shows a notice. */
  demo?: boolean
}
