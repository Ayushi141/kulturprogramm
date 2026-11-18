/**
 * Time helpers. All times are shown in Europe/Berlin.
 *
 * A "culture day" runs from 06:00 to 06:00 the next morning. A party from
 * 23:30 to 04:00 belongs to the evening on which it starts. Inside a culture
 * day we count minutes from 00:00, so 01:30 after midnight is 25 * 60 + 30.
 */

export const TZ = 'Europe/Berlin'
export const DAY0 = 6 * 60
export const DAY1 = 30 * 60

const parts = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

/** Berlin calendar date (YYYY-MM-DD) and minutes since local midnight. */
export function berlin(d: Date): { date: string; min: number } {
  const p = Object.fromEntries(parts.formatToParts(d).map(x => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute }
}

/** "18.11., 06:12" in Berlin time. */
export function stamp(d: Date): string {
  const b = berlin(d), [, m, day] = b.date.split('-')
  const hh = String(Math.floor(b.min / 60)).padStart(2, '0'), mm = String(b.min % 60).padStart(2, '0')
  return `${day}.${m}., ${hh}:${mm}`
}

/** Culture day (YYYY-MM-DD) and minutes inside it (360 to 1799). */
export function cultureDay(d: Date): { day: string; min: number } {
  const b = berlin(d)
  return b.min < DAY0 ? { day: shiftDate(b.date, -1), min: b.min + 1440 } : { day: b.date, min: b.min }
}

export function shiftDate(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

function offsetMin(d: Date): number {
  const s = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(d).find(p => p.type === 'timeZoneName')?.value ?? 'GMT'
  const m = s.match(/GMT([+-])(\d{2}):?(\d{2})?/)
  return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +(m[3] ?? 0)) : 0
}

/** Inverse of `cultureDay`: Berlin culture day + minutes → Date. */
export function fromCultureDay(ymd: string, min: number): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  const naive = Date.UTC(y, m - 1, d) + min * 60000
  let t = naive - offsetMin(new Date(naive)) * 60000
  t = naive - offsetMin(new Date(t)) * 60000 // second pass settles DST edges
  return new Date(t)
}

const pad = (n: number) => String(n).padStart(2, '0')
/** 1530 → "01:30". */
export const fmt = (t: number) => { t = Math.round(t); return `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}` }
/** 165 → "2h45", 40 → "40 min". */
export const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h` : '') + (m % 60 ? pad(m % 60) + (m < 60 ? ' min' : '') : '')
/** "2026-11-20" → "20.11." */
export const dayLabel = (ymd: string) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}.`

/** Whole days from `a` to `b` (YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}
