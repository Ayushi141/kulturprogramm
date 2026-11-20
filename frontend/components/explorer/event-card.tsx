'use client'
import { ArrowUpRight, Bookmark, X } from 'lucide-react'
import { spanLabel, type Item } from '@/lib/plan'
import { dayLabel, weekday } from '@/lib/time'
import { useT } from '../i18n'
import { Picture } from '../picture'

export type Relation = { text: string; strong: boolean } | null

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
  return (
    <div className="x-card">
      <button className="x-popclose" aria-label={t.close} onClick={onClose}><X size={15} /></button>
      <div className="x-popphoto"><Picture image={it.ev.image} category={it.category} key={it.id} peek={it.ev.title} /></div>
      <small>{t.cat[it.category].tag} / {t.dateline(t.wdl[weekday(it.day)].toUpperCase(), dayLabel(it.day))}</small>
      <div className="x-tt">{it.ev.title}</div>
      <div className="x-tm">{spanLabel(it, t)}<br />{it.venue.name} · {it.venue.city}{it.ev.price && <> · {it.ev.price}</>}</div>
      {it.ev.note && <p className="x-tm">{it.ev.note}</p>}
      {rel && <p className={rel.strong ? 'x-rel' : 'x-rel x-rel-muted'}>{rel.text}</p>}
      <div className="x-popbtns">
        <button onClick={onToggle}>
          <Bookmark size={15} fill={picked ? 'currentColor' : 'none'} />{later ? (picked ? t.removeShort : t.save) : picked ? t.remove : t.add}
        </button>
        {it.ev.url && <a href={it.ev.url} target="_blank" rel="noopener noreferrer">{t.tickets}<ArrowUpRight size={15} /></a>}
      </div>
    </div>
  )
}
