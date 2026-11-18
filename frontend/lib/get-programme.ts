import type { Programme } from './types'
import { demoProgramme } from './demo-programme'

/**
 * Gets the programme for the page.
 *
 * - If `PROGRAMME_URL` is set, the function fetches the programme from that URL.
 *   The URL must return JSON in the shape of `Programme` (see `lib/types.ts`).
 * - If `PROGRAMME_URL` is not set, the function returns the demo programme.
 *
 * If the fetch fails, the function throws an error. It does not fall back to the
 * demo, because invented events must never show on the live site. With the
 * `revalidate` setting in `app/page.tsx`, Next.js then keeps the last good page.
 */
export async function getProgramme(): Promise<Programme> {
  const url = process.env.PROGRAMME_URL
  if (!url) return demoProgramme()
  const r = await fetch(url, { next: { revalidate: 900 } })
  if (!r.ok) throw new Error(`Programme request failed: ${r.status} ${r.statusText}`)
  return (await r.json()) as Programme
}
