import type { Item } from './plan'

/**
 * The click events that Umami counts (dashboard: "Events"). Page views and view changes
 * (`#timeline`, `#poster`, `#context`) need no event: Umami counts them as page views.
 * - `bar-open`: a bar in the timeline or a mark in the season timeline opens the event card (`from`).
 * - `card-*`: a button on the event card.
 * - `kontext-card`: a context card above the day strip opens the event card (`context-cards.tsx`).
 */
export type TrackEvent =
  | 'bar-open'
  | 'card-preview' | 'card-dates' | 'card-kontext'
  | 'card-add' | 'card-remove' | 'card-tickets' | 'card-share' | 'card-close'
  | 'kontext-card'

declare global {
  interface Window { umami?: { track: (name: string, data?: Record<string, string>) => void } }
}

/**
 * Sends one click event for the performance `it` to Umami, with its title and category.
 * Without the tracker (Do Not Track, a blocker, the script not loaded yet) it does nothing.
 */
export function track(name: TrackEvent, it: Item, data: Record<string, string> = {}) {
  try {
    window.umami?.track(name, { title: it.ev.title, category: it.category, ...data })
  } catch { /* the statistics must never break the page */ }
}
