import type { Metadata } from 'next'
import Guide from '@/components/guide'
import { getEvent, getProgramme } from '@/lib/get-programme'
import { DICTS, type Lang } from '@/lib/i18n'
import { OG_SIZE } from '@/lib/og-image'
import { shareLine, sharePath } from '@/lib/share'
import { cultureDay } from '@/lib/time'
import type { Programme } from '@/lib/types'

/**
 * The page behind a shared link (`/e/<id>`, `/en/e/<id>`): the normal site,
 * opened on the day of that performance with its card open. A performance that
 * has already ended is not in the programme, so it is added: it then joins its
 * production's dates like any other, and the card shows the next ones.
 * An unknown ID shows the normal site.
 */
export async function SharePage({ lang, id }: { lang: Lang; id: string }) {
  const [programme, found] = await Promise.all([getProgramme(), getEvent(id)])
  return <Guide programme={withEvent(programme, found)} lang={lang} sharedId={found?.event.id} />
}

function withEvent(p: Programme, found: Awaited<ReturnType<typeof getEvent>>): Programme {
  if (!found || p.events.some(e => e.id === found.event.id)) return p
  return {
    ...p,
    events: [...p.events, found.event],
    venues: p.venues.some(v => v.id === found.venue.id) ? p.venues : [...p.venues, found.venue],
  }
}

/** Title, description and image of the link preview; the image is `preview.jpg/route.ts` next to the page. */
export async function shareMetadata(lang: Lang, id: string): Promise<Metadata> {
  const found = await getEvent(id)
  if (!found) return {}
  const t = DICTS[lang]
  const { day, min } = cultureDay(new Date(found.event.start))
  const title = found.event.title
  const description = shareLine(t, day, min, found.venue)
  const image = { url: `${sharePath(lang, id)}/preview.jpg`, width: OG_SIZE.width, height: OG_SIZE.height, type: 'image/jpeg' }
  return {
    title: `${title} · Kulturprogramm`,
    description,
    alternates: { canonical: sharePath(lang, id), languages: { de: sharePath('de', id), en: sharePath('en', id) } },
    openGraph: { type: 'website', siteName: 'Kulturprogramm', locale: lang === 'de' ? 'de_DE' : 'en_GB', url: sharePath(lang, id), title, description, images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  }
}
