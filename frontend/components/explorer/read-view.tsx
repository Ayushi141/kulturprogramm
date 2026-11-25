'use client'
import { ArrowRight, Bookmark } from 'lucide-react'
import { useContext } from 'react'
import type { Context } from '@/lib/types'
import type { Item } from '@/lib/plan'
import { dayLabel, fmt, weekday } from '@/lib/time'
import { useLang, useT } from '../i18n'
import { CAT } from '@/lib/colors'
import { CardContext } from './event-card'
import { Souffleur, Ticket } from './mascots'

type Props = {
  /** The performances to show, in the order to show them (see `guide.tsx`). */
  items: Item[]
  contexts: Record<string, Context>
  planIds: Set<string>
  onToggle: (id: string) => void
  onOpen: (it: Item) => void
}

/**
 * The reading view: one entry per production with a context note, at its first performance in `items`.
 * The entry counts all of the production's upcoming dates; its card has them and the tickets. The AI notice
 * at the top covers all notes, so the entries carry no label of their own.
 */
export function ReadView({ items, contexts, planIds, onToggle, onOpen }: Props) {
  const t = useT(), lang = useLang(), data = useContext(CardContext)
  // the first performance per production with a note; a Map keeps the order of `items`
  const firsts = new Map<string, Item>()
  for (const it of items) {
    const id = it.ev.productionId
    if (contexts[id]?.[lang] && !firsts.has(id)) firsts.set(id, it)
  }

  return (
    <div className="x-read">
      <div className="x-readai"><Souffleur width={26} tight /><p>{t.readAi}</p></div>
      {firsts.size === 0 && <p className="x-empty">{t.readEmpty}</p>}
      {[...firsts].map(([id, next]) => {
        const ctx = contexts[id], others = (data?.dates(next).length ?? 1) - 1
        const planned = planIds.has(next.id)
        const when = `${t.wd[weekday(next.day)]} ${dayLabel(next.day)} ${fmt(next.s)}`
        return (
          <article key={id} className="x-readitem">
            <div className="x-readmascot">{next.category === 'movies' ? <Ticket width={30} /> : <Souffleur width={30} />}</div>
            <div className="x-readbody">
            <div className="x-readkicker">
              <i className="x-sw" style={{ background: CAT[next.category].color }} />
              <small>{t.cat[next.category].tag} · {when}</small>
              {ctx.isNew && <b className="x-readnew">{t.readNew}</b>}
            </div>
            <div className="x-readtitle">
              <h3><button onClick={() => onOpen(next)}>{next.ev.title}</button></h3>
            </div>
            {/* as in the timeline: a venue named like its organizer is not repeated */}
            <p className="x-readvenue">{next.venue.organizer}{next.venue.name !== next.venue.organizer && ` · ${next.venue.name}`}</p>
            <p className="x-readnote">{ctx[lang]}</p>
            <div className="x-readactions">
              <button className="x-more" onClick={() => onOpen(next)}>{t.readMore(others)} <ArrowRight size={13} /></button>
              <button className="x-readsave" aria-pressed={planned} aria-label={(planned ? t.removeFrom : t.addTo)(next.ev.title)} onClick={() => onToggle(next.id)}>
                <Bookmark size={15} fill={planned ? 'currentColor' : 'none'} />{t.readSave}
              </button>
            </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}
