'use client'
import { ArrowUpRight, Bookmark, MapPin } from 'lucide-react'
import { Picture } from '@/components/picture'
import { productions, spanLabel, type Item, type Production } from '@/lib/plan'
import { dayLabel, fmt, weekday } from '@/lib/time'
import { useT } from '../i18n'

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
  const t = useT()
  const sorted = [...p.items].sort((a, b) => a.s - b.s || a.ev.title.localeCompare(b.ev.title))
  const groups = new Map<number, Item[]>()
  sorted.forEach(it => { const h = Math.floor(it.s / 60); groups.set(h, [...(groups.get(h) ?? []), it]) })

  const card = (it: Item) => {
    const planned = p.planIds.has(it.id)
    return (
      <article key={it.id} className={`card${planned ? ' x-planned' : ''}`}>
        <div className="poster">
          <button className="artbtn" aria-label={t.detailsFor(it.ev.title)} onClick={() => p.onOpen(it)}><Picture image={it.ev.image} category={it.category} /></button>
          <span className="tag">{t.cat[it.category].tag}</span>
          <button className="bookmark" aria-label={(planned ? t.removeFrom : t.addTo)(it.ev.title)} aria-pressed={planned} onClick={() => p.onToggle(it.id)}>
            <Bookmark size={16} fill={planned ? 'currentColor' : 'none'} />
          </button>
        </div>
        <div className="cardtext">
          <small>{spanLabel(it, t)}{it.ev.price ? ' · ' + it.ev.price : ''}</small>
          <button onClick={() => p.onOpen(it)}><h3>{it.ev.title}</h3><ArrowUpRight size={18} /></button>
          <p>{it.venue.organizer}</p>
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
          <div className="x-ghead"><span className="x-gh">{fmt(h * 60)}</span><span className="x-gc">{t.starting(its.length)}</span></div>
          <div className="gridcards">{its.map(card)}</div>
        </section>
      ))}
      {p.started > 0 && <p className="x-note">{t.startedToday(p.started)}<button onClick={p.onTimeline}>{t.seeOnTimeline}</button>.</p>}
    </div>
  )
}

/** Months ahead: one card per production, grouped by the month of its next performance. */
export function SeasonPoster(p: { items: Item[]; planIds: Set<string>; onToggle: (id: string) => void; onOpen: (it: Item) => void }) {
  const t = useT()
  const prods = productions(p.items).sort((a, b) => a.dates[0].day.localeCompare(b.dates[0].day) || a.dates[0].s - b.dates[0].s)
  const groups = new Map<string, Production[]>()
  prods.forEach(pr => { const m = pr.dates[0].day.slice(0, 7); groups.set(m, [...(groups.get(m) ?? []), pr]) })
  if (!prods.length) return <p className="x-empty">{t.seasonEmpty}</p>
  return (
    <div>
      {[...groups].map(([m, ps]) => (
        <section className="x-group" key={m}>
          <div className="x-ghead"><span className="x-gh">{t.monthsLong[+m.slice(5, 7) - 1].toUpperCase()} {m.slice(0, 4)}</span><span className="x-gc">{t.productionsCount(ps.length)}</span></div>
          <div className="gridcards">{ps.map(pr => {
            const next = pr.dates[0], last = pr.dates[pr.dates.length - 1], saved = p.planIds.has(next.id)
            const planned = pr.dates.some(d => p.planIds.has(d.id))
            return (
              <article key={pr.key} className={`card${planned ? ' x-planned' : ''}`}>
                <div className="poster">
                  <button className="artbtn" aria-label={t.detailsFor(pr.title)} onClick={() => p.onOpen(next)}><Picture image={next.ev.image} category={pr.category} /></button>
                  <span className="tag">{t.cat[pr.category].tag}</span>
                  <button className="bookmark" aria-label={(saved ? t.removeNext : t.saveNext)(pr.title)} aria-pressed={saved} onClick={() => p.onToggle(next.id)}>
                    <Bookmark size={16} fill={saved ? 'currentColor' : 'none'} />
                  </button>
                </div>
                <div className="cardtext">
                  <small>{t.nextShow(`${t.wd[weekday(next.day)].toUpperCase()} ${dayLabel(next.day)} ${fmt(next.s)}`, pr.dates.length - 1, dayLabel(last.day))}</small>
                  <button onClick={() => p.onOpen(next)}><h3>{pr.title}</h3><ArrowUpRight size={18} /></button>
                  <p>{pr.venue.organizer}</p>
                  <p><MapPin size={13} />{pr.venue.name} · {pr.venue.city}</p>
                </div>
              </article>
            )
          })}</div>
        </section>
      ))}
    </div>
  )
}
