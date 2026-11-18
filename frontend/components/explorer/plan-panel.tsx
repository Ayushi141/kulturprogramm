'use client'
import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { endLabel, type Item } from '@/lib/plan'
import { dayLabel, fmt, weekday } from '@/lib/time'
import { useT } from '../i18n'
import { CAT } from './categories'

/** `plan` is the picked items of the day, in time order. */
type Props = { day: string; plan: Item[]; suggestion?: Item; onToggle: (id: string) => void; onClear: () => void }

export function PlanPanel({ day, plan, suggestion, onToggle, onClear }: Props) {
  const t = useT()
  const [copied, setCopied] = useState('')
  const name = t.wdl[weekday(day)]
  const heading = <h2>{t.yourDay(name)}<span className="period">.</span></h2>
  if (!plan.length) return (
    <section className="x-plan" id="my-evening">
      {heading}
      <p className="x-sum">{t.empty}</p>
      <p className="x-emptyplan">{t.emptyStart}{suggestion && <>{t.emptyExample}<button onClick={() => onToggle(suggestion.id)}>{t.at(suggestion.ev.title, fmt(suggestion.s))}</button></>}{t.emptyEnd}</p>
    </section>
  )
  const cities = new Set(plan.map(s => s.venue.city))
  const copy = async () => {
    const txt = `${name} ${dayLabel(day)}\n` + plan.map(s => `${fmt(s.s)}–${endLabel(s)}  ${s.ev.title} (${s.venue.name}, ${s.venue.city})${s.ev.url ? '\n             ' + s.ev.url : ''}`).join('\n')
    try { await navigator.clipboard.writeText(txt); setCopied(t.copied) } catch { setCopied(t.copyBlocked) }
    setTimeout(() => setCopied(''), 1400)
  }
  return (
    <section className="x-plan" id="my-evening">
      {heading}
      <p className="x-sum">{dayLabel(day)} · {t.out} {fmt(plan[0].s)} → {endLabel(plan[plan.length - 1])} · {t.stops(plan.length)} · {[...cities].join(' + ').toUpperCase()}</p>
      <div className="x-steps">
        {plan.map((s, i) => {
          const nx = plan[i + 1], gap = nx ? nx.s - s.e : 0 // minutes between this end and the next start
          const est = s.endEstimated, leg = gap < 0 ? (est ? ' x-maybe' : ' x-bad') : ''
          return [
            <div className="x-step" key={s.id}>
              <small>{fmt(s.s)}–{endLabel(s)}{s.ev.price ? ' · ' + s.ev.price : ''}</small>
              <h3>{s.ev.title}</h3>
              <p><i style={{ background: CAT[s.category].color }} />{s.venue.name} · {s.venue.city}</p>
              {s.ev.url && <a className="x-ticket" href={s.ev.url} target="_blank" rel="noopener noreferrer">{t.tickets} <ArrowUpRight size={14} /></a>}
            </div>,
            nx && <div className={'x-leg' + leg} key={s.id + '-leg'}>
              <b>→</b>{est
                ? (gap < 0 ? t.mayOverlapEnd : gap === 0 ? t.aboutBackToBack : t.aboutBreak(gap))
                : (gap < 0 ? t.overlapsBy(-gap) : gap === 0 ? t.backToBack : t.breakOf(gap))}
            </div>,
          ]
        })}
      </div>
      <div className="x-planbtns"><button onClick={copy}>{copied || t.copyPlan}</button><button onClick={onClear}>{t.clear}</button></div>
    </section>
  )
}
