'use client'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { ArrowRight, ArrowUpRight, Bookmark, X } from 'lucide-react'
import { spanLabel, type Item } from '@/lib/plan'
import { dayLabel, fmt, shiftDate, weekday } from '@/lib/time'
import { useT } from '../i18n'
import { Picture } from '../picture'
import { CAT } from './categories'

export type Relation = { text: string; strong: boolean } | null

/**
 * Set when the dates drawer of one card opens another card. The new card opens with its drawer
 * open, and the drawer's grid keeps its first day (`anchor`, the day of the performance the
 * visitor first opened). So the drawer does not move while the visitor jumps between dates.
 */
export type DatesView = { anchor: string }

/**
 * The other dates of a production (same title at the same venue), for the event card.
 * `of` returns its upcoming performances in time order, `it` included; `open` shows the
 * card of one of them with the given view. Guide provides it; without it the card shows no dates.
 */
export type Dates = { of: (it: Item) => Item[]; open: (it: Item, view: DatesView) => void }
export const DatesContext = createContext<Dates | null>(null)

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
 */
export function EventCard({ it, rel, picked, later, view, onToggle, onClose }: {
  it: Item
  /** How the event relates to the picks of its day (relation() in timeline.tsx). */
  rel: Relation
  picked: boolean
  /** A day after the strip: picks are "saved" there rather than added to an evening. */
  later?: boolean
  /** Set when another card's dates drawer opened this one: opens the drawer as it was. */
  view?: DatesView
  onToggle: () => void
  onClose: () => void
}) {
  const t = useT()
  const dates = useContext(DatesContext)
  const all = dates ? dates.of(it) : []
  const others = all.filter(d => d.id !== it.id)
  const anchor = view?.anchor ?? it.day
  const [drawer, setDrawer] = useState(!!view)
  // The drawer opens beside the card if the window has room for it, else over the card.
  const [over, setOver] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!drawer) return
    // measure in the next frame: a dialog shows the card only after this effect, still before that frame is painted
    const id = requestAnimationFrame(() => {
      const r = wrap.current?.getBoundingClientRect()
      if (r) setOver(r.right + r.width + 8 > window.innerWidth)
      closeBtn.current?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [drawer])
  return (
    <div className="x-cardwrap" ref={wrap}>
      <div className="x-card">
        <button className="x-popclose" aria-label={t.close} onClick={onClose}><X size={15} /></button>
        <div className="x-popphoto"><Picture image={it.ev.image} category={it.category} key={it.id} peek={it.ev.title} /></div>
        <small>{t.cat[it.category].tag} / {t.dateline(t.wdl[weekday(it.day)].toUpperCase(), dayLabel(it.day))}</small>
        <div className="x-tt">{it.ev.title}</div>
        <div className="x-tm">{spanLabel(it, t)}<br />{it.venue.name} · {it.venue.city}{it.ev.price && <> · {it.ev.price}</>}</div>
        {others.length > 0 && (
          <button className="x-more" onClick={() => setDrawer(d => !d)} aria-expanded={drawer}>
            {t.moreDates(others.length)} <ArrowRight size={13} />
          </button>
        )}
        {it.ev.note && <p className="x-tm">{it.ev.note}</p>}
        {rel && <p className={rel.strong ? 'x-rel' : 'x-rel x-rel-muted'}>{rel.text}</p>}
        <div className="x-popbtns">
          <button onClick={onToggle}>
            <Bookmark size={15} fill={picked ? 'currentColor' : 'none'} />{later ? (picked ? t.removeShort : t.save) : picked ? t.remove : t.add}
          </button>
          {it.ev.url && <a href={it.ev.url} target="_blank" rel="noopener noreferrer">{t.tickets}<ArrowUpRight size={15} /></a>}
        </div>
      </div>
      {dates && drawer && others.length > 0 && (
        <section className={over ? 'x-drawer x-drawer-over' : 'x-drawer'} aria-label={t.otherDates}>
          <button className="x-popclose" ref={closeBtn} aria-label={t.closeDates} onClick={() => setDrawer(false)}><X size={15} /></button>
          <OtherDates it={it} all={all} anchor={anchor} onOpen={d => { onClose(); dates.open(d, { anchor }) }} />
        </section>
      )}
    </div>
  )
}

