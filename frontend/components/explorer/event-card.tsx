'use client'
import { createContext, useContext, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUpRight, Bookmark, X } from 'lucide-react'
import { spanLabel, type Item } from '@/lib/plan'
import { dayLabel, fmt, shiftDate, weekday } from '@/lib/time'
import { useT } from '../i18n'
import { Picture } from '../picture'
import { CAT } from './categories'

export type Relation = { text: string; strong: boolean } | null

/**
 * The other dates of a production (same title at the same venue), for the event card.
 * `of` returns its upcoming performances in time order, `it` included; `open` shows the
 * card of one of them. Guide provides it; without it the card shows no dates.
 */
export type Dates = { of: (it: Item) => Item[]; open: (it: Item) => void }
export const DatesContext = createContext<Dates | null>(null)

/** Days in the mini calendar, from the day of the shown performance. */
const CAL_DAYS = 14
/** Date rows shown before "see all". */
const ROWS = 3

/**
 * The detail card of one event, the same everywhere: the timelines show it in a popover beside
 * the clicked bar, the poster view and the "In focus" card in a dialog. The container positions
 * it; picking or removing the event closes it.
 */
export function EventCard({ it, rel, picked, later, onToggle, onClose }: {
  it: Item
  /** How the event relates to the picks of its day (relation() in timeline.tsx). */
  rel: Relation
  picked: boolean
  /** A day after the strip: picks are "saved" there rather than added to an evening. */
  later?: boolean
  onToggle: () => void
  onClose: () => void
}) {
  const t = useT()
  const dates = useContext(DatesContext)
  const others = dates ? dates.of(it).filter(d => d.id !== it.id) : []
  const section = useRef<HTMLDivElement>(null)
  return (
    <div className="x-card">
      <button className="x-popclose" aria-label={t.close} onClick={onClose}><X size={15} /></button>
      <div className="x-popphoto"><Picture image={it.ev.image} category={it.category} key={it.id} peek={it.ev.title} /></div>
      <small>{t.cat[it.category].tag} / {t.dateline(t.wdl[weekday(it.day)].toUpperCase(), dayLabel(it.day))}</small>
      <div className="x-tt">{it.ev.title}</div>
      <div className="x-tm">{spanLabel(it, t)}<br />{it.venue.name} · {it.venue.city}{it.ev.price && <> · {it.ev.price}</>}</div>
      {others.length > 0 && (
        <button className="x-more" onClick={() => section.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}>
          {t.moreDates(others.length)} <ArrowDown size={13} />
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
      {dates && others.length > 0 && (
        <div className="x-dates" ref={section}>
          <OtherDates it={it} all={dates.of(it)} others={others} onOpen={d => { onClose(); dates.open(d) }} />
        </div>
      )}
    </div>
  )
}

/** Mini calendar of the next two weeks, then the other dates as rows. */
function OtherDates({ it, all, others, onOpen }: { it: Item; all: Item[]; others: Item[]; onOpen: (d: Item) => void }) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const days = Array.from({ length: CAL_DAYS }, (_, i) => shiftDate(it.day, i))
  const color = CAT[it.category].color
  const when = (d: Item) => `${t.wd[weekday(d.day)]} ${dayLabel(d.day)}`
  const rows = expanded ? others : others.slice(0, ROWS)
  return <>
    <small>{t.otherDates}</small>
    <div className="x-cal" role="group" aria-label={t.calendarLabel}>
      {days.map(day => {
        const on = all.filter(d => d.day === day)
        const label = <><span>{t.wd[weekday(day)]}<br />{+day.slice(8)}</span><span>{on.map(d => <i key={d.id} style={{ background: color }} />)}</span></>
        const target = on.find(d => d.id !== it.id)
        // the shown day is highlighted; other days with performances open their first one
        return day === it.day || !target
          ? <div key={day} className={day === it.day ? 'x-calsel' : undefined}>{label}</div>
          : <button key={day} onClick={() => onOpen(target)} aria-label={t.openDate(`${when(target)} ${fmt(target.s)}`)}>{label}</button>
      })}
    </div>
    {rows.map(d => (
      <button key={d.id} className="x-daterow" onClick={() => onOpen(d)}>
        <span>{when(d)}</span><span>{fmt(d.s)}</span><ArrowRight size={15} />
      </button>
    ))}
    {others.length > ROWS && (
      <button className="x-daterow x-alldates" onClick={() => setExpanded(e => !e)} aria-expanded={expanded}>
        {expanded ? t.fewerDates : t.allDates(all.length)}
      </button>
    )}
  </>
}
