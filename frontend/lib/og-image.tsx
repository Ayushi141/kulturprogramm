import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CAT } from '@/components/explorer/categories'
import { getEvent, getPool } from './get-programme'
import { DICTS, type Lang } from './i18n'
import { cultureDay, dayLabel, fmt, weekday } from './time'
import type { Category } from './types'

/**
 * The link preview image of a shared performance (1200×630 PNG), drawn like a
 * poster: logo, category tag, title, a yellow date stamp, venue, and on the
 * right the event photo (PNG, JPEG or GIF) or else the category block of the card.
 * ImageResponse renders flexbox only (no grid) and needs every font as a file.
 */
export const OG_SIZE = { width: 1200, height: 630 }

const PAPER = '#f7f3e8', INK = '#201f1a', YELLOW = '#ffde5b', RED = '#df3929'
/** The photo-less block, as `.cat-*` in globals.css. */
const BLOCK: Record<Category, string> = { theatre: '#ab382a', opera: '#8f5400', concerts: '#7f2866', dance: '#11706f', movies: '#2646c8' }
/** The category icons of the card (lucide Drama, MicVocal, Footprints, Music, Clapperboard). */
const ICON: Record<Category, string[]> = {
  theatre: ['M10 11h.01', 'M14 6h.01', 'M18 6h.01', 'M6.5 13.1h.01', 'M22 5c0 9-4 12-6 12s-6-3-6-12c0-2 2-3 6-3s6 1 6 3', 'M17.4 9.9c-.8.8-2 .8-2.8 0', 'M10.1 7.1C9 7.2 7.7 7.7 6 8.6c-3.5 2-4.7 3.9-3.7 5.6 4.5 7.8 9.5 8.4 11.2 7.4.9-.5 1.9-2.1 1.9-4.7', 'M9.1 16.5c.3-1.1 1.4-1.7 2.4-1.4'],
  opera: ['m11 7.601-5.994 8.19a1 1 0 0 0 .1 1.298l.817.818a1 1 0 0 0 1.314.087L15.09 12', 'M16.5 21.174C15.5 20.5 14.372 20 13 20c-2.058 0-3.928 2.356-6 2-2.072-.356-2.775-3.369-1.5-4.5', 'M21 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0'],
  dance: ['M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z', 'M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z', 'M16 17h4', 'M4 13h4'],
  concerts: ['M9 18V5l12-2v13', 'M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0', 'M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0'],
  movies: ['m12.296 3.464 3.02 3.956', 'M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z', 'M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'm6.18 5.276 3.1 3.899'],
}
/** The logo star (`.burst` in globals.css) as SVG points in a 100×100 box. */
const STAR = '50,0 57,33 82,8 67,40 100,35 72,53 98,72 65,65 78,98 54,73 43,100 41,69 10,89 31,60 0,55 32,46 9,18 41,34'
/** The CMYK and house colours of the hero's colour bar. */
const BAR = ['#00a0e3', '#e4007c', YELLOW, INK, RED, '#2646c8', PAPER]

// read once; the runtime image keeps `public/` next to the server
const file = (name: string) => readFile(join(process.cwd(), 'public', name))
const FONTS = Promise.all([file('anton.ttf'), file('fonts/courier-prime-latin-400-normal.woff'), file('fonts/courier-prime-latin-700-normal.woff')])

/** The photo as a data URL, or null if there is none or it cannot be read. */
async function photo(src?: string): Promise<string | null> {
  try {
    let type: string, data: Buffer
    const key = src?.match(/^\/img\/([0-9a-f]{32})$/)?.[1]
    const local = src?.match(/^\/images\/[\w-]+\.(webp|png|jpg|jpeg)$/)
    if (key) {
      const { rows } = await getPool()?.query<{ content_type: string; data: Buffer }>('SELECT content_type, data FROM images WHERE key = $1', [key]) ?? { rows: [] }
      if (!rows.length) return null
      ;({ content_type: type, data } = rows[0])
    } else if (local) {
      data = await file(local[0].slice(1))
      type = 'image/' + local[1].replace('jpg', 'jpeg')
    } else return null
    // the renderer decodes PNG, JPEG and GIF only; a WebP would come out blank
    return /^image\/(png|jpeg|gif)$/.test(type) ? `data:${type};base64,${data.toString('base64')}` : null
  } catch {
    return null
  }
}

/** Title size so that long titles still fit in three lines. */
const titleSize = (s: string) => (s.length <= 26 ? 100 : s.length <= 40 ? 84 : s.length <= 60 ? 68 : 56)

type Card = { category: Category | null; title: string; stamp: string | null; venue: string | null; image: string | null }

function Poster({ c, tag }: { c: Card; tag: string | null }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', backgroundColor: PAPER, color: INK, position: 'relative' }}>
      {/* baseline rules every 42px, as on the site; the renderer draws hard gradient stops soft, so they are lines */}
      {Array.from({ length: 15 }, (_, i) => <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: 41 + i * 42, height: 1.5, background: 'rgba(32,31,26,.08)' }} />)}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '50px 48px 52px 64px', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 18, left: 18, width: 22, height: 22, borderTop: `2px solid ${INK}`, borderLeft: `2px solid ${INK}` }} />
        <div style={{ position: 'absolute', bottom: 18, left: 18, width: 22, height: 22, borderBottom: `2px solid ${INK}`, borderLeft: `2px solid ${INK}` }} />
        <div style={{ display: 'flex', alignItems: 'center', transform: 'rotate(-2deg)', transformOrigin: 'left center' }}>
          <svg width={42} height={46} viewBox="0 0 100 100" preserveAspectRatio="none" style={{ marginRight: -8 }}><polygon points={STAR} fill={RED} /></svg>
          <span style={{ fontFamily: 'Poster', fontSize: 40, lineHeight: 1, letterSpacing: -1.5 }}>KULTURPROGRAMM</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 18 }}>
          {c.category && tag && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, border: `2px solid ${INK}`, background: PAPER, padding: '6px 12px', fontFamily: 'Mono', fontWeight: 700, fontSize: 19, letterSpacing: 1.5 }}>
              <div style={{ width: 14, height: 14, background: CAT[c.category].color, border: `1.5px solid ${INK}` }} />{tag}
            </div>
          )}
          <div style={{ display: 'block', fontFamily: 'Poster', fontSize: titleSize(c.title), lineHeight: 0.93, maxWidth: 640, lineClamp: 3 }}>{c.title}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 20 }}>
          {c.stamp && (
            <div style={{ display: 'flex', background: YELLOW, border: `3px solid ${INK}`, boxShadow: `7px 7px 0 ${INK}`, padding: '10px 20px 8px', transform: 'rotate(-2deg)', fontFamily: 'Poster', fontSize: 48, lineHeight: 1 }}>{c.stamp}</div>
          )}
          {c.venue && <div style={{ display: 'flex', fontFamily: 'Mono', fontSize: 27 }}>{c.venue}</div>}
        </div>
      </div>
      <div style={{ width: 470, flexShrink: 0, borderLeft: `4px solid ${INK}`, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
        background: c.category ? (c.image ? CAT[c.category].color : BLOCK[c.category]) : '#2646c8', color: '#ffffff' }}>
        {c.image
          ? <img src={c.image} width={470} height={630} style={{ position: 'absolute', top: 0, left: 0, width: 470, height: 630, objectFit: 'cover' }} />
          : <>
              <div style={{ position: 'absolute', top: -450, left: -450, width: 1370, height: 1530, transform: 'rotate(30deg)', display: 'flex',
                backgroundImage: 'radial-gradient(circle at center, rgba(255,222,91,.32) 0%, rgba(255,222,91,.32) 22%, transparent 26%)', backgroundSize: '15px 15px' }} />
              {c.category
                ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                    <svg width={132} height={132} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                      {ICON[c.category].map(d => <path key={d} d={d} />)}
                    </svg>
                    <div style={{ display: 'flex', fontFamily: 'Poster', fontSize: 76, lineHeight: 1 }}>{tag}</div>
                  </div>
                : <svg width={160} height={176} viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points={STAR} fill={YELLOW} /></svg>}
            </>}
        <div style={{ position: 'absolute', right: 0, bottom: 0, display: 'flex', borderTop: `2px solid ${INK}`, borderLeft: `2px solid ${INK}` }}>
          {BAR.map((b, i) => <div key={b} style={{ width: 30, height: 15, background: b, borderLeft: i ? `2px solid ${INK}` : 'none' }} />)}
        </div>
      </div>
    </div>
  )
}