/**
 * The drawer: a grid that starts at the anchor and never moves, then all dates as rows (the shown one marked).
 * The grid shows 14 days if they hold at least MIN_IN_DAYS performances (or all of them), else
 * 7 months. The choice depends on the production and the anchor only, never on the shown date.
 */
function OtherDates({ it, all, anchor, onOpen }: {
  it: Item
  /** All upcoming performances of the production, `it` included, in time order. */
  all: Item[]
  anchor: string
  onOpen: (d: Item) => void
}) {
  const t = useT()
  const color = CAT[it.category].color
  const when = (d: Item) => `${t.wd[weekday(d.day)]} ${dayLabel(d.day)}`
  const fromAnchor = all.filter(d => d.day >= anchor)
  const lastDay = shiftDate(anchor, CAL_DAYS - 1)
  const byDays = fromAnchor.filter(d => d.day <= lastDay).length >= Math.min(MIN_IN_DAYS, fromAnchor.length)

  /** One grid cell: the shown date's cell is highlighted, other cells with performances open their first one. */
  const cell = (key: string, label: React.ReactNode, on: Item[], selected: boolean) => {
    const target = on.find(d => d.id !== it.id)
    return selected || !target
      ? <div key={key} className={selected ? 'x-calsel' : undefined}>{label}</div>
      : <button key={key} onClick={() => onOpen(target)} aria-label={t.openDate(`${when(target)} ${fmt(target.s)}`)}>{label}</button>
  }

  let grid: React.ReactNode
  if (byDays) {
    grid = Array.from({ length: CAL_DAYS }, (_, i) => shiftDate(anchor, i)).map(day => {
      const on = fromAnchor.filter(d => d.day === day)
      return cell(day, <><span>{t.wd[weekday(day)]}<br />{+day.slice(8)}</span><span>{on.map(d => <i key={d.id} style={{ background: color }} />)}</span></>, on, day === it.day)
    })
  } else {
    const [y0, m0] = anchor.split('-').map(Number)
    grid = Array.from({ length: CAL_MONTHS }, (_, i) => {
      const y = y0 + Math.floor((m0 - 1 + i) / 12), m = (m0 - 1 + i) % 12 + 1
      const key = `${y}-${String(m).padStart(2, '0')}`
      const on = fromAnchor.filter(d => d.day.startsWith(key))
      // the short year (’27) on the first cell and on January
      const label = <><span>{t.months[m - 1]}<br />{i === 0 || m === 1 ? `’${String(y).slice(2)}` : '\u00a0'}</span><span>{on.length > 0 && `${on.length}×`}</span></>
      return cell(key, label, on, it.day >= anchor && it.day.startsWith(key))
    })
  }

  return <>
    <small>{t.otherDates}<br />{byDays ? t.calDays(dayLabel(anchor)) : t.calMonths(t.months[+anchor.slice(5, 7) - 1])}</small>
    <div className="x-cal" role="group" aria-label={byDays ? t.calendarLabel : t.calendarMonthsLabel}>{grid}</div>
    <div className="x-daterows">
    {all.map(d => d.id === it.id
      ? <div key={d.id} className="x-daterow x-datesel"><span>{when(d)}</span><span>{fmt(d.s)}</span><span className="x-seltag">{t.selectedDate}</span></div>
      : <button key={d.id} className="x-daterow" onClick={() => onOpen(d)}>
          <span>{when(d)}</span><span>{fmt(d.s)}</span><ArrowRight size={15} />
        </button>)}
    </div>
  </>
}
