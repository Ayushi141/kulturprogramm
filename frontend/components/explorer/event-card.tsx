'use client'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { ArrowRight, ArrowUpRight, Bookmark, Check, Share, X } from 'lucide-react'
import { spanLabel, type Item } from '@/lib/plan'
import { dayLabel, fmt, shiftDate, weekday } from '@/lib/time'
import { shareLine, sharePath } from '@/lib/share'
import { useLang, useT } from '../i18n'
import type { Context } from '@/lib/types'
import { Picture } from '../picture'
import { CAT } from './categories'
import { MOUTH, Souffleur, Ticket } from './mascots'

export type Relation = { text: string; strong: boolean } | null

/**
 * What the event card needs to know about any performance, also one on another day: the card
 * can show any date of its production. Guide provides it; without it the card shows no dates.
 */
export type CardData = {
  /** The upcoming performances of the production of `it` (same title at the same venue), in time order, `it` included. */
  dates: (it: Item) => Item[]
  /** How a performance relates to the picks of its own day (relation() in timeline.tsx). */
  relation: (it: Item) => Relation
  picked: (it: Item) => boolean
  /** A day after the strip: picks are "saved" there rather than added to an evening. */
  later: (it: Item) => boolean
  /** On a past day: only a shared link opens such a card. */
  over: (it: Item) => boolean
  /** The context note of the production; undefined when it was not looked up yet. */
  context: (it: Item) => Context | undefined
}
export const CardContext = createContext<CardData | null>(null)

/** Days in the day grid, from the anchor. */
const CAL_DAYS = 14
/** Months in the month grid, from the anchor's month (covers the 183-day horizon). */
const CAL_MONTHS = 7
/**
 * Performances the day grid must show; with fewer, the grid shows months. A production with
 * fewer dates in total needs all of them in the day grid.
 */
const MIN_IN_DAYS = 3

/**
 * The detail card of one event, the same everywhere: the timelines show it in a popover beside
 * the clicked bar, the poster view and the "In focus" card in a dialog. The container positions
 * it; picking or removing the event closes it.
 * A date in the dates drawer changes the shown performance in place (`shown`); the card stays
 * where it is and the drawer's grid keeps starting at the day of `it`, the clicked performance.
 */
