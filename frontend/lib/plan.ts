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

/**
 * Typical length in minutes per category. Used only for layout (bar width,
 * lane packing, overlap checks) when the venue announced no end; never shown
 * as an end time.
 */
export const TYPICAL_LENGTH: Record<Category, number> = { theatre: 150, opera: 180, dance: 120, concerts: 120, movies: 120 }

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
  /** False when the venue announced no end; `e` is then `s + TYPICAL_LENGTH[category]`. */
  endKnown: boolean
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
    const e = end ? min + Math.max(15, (+end - +start) / 60000) : min + TYPICAL_LENGTH[ev.category]
    const item: Item = { id: ev.id, ev, venue, category: ev.category, day, s: min, e, endKnown: !!end }
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
export const surelyOverlap = (a: Item, b: Item) => a.s === b.s || (a.s < b.s ? a : b).endKnown

/** Text for an unknown end: "from 19:30 · end not announced". */
const openSpan = (it: Item, t: Dict) => `${t.from} ${fmt(it.s)} · ${t.endNotAnnounced}`

/** "19:30–22:15", or "from 19:30 · end not announced". */
export const timeRange = (it: Item, t: Dict) => (it.endKnown ? `${fmt(it.s)}–${fmt(it.e)}` : openSpan(it, t))

/** "19:30–22:15 · 2h45", or "from 19:30 · end not announced". */
export const spanLabel = (it: Item, t: Dict) => (it.endKnown ? `${timeRange(it, t)} · ${dur(it.e - it.s)}` : openSpan(it, t))

/** End of an item as shown to people: "22:15", or "open" when not announced. */
export const endLabel = (it: Item, t: Dict) => (it.endKnown ? fmt(it.e) : t.open)

/** Adds or removes an ID. */
export const toggle = (ids: string[], id: string) => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])

/** All performances of one title at one venue. */
export type Production = { key: string; title: string; venue: Venue; category: Category; dates: Item[] }

/** Groups performances into productions (same title at the same venue), dates in time order. */
export function productions(items: Item[]): Production[] {
  const map = new Map<string, Production>()
  for (const it of items) {
    const key = it.venue.id + '|' + it.ev.title
    if (!map.has(key)) map.set(key, { key, title: it.ev.title, venue: it.venue, category: it.category, dates: [] })
    map.get(key)!.dates.push(it)
  }
  for (const p of map.values()) p.dates.sort((a, b) => a.day.localeCompare(b.day) || a.s - b.s)
  return [...map.values()]
}
