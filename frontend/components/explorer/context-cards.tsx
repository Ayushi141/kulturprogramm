'use client'
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import type { Context } from '@/lib/types'
import type { Item } from '@/lib/plan'
import type { Lang } from '@/lib/i18n'
import { dayLabel, fmt, weekday } from '@/lib/time'
import { CAT } from '@/lib/colors'
import { track } from '@/lib/track'
import { useLang, useT } from '../i18n'
import { Narrator } from './mascots'

/** Time in milliseconds until the row moves on by one card, counted from the last touch, click or scroll. */
const INTERVAL = 6000
/** A teaser has at least this many characters: it adds sentences until it is this long. */
const MIN_TEASER = 70
/** A teaser has at most this many characters; a longer sentence is cut at a word, with "…". */
const MAX_TEASER = 110

type Props = {
  /** The performances to show, in order (the same list as the reading view, see `guide.tsx`). */
  items: Item[]
  contexts: Record<string, Context>
  /** Opens the event card of a performance with its context drawer open. */
  onOpen: (it: Item) => void
}

/**
 * The context cards: a row of small cards above the day strip, one per production with a note (its
 * narrator, title and the note's first sentences). A tap opens the event card with the full note.
 * The kicker shows the date only when the cards span several days ("later"): the day strip below
 * already says which day it is.
 * The order takes turns between the categories (`alternate`), so the first cards show different ones.
 *
 * The row is a normal horizontal scroll area with scroll snap: swipe, trackpad and the arrow
 * buttons move it. Every `INTERVAL` without input it moves on by one card; after the last card
 * it goes back to the first. It does not move while the mouse or the keyboard focus is on it,
 * after the pause button, with "reduced motion", or when all cards fit.
 */
export function ContextCards({ items, contexts, onOpen }: Props) {
  const t = useT(), lang = useLang()
  const rail = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false) // the pause button
  const [held, setHeld] = useState(false) // mouse or focus on the row
  const [still, setStill] = useState(false) // "reduced motion"
  const [overflow, setOverflow] = useState(false) // more cards than fit
  /** Changes with each input on the row; this restarts the countdown. */
  const [touched, setTouched] = useState(0)
  const touch = () => setTouched(n => n + 1)

  // the first performance per production with a note; a Map keeps the order of `items`
  const firsts = new Map<string, Item>()
  for (const it of items) {
    const id = it.ev.productionId
    if (contexts[id]?.[lang] && !firsts.has(id)) firsts.set(id, it)
  }
  const entries = alternate([...firsts].map(([id, it]) => ({ id, it, text: teaser(contexts[id][lang]!, lang) })))
  const key = entries.map(e => e.id).join(' ')
  const oneDay = entries.every(e => e.it.day === entries[0].it.day)

  useEffect(() => {
    const m = matchMedia('(prefers-reduced-motion: reduce)')
    const set = () => setStill(m.matches)
    set(); m.addEventListener('change', set)
    return () => m.removeEventListener('change', set)
  }, [])
  // a new selection starts at the first card
  useEffect(() => {
    const r = rail.current
    if (!r) return
    r.scrollLeft = 0
    const ro = new ResizeObserver(() => setOverflow(r.scrollWidth > r.clientWidth + 2))
    ro.observe(r)
    return () => ro.disconnect()
  }, [key])

  /** Moves the row by one card; past either end, it goes to the other end. */
  const step = (dir: 1 | -1) => {
    const r = rail.current, card = r?.firstElementChild as HTMLElement | null
    if (!r || !card) return
    const width = card.offsetWidth + parseFloat(getComputedStyle(r).columnGap || '0')
    const behavior = still ? 'auto' : 'smooth'
    const end = r.scrollWidth - r.clientWidth
    if (dir > 0 && r.scrollLeft >= end - 2) r.scrollTo({ left: 0, behavior })
    else if (dir < 0 && r.scrollLeft <= 2) r.scrollTo({ left: end, behavior })
    else r.scrollBy({ left: dir * width, behavior })
  }

  const moving = overflow && !paused && !held && !still
  useEffect(() => {
    if (!moving) return
    const id = setTimeout(() => { step(1); touch() }, INTERVAL)
    return () => clearTimeout(id)
  }, [moving, touched])

  if (!entries.length) return null
  return (
    <section className="x-ctx" aria-label={t.cardsLabel} aria-roledescription="carousel"
      onPointerEnter={e => { if (e.pointerType === 'mouse') setHeld(true) }}
      onPointerLeave={e => { if (e.pointerType === 'mouse') setHeld(false) }}
      onFocus={() => setHeld(true)}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setHeld(false) }}>
      <div className="x-ctxhead">
        <b>{t.contextHead}</b>
        <p>{t.readAi}</p>
        {overflow && (
          <div className="x-ctxnav">
            <button onClick={() => { step(-1); touch() }} aria-label={t.cardsPrev}><ChevronLeft size={16} /></button>
            {!still && (
              <button onClick={() => setPaused(p => !p)} aria-pressed={paused} aria-label={paused ? t.cardsPlay : t.cardsPause}>
                {paused ? <Play size={13} fill="currentColor" /> : <Pause size={13} fill="currentColor" />}
              </button>
            )}
            <button onClick={() => { step(1); touch() }} aria-label={t.cardsNext}><ChevronRight size={16} /></button>
          </div>
        )}
      </div>
      <div className="x-ctxrail" ref={rail} onTouchStart={touch} onWheel={touch} onKeyDown={touch}>
        {entries.map(({ id, it, text }) => (
          <button key={id} className="x-ctxcard" style={{ '--cat': CAT[it.category].color } as React.CSSProperties}
            onClick={() => { track('kontext-card', it); onOpen(it) }}>
            <Narrator category={it.category} width={40} tight />
            <span className="x-ctxbody">
              <small>{t.cat[it.category].tag} · {!oneDay && `${t.wd[weekday(it.day)]} ${dayLabel(it.day)} `}{fmt(it.s)}</small>
              <span className="x-ctxtitle">{it.ev.title}</span>
              <span className="x-ctxnote">{text}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

/**
 * Takes turns between the categories: the first entry of each category, then the second of each,
 * and so on. The categories take turns in the order of their first entry; in a category, the order
 * stays as given (by start time).
 */
function alternate<T extends { it: Item }>(list: T[]): T[] {
  const groups = new Map<string, T[]>()
  for (const e of list) {
    const g = groups.get(e.it.category)
    if (g) g.push(e); else groups.set(e.it.category, [e])
  }
  const out: T[] = []
  for (let i = 0; out.length < list.length; i++) for (const g of groups.values()) if (g[i]) out.push(g[i])
  return out
}

/**
 * The start of a note, short enough to read at a glance: whole sentences until it has `MIN_TEASER`
 * characters. Above `MAX_TEASER`, it is cut at the last space before that, with "…".
 * `Intl.Segmenter` finds the sentences, so "z. B." or "1791." in a sentence do not end it.
 */
export function teaser(note: string, lang: Lang): string {
  let out = ''
  for (const { segment } of new Intl.Segmenter(lang, { granularity: 'sentence' }).segment(note.trim())) {
    out += segment
    if (out.trim().length >= MIN_TEASER) break
  }
  out = out.trim()
  if (out.length <= MAX_TEASER) return out
  const cut = out.slice(0, MAX_TEASER)
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;:–-]+$/, '') + ' …'
}
