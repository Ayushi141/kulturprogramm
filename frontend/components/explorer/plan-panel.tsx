'use client'
import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import type { Item } from '@/lib/plan'
import { dayLabel, fmt, WDL, weekday } from '@/lib/time'
import { CAT } from './categories'

/** `plan` is the picked items of the day, in time order. */
type Props = { day: string; plan: Item[]; suggestion?: Item; onToggle: (id: string) => void; onClear: () => void }

export function PlanPanel({ day, plan, suggestion, onToggle, onClear }: Props) {
  const [copied, setCopied] = useState('')
  const name = WDL[weekday(day)]
  if (!plan.length) return (
    <section className="x-plan" id="my-evening">
      <h2>YOUR {name.toUpperCase()}<span className="period">.</span></h2>
      <p className="x-sum">EMPTY</p>
      <p className="x-emptyplan">Bookmark what you want to see{suggestion && <> — for example <button onClick={() => onToggle(suggestion.id)}>{suggestion.ev.title} at {fmt(suggestion.s)}</button></>}. Your picks for the day show up here in time order, with their ticket links.</p>
    </section>
  )
  const cities = new Set(plan.map(s => s.venue.city))
  const copy = async () => {
    const txt = `${name} ${dayLabel(day)}\n` + plan.map(s => `${fmt(s.s)}–${fmt(s.e)}  ${s.ev.title} (${s.venue.name}, ${s.venue.city})${s.ev.url ? '\n             ' + s.ev.url : ''}`).join('\n')
    try { await navigator.clipboard.writeText(txt); setCopied('Copied') } catch { setCopied('Copy blocked') }
    setTimeout(() => setCopied(''), 1400)
  }
  return (
    <section className="x-plan" id="my-evening">
      <h2>YOUR {name.toUpperCase()}<span className="period">.</span></h2>
      <p className="x-sum">{dayLabel(day)} · OUT {fmt(plan[0].s)} → {fmt(plan[plan.length - 1].e)} · {plan.length} STOP{plan.length > 1 ? 'S' : ''} · {[...cities].join(' + ').toUpperCase()}</p>
      <div className="x-steps">
        {plan.map((s, i) => {
          const nx = plan[i + 1], gap = nx ? nx.s - s.e : 0 // minutes between this end and the next start
          return [
            <div className="x-step" key={s.id}>
              <small>{fmt(s.s)}–{fmt(s.e)}{s.ev.price ? ' · ' + s.ev.price : ''}</small>
              <h3>{s.ev.title}</h3>
              <p><i style={{ background: CAT[s.category].color }} />{s.venue.name} · {s.venue.city}</p>
              {s.ev.url && <a className="x-ticket" href={s.ev.url} target="_blank" rel="noopener noreferrer">Tickets &amp; details <ArrowUpRight size={14} /></a>}
            </div>,
            nx && <div className={'x-leg' + (gap < 0 ? ' x-bad' : '')} key={s.id + '-leg'}>
              <b>→</b>{gap < 0 ? `overlaps by ${-gap} min` : gap === 0 ? 'back to back' : `${gap} min break`}
            </div>,
          ]
        })}
      </div>
      <div className="x-planbtns"><button onClick={copy}>{copied || 'Copy plan'}</button><button onClick={onClear}>Clear</button></div>
    </section>
  )
}