export function EventCard({ it, onToggle, onClose }: {
  it: Item
  /** Adds or removes a performance (the shown one, which can differ from `it`). */
  onToggle: (id: string) => void
  onClose: () => void
}) {
  const t = useT(), lang = useLang()
  const data = useContext(CardContext)
  const [shown, setShown] = useState(it)
  const all = data ? data.dates(it) : []
  const others = all.filter(d => d.id !== shown.id)
  const over = (d: Item) => data?.over(d) ?? false
  const rel = data?.relation(shown) ?? null, picked = data?.picked(shown) ?? false, later = data?.later(shown) ?? false
  const context = data?.context(shown)
  // one drawer at a time; a past performance (from a shared link) opens with its next dates, the grid starting at the first of them
  const [drawer, setDrawer] = useState<'dates' | 'context' | null>(() => over(it) && all.length > 1 ? 'dates' : null)
  const toggle = (d: 'dates' | 'context') => setDrawer(open => open === d ? null : d)
  const anchor = over(it) ? (all.find(d => !over(d))?.day ?? it.day) : it.day
  const [copied, setCopied] = useState(false)
  /** Phones open their share menu; elsewhere the link is copied. */
  const share = async () => {
    const url = location.origin + sharePath(lang, shown.id)
    // draw the link preview now, so it is ready when the chat app asks for it
    fetch(`${sharePath(lang, shown.id)}/preview.jpg`).catch(() => {})
    if ('share' in navigator && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title: shown.ev.title, text: `${shown.ev.title} – ${shareLine(t, shown.day, shown.s, shown.venue)}`, url }) } catch { /* closed */ }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard blocked: nothing to show */ }
  }
  // The drawer opens beside the card if the window has room for it, else over the card.
  const [onTop, setOnTop] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!drawer) return
    // measure in the next frame: a dialog shows the card only after this effect, still before that frame is painted
    const id = requestAnimationFrame(() => {
      const r = wrap.current?.getBoundingClientRect()
      if (r) setOnTop(r.right + r.width + 8 > window.innerWidth)
      closeBtn.current?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [drawer])
  return (
    <div className="x-cardwrap" ref={wrap}>
      <div className="x-card">
        <button className="x-popclose" aria-label={t.close} onClick={onClose}><X size={15} /></button>
        <div className="x-popphoto"><Picture image={shown.ev.image} category={shown.category} key={it.id} peek={shown.ev.title} /></div>
        <small>{t.cat[shown.category].tag} / {t.dateline(t.wdl[weekday(shown.day)].toUpperCase(), dayLabel(shown.day))}</small>
        <div className="x-tt">{shown.ev.title}</div>
        <div className="x-tm">{spanLabel(shown, t)}<br />{shown.venue.name} · {shown.venue.city}{shown.ev.price && <> · {shown.ev.price}</>}</div>
        {(others.length > 0 || context) && (
          <div className="x-tags">
            {others.length > 0 && (
              <button className="x-more" onClick={() => toggle('dates')} aria-expanded={drawer === 'dates'}>
                {t.moreDates(others.length)} <ArrowRight size={13} />
              </button>
            )}
            {context && (
              <button className="x-more" onClick={() => toggle('context')} aria-expanded={drawer === 'context'}>
                {t.context} <ArrowRight size={13} />
              </button>
            )}
          </div>
        )}
        {shown.ev.note && <p className="x-tm">{shown.ev.note}</p>}
        {over(shown)
          ? <p className="x-rel">{others.length ? t.overNextDates : t.over}</p>
          : rel && <p className={rel.strong ? 'x-rel' : 'x-rel x-rel-muted'}>{rel.text}</p>}
        <div className="x-popbtns">
          {!over(shown) && (
            <button onClick={() => onToggle(shown.id)}>
              <Bookmark size={15} fill={picked ? 'currentColor' : 'none'} />{later ? (picked ? t.removeShort : t.save) : picked ? t.remove : t.add}
            </button>
          )}
          {shown.ev.url && <a href={shown.ev.url} target="_blank" rel="noopener noreferrer">{t.tickets}<ArrowUpRight size={15} /></a>}
          <button className={copied ? 'x-copied' : undefined} onClick={share} aria-live="polite">
            {copied ? <Check size={15} /> : <Share size={15} />}{copied ? t.linkCopied : t.share}
          </button>
        </div>
      </div>
      {data && drawer === 'dates' && others.length > 0 && (
        <section className={onTop ? 'x-drawer x-drawer-over' : 'x-drawer'} aria-label={t.otherDates}>
          <button className="x-popclose" ref={closeBtn} aria-label={t.closeDates} onClick={() => setDrawer(null)}><X size={15} /></button>
          <OtherDates shown={shown} all={all} anchor={anchor} over={over} onShow={setShown} />
        </section>
      )}
      {drawer === 'context' && context && (
        <section className={onTop ? 'x-drawer x-drawer-over' : 'x-drawer'} aria-label={t.context}>
          <button className="x-popclose" ref={closeBtn} aria-label={t.closeContext} onClick={() => setDrawer(null)}><X size={15} /></button>
          <ContextNote context={context} movie={shown.category === 'movies'} productionId={shown.ev.productionId} />
        </section>
      )}
    </div>
  )
}

/**
 * The drawer: a grid that starts at the anchor and never moves, then all dates as rows (the shown one highlighted).
 * The grid shows 14 days if they hold at least MIN_IN_DAYS performances (or all of them), else
 * 7 months. The choice depends on the production and the anchor only, never on the shown date.
 */
