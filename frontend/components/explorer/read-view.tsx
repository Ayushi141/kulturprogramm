'use client'
import { ArrowRight, Bookmark } from 'lucide-react'
import type { Context } from '@/lib/types'
import type { Item } from '@/lib/plan'
import { dayLabel, fmt, weekday } from '@/lib/time'
import { useLang, useT } from '../i18n'
import { CAT } from './categories'
import { Souffleur, Ticket } from './mascots'

type Props = {
  /** Upcoming performances of every production in the shown categories, in time order. */
  items: Item[]
  contexts: Record<string, Context>
  planIds: Set<string>
  onToggle: (id: string) => void
  onOpen: (it: Item) => void
}

/**
 * The reading view: every production with a context note, newest in the programme first.
 * Each entry shows the next performance; its card has the other dates and the tickets. The AI notice
 * at the top covers all notes, so the entries carry no label of their own.
 */
export function ReadView({ items, contexts, planIds, onToggle, onOpen }: Props) {
  const t = useT(), lang = useLang()
  // the next performance and the number of later ones, per production with a note
  const byProduction = new Map<string, Item[]>()
  for (const it of items) {
    const note = contexts[it.ev.productionId]?.[lang]
    if (note) byProduction.set(it.ev.productionId, [...(byProduction.get(it.ev.productionId) ?? []), it])
  }
  const entries = [...byProduction].sort(([a], [b]) => contexts[a].rank - contexts[b].rank)

  return (
    <div className="x-read">
      <header className="x-readhead">
        <p>{t.readSort}</p>
        <div className="x-readai"><Souffleur width={26} /><p>{t.readAi}</p></div>
      </header>
      {entries.length === 0 && <p className="x-empty">{t.readEmpty}</p>}
      {entries.map(([id, dates]) => {
        const next = dates[0], ctx = contexts[id]
        const planned = planIds.has(next.id)
        const when = `${t.wd[weekday(next.day)]} ${dayLabel(next.day)} ${fmt(next.s)}`
        return (
          <article key={id} className="x-readitem">
            <div className="x-readkicker">
              <i className="x-sw" style={{ background: CAT[next.category].color }} />
              <small>{t.cat[next.category].tag} · {when}</small>
              {ctx.isNew && <b className="x-readnew">{t.readNew}</b>}
            </div>
            <div className="x-readtitle">
              <h3><button onClick={() => onOpen(next)}>{next.ev.title}</button></h3>
              {next.category === 'movies' ? <Ticket width={30} /> : <Souffleur width={30} />}
            </div>
            <p className="x-readvenue">{next.venue.name}</p>
            <p className="x-readnote">{ctx[lang]}</p>
            <div className="x-readactions">
              <button className="x-more" onClick={() => onOpen(next)}>{t.readMore(dates.length - 1)} <ArrowRight size={13} /></button>
              <button className="x-readsave" aria-pressed={planned} aria-label={(planned ? t.removeFrom : t.addTo)(next.ev.title)} onClick={() => onToggle(next.id)}>
                <Bookmark size={15} fill={planned ? 'currentColor' : 'none'} />{t.readSave}
              </button>
            </div>
          </article>
        )
      })}
    </div>
  )
}
