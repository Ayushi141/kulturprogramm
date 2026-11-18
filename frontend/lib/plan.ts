/**
 * Pure planning logic. No React, no DOM.
 *
 * Mental model:
 *   upcoming = on today, an item that has not started yet; on other days, every item
 *   plan     = the items you picked for a day, in time order
 */
import type { Category, Event, Programme, Venue } from './types'
import { cultureDay } from './time'

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
}
export type Window = [number, number]

/** Turns the backend data into items grouped by culture day. */
export function indexProgramme(p: Programme): Map<string, Item[]> {
  const venues = new Map(p.venues.map(v => [v.id, v]))
  const byDay = new Map<string, Item[]>()
  for (const ev of p.events) {
    const venue = venues.get(ev.venueId)
    const start = new Date(ev.start), end = new Date(ev.end)
    if (!venue || isNaN(+start) || isNaN(+end)) continue
    const { day, min } = cultureDay(start)
    const item: Item = { id: ev.id, ev, venue, category: ev.category, day, s: min, e: min + Math.max(15, (+end - +start) / 60000) }
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day)!.push(item)
  }
  return byDay
}

export const upcoming = (it: Item, nowMin: number | null) => nowMin === null || it.s >= nowMin

export const byStart = (a: Item, b: Item) => a.s - b.s || a.e - b.e

/** Picks that overlap `it` in time (excluding `it` itself). */
export const clashes = (it: Item, plan: Item[]) => plan.filter(p => p.id !== it.id && p.s < it.e && it.s < p.e)

/** Adds or removes an ID. */
export const toggle = (ids: string[], id: string) => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
