/**
 * Pure planning logic. No React, no DOM.
 *
 * Mental model:
 *   upcoming = on today, an item that has not started yet; on other days, every item
 *   plan     = the items you picked for a day, in time order
 */
import type { Category, Event, Programme, Venue } from './types'
import type { Dict } from './i18n'
import { cultureDay, dur, fmt } from './time'

/** Assumed length in minutes when the venue publishes no end time. */
export const FALLBACK_MIN = 120

export type Item = {
  id: string
  ev: Event
  venue: Venue
  category: Category
  /** Culture day (YYYY-MM-DD). */
  day: string
  /** Start and end, in minutes inside the culture day. */
  s: number
  e: number
  /** True when the venue published no end time and `e` is `s + FALLBACK_MIN`. */
  endEstimated: boolean
}
export type Window = [number, number]

/** Turns the backend data into items grouped by culture day. */
export function indexProgramme(p: Programme): Map<string, Item[]> {
  const venues = new Map(p.venues.map(v => [v.id, v]))
  const byDay = new Map<string, Item[]>()
  for (const ev of p.events) {
    const venue = venues.get(ev.venueId)
    const start = new Date(ev.start), end = ev.end ? new Date(ev.end) : null
    if (!venue || isNaN(+start) || (end && isNaN(+end))) continue
    const { day, min } = cultureDay(start)
    const e = end ? min + Math.max(15, (+end - +start) / 60000) : min + FALLBACK_MIN
    const item: Item = { id: ev.id, ev, venue, category: ev.category, day, s: min, e, endEstimated: !end }
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day)!.push(item)
  }
  return byDay
}

export const upcoming = (it: Item, nowMin: number | null) => nowMin === null || it.s >= nowMin

export const byStart = (a: Item, b: Item) => a.s - b.s || a.e - b.e

/** Picks that overlap `it` in time (excluding `it` itself). */
export const clashes = (it: Item, plan: Item[]) => plan.filter(p => p.id !== it.id && p.s < it.e && it.s < p.e)

/** False when an overlap of `a` and `b` rests only on an estimated end time. */
export const surelyOverlap = (a: Item, b: Item) => a.s === b.s || !(a.s < b.s ? a : b).endEstimated

/** "21:30", or "~21:30" when the end is estimated. */
export const endLabel = (it: Item) => (it.endEstimated ? '~' : '') + fmt(it.e)

/** "19:30–21:30 · 2h", or "19:30–~21:30 · end time not published". */
export const spanLabel = (it: Item, t: Dict) =>
  `${fmt(it.s)}–${endLabel(it)} · ${it.endEstimated ? t.endUnknown : dur(it.e - it.s)}`

/** Adds or removes an ID. */
export const toggle = (ids: string[], id: string) => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