function OtherDates({ shown, all, anchor, over, onShow }: {
  shown: Item
  /** All upcoming performances of the production, `shown` included, in time order. */
  all: Item[]
  /** First day of the grid: the day of the performance the visitor clicked (if past, of the next one). */
  anchor: string
  over: (d: Item) => boolean
  onShow: (d: Item) => void
}) {
  const t = useT()
  const color = CAT[shown.category].color
  const rowsBox = useRef<HTMLDivElement>(null)
  // After a grid tap, the selected row becomes the first row in view, with the later dates below it.
  // A row tap does not scroll: that row is already in view.
  const fromGrid = useRef(false)
  useEffect(() => {
    const box = rowsBox.current, row = box?.querySelector<HTMLElement>('.x-datesel')
    if (fromGrid.current && box && row) box.scrollTop = row.offsetTop - parseFloat(getComputedStyle(row).marginTop)
    fromGrid.current = false
  }, [shown.id])
  const when = (d: Item) => `${t.wd[weekday(d.day)]} ${dayLabel(d.day)}`
  const fromAnchor = all.filter(d => d.day >= anchor)
  const lastDay = shiftDate(anchor, CAL_DAYS - 1)
  const byDays = fromAnchor.filter(d => d.day <= lastDay).length >= Math.min(MIN_IN_DAYS, fromAnchor.length)

  /** One grid cell with one square per performance. The shown date's cell is highlighted; another cell shows its first performance. */
  const cell = (key: string, name: React.ReactNode, on: Item[], selected: boolean) => {
    const label = <><span>{name}</span><span>{on.map(d => <i key={d.id} style={{ background: color }} />)}</span></>
    const target = on.find(d => d.id !== shown.id)
    return selected || !target
      ? <div key={key} className={selected ? 'x-calsel' : undefined}>{label}</div>
      : <button key={key} onClick={() => { fromGrid.current = true; onShow(target) }} aria-label={t.openDate(`${when(target)} ${fmt(target.s)}`)}>{label}</button>
  }

  let grid: React.ReactNode
  if (byDays) {
    grid = Array.from({ length: CAL_DAYS }, (_, i) => shiftDate(anchor, i)).map(day => {
      const on = fromAnchor.filter(d => d.day === day)
      return cell(day, <>{t.wd[weekday(day)]}<br />{+day.slice(8)}</>, on, day === shown.day)
    })
  } else {
    const [y0, m0] = anchor.split('-').map(Number)
    grid = Array.from({ length: CAL_MONTHS }, (_, i) => {
      const y = y0 + Math.floor((m0 - 1 + i) / 12), m = (m0 - 1 + i) % 12 + 1
      const key = `${y}-${String(m).padStart(2, '0')}`
      const on = fromAnchor.filter(d => d.day.startsWith(key))
      return cell(key, t.months[m - 1], on, shown.day >= anchor && shown.day.startsWith(key))
    })
  }

  return <>
    <small>{t.otherDates}<br />{byDays ? t.calDays(dayLabel(anchor)) : t.calMonths(t.months[+anchor.slice(5, 7) - 1])}</small>
    <div className="x-cal" role="group" aria-label={byDays ? t.calendarLabel : t.calendarMonthsLabel}>{grid}</div>
    <div className="x-daterows" ref={rowsBox}>
    {all.map(d => d.id === shown.id
      ? <button key={d.id} className={over(d) ? 'x-daterow x-datesel x-dateover' : 'x-daterow x-datesel'} aria-current="true"><span>{when(d)}</span><span>{fmt(d.s)}</span></button>
      : <button key={d.id} className="x-daterow" onClick={() => onShow(d)}>
          <span>{when(d)}</span><span>{fmt(d.s)}</span><ArrowRight size={15} />
        </button>)}
    </div>
  </>
}

/**
 * The context drawer: the note as a whispered speech bubble, its narrator below it. Films get the
 * Ticket, everything else the Souffleur. A note is labelled as AI-generated. Without a note (the
 * enricher found nothing) the narrator says one of the fixed lines, the same one for a production
 * every time; those are written by hand and carry no label.
 */
function ContextNote({ context, movie, productionId }: { context: Context; movie: boolean; productionId: string }) {
  const t = useT(), lang = useLang()
  const pick = [...productionId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0) % t.contextNothing.length
  const note = context[lang]
  return <>
    <small>{t.contextHead}</small>
    <div className="x-bubble">
      <p>{note ?? t.contextNothing[pick]}</p>
      {note && <small className="x-ai">{t.aiGenerated}</small>}
      <Tail to={MOUTH[movie ? 'ticket' : 'souffleur']} />
    </div>
    <div className="x-narrator">
      {movie ? <Ticket /> : <Souffleur />}
      <div><b>{movie ? t.ticket : t.souffleur}</b><span>{movie ? t.ticketAbout : t.souffleurAbout}</span></div>
    </div>
  </>
}

/**
 * The dashed tail of the speech bubble, from the bubble's bottom edge to the narrator's mouth.
 * `to` is the mouth in the narrator drawing, which starts 6 px above the bubble's bottom edge
 * (`.x-narrator` in explorer.css) at the bubble's left edge.
 */
function Tail({ to: [x, y] }: { to: readonly [number, number] }) {
  // the tail starts 1.5 px above the bubble edge (it covers the border) and ends at the mouth
  const base = [x + 6, x + 26], tip = y - 6 + 1.5
  return (
    <svg className="x-tail" width={base[1] + 2} height={tip + 2} aria-hidden="true">
      <path d={`M${base[0]} 0 L${x} ${tip} L${base[1]} 0 Z`} fill="var(--yellow)" />
      <path d={`M${base[0]} 0 L${x} ${tip} L${base[1]} 0`} fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="4 3" />
      <path d={`M${base[0] + 1} .75 H${base[1] - 1}`} stroke="var(--yellow)" strokeWidth="3" />
    </svg>
  )
}