/**
 * Renders the preview of event `id` in `lang`. An unknown ID gets the site's
 * own card. A photo that the renderer cannot read falls back to the category block.
 */
export async function ogImage(lang: Lang, id: string): Promise<Response> {
  const t = DICTS[lang]
  const [found, [anton, mono, monoBold]] = await Promise.all([getEvent(id), FONTS])
  let card: Card = { category: null, title: t.title.split('—').pop()!.trim(), stamp: null, venue: null, image: null }
  if (found) {
    const { day, min } = cultureDay(new Date(found.event.start))
    card = {
      category: found.event.category,
      title: found.event.title,
      stamp: `${t.wd[weekday(day)].toUpperCase()} ${dayLabel(day)} · ${fmt(min)}`,
      venue: `${found.venue.name} · ${found.venue.city}`,
      image: await photo(found.event.image),
    }
  }
  const tag = card.category && t.cat[card.category].tag
  const render = (c: Card) => new ImageResponse(<Poster c={c} tag={tag} />, {
    ...OG_SIZE,
    fonts: [
      { name: 'Poster', data: anton, weight: 400, style: 'normal' },
      { name: 'Mono', data: mono, weight: 400, style: 'normal' },
      { name: 'Mono', data: monoBold, weight: 700, style: 'normal' },
    ],
  }).arrayBuffer()
  let png: ArrayBuffer
  try {
    png = await render(card)
  } catch {
    png = await render({ ...card, image: null })
  }
  return new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' } })
}
