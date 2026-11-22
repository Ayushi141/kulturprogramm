import type { Dict, Lang } from './i18n'
import { HOME } from './i18n'
import { dayLabel, fmt, weekday } from './time'

/**
 * Shared links: `/e/<id>` (German) and `/en/e/<id>` open the site with the
 * card of that performance. Chat apps fetch the page for its preview
 * (`generateMetadata` and `opengraph-image.tsx` in those routes).
 */
export const sharePath = (lang: Lang, id: string) => `${HOME[lang] === '/' ? '' : HOME[lang]}/e/${encodeURIComponent(id)}`

/** "Sa 21.11., 20:00" for a culture day and minutes inside it. */
export const shareWhen = (t: Dict, day: string, min: number) => `${t.wd[weekday(day)]} ${dayLabel(day)}, ${fmt(min)}`

/** "Sa 21.11., 20:00 · Kom(m)ödchen, Düsseldorf": the line under the title in previews and share texts. */
export const shareLine = (t: Dict, day: string, min: number, venue: { name: string; city: string }) =>
  `${shareWhen(t, day, min)} · ${venue.name}, ${venue.city}`
