'use client'
import { ArrowUpRight, Bookmark, MapPin } from 'lucide-react'
import { Picture } from '@/components/picture'
import { spanLabel, type Item } from '@/lib/plan'
import { fmt } from '@/lib/time'
import { CAT } from './categories'

type Props = {
  /** Upcoming items of the day (plus planned items), already filtered. */
  items: Item[]
  /** On today: how many items have already started. */
  started: number
  /** Picked items of the day, in time order. */
  plan: Item[]
  planIds: Set<string>
  emptyText: string
  onToggle: (id: string) => void
  onOpen: (it: Item) => void
  onTimeline: () => void
}

export function PosterView(p: Props) {
  const sorted = [...p.items].sort((a, b) => a.s - b.s || a.ev.title.localeCompare(b.ev.title))
  const groups = new Map<number, Item[]>()
  sorted.forEach(it => { const h = Math.floor(it.s / 60); groups.set(h, [...(groups.get(h) ?? []), it]) })

  const card = (it: Item) => {
    const planned = p.planIds.has(it.id)
    return (
      <article key={it.id} className={`card${planned ? ' x-planned' : ''}`}>
        <div className="poster">
          <button className="artbtn" aria-label={'Details for ' + it.ev.title} onClick={() => p.onOpen(it)}><Picture image={it.ev.image} category={it.category} /></button>
          <span className="tag">{CAT[it.category].tag}</span>
          <button className="bookmark" aria-label={(planned ? 'Remove from' : 'Add to') + ' my evening: ' + it.ev.title} aria-pressed={planned} onClick={() => p.onToggle(it.id)}>
            <Bookmark size={16} fill={planned ? 'currentColor' : 'none'} />
          </button>
        </div>
        <div className="cardtext">
          <small>{spanLabel(it)}{it.ev.price ? ' · ' + it.ev.price : ''}</small>
          <button onClick={() => p.onOpen(it)}><h3>{it.ev.title}</h3><ArrowUpRight size={18} /></button>
          <p><MapPin size={13} />{it.venue.name} · {it.venue.city}</p>
        </div>
      </article>
    )
  }

  if (!p.items.length) return <p className="x-empty">{p.emptyText}</p>
  return (
    <div>
      {[...groups].map(([h, its]) => (
        <section className="x-group" key={h}>
          <div className="x-ghead"><span className="x-gh">{fmt(h * 60)}</span><span className="x-gc">{its.length} starting</span></div>
          <div className="gridcards">{its.map(card)}</div>
        </section>
      ))}
      {p.started > 0 && <p className="x-note">{p.started} more already started today — <button onClick={p.onTimeline}>see them on the timeline</button>.</p>}
    </div>
  )
}
