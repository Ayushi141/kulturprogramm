'use client'
import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { endLabel, timeRange, type Item } from '@/lib/plan'
import { dayLabel, fmt, weekday } from '@/lib/time'
import { useT } from '../i18n'
import { CAT } from '@/lib/colors'

/**
 * "Mein Abend": every saved performance from today on, whatever day is selected, grouped by day.
 * Within a day the steps show the breaks and overlaps between them. `picks` is in date and time
 * order; `suggestion` (a performance of the selected day) fills the empty panel.
 */
type Props = { picks: Item[]; today: string; suggestion?: Item; onToggle: (id: string) => void }

export function PlanPanel({ picks, today, suggestion, onToggle }: Props) {
  const t = useT()
  const [copied, setCopied] = useState('')
  const byDay = new Map<string, Item[]>()
  picks.forEach(it => byDay.set(it.day, [...(byDay.get(it.day) ?? []), it]))
  const dayName = (d: string) => (d === today ? t.today : t.wd[weekday(d)].toUpperCase()) + ' ' + dayLabel(d)
  const heading = <h2>{t.myEvening}<span className="period">.</span></h2>

  if (!picks.length) return (
    <section className="x-plan" id="my-evening">
      {heading}
      <p className="x-sum">{t.empty}</p>
      <p className="x-emptyplan">{t.emptyStart}{suggestion && <>{t.emptyExample}<button onClick={() => onToggle(suggestion.id)}>{t.at(suggestion.ev.title, fmt(suggestion.s))}</button></>}{t.emptyEnd}</p>
    </section>
  )

  const copy = async () => {
    const txt = [...byDay].map(([d, plan]) => `${t.dateline(t.wdl[weekday(d)], dayLabel(d))}\n` + plan.map(s =>
      `${timeRange(s, t)}  ${s.ev.title} (${s.venue.name}, ${s.venue.city})${s.ev.url ? '\n             ' + s.ev.url : ''}`).join('\n')).join('\n\n')
    try { await navigator.clipboard.writeText(txt); setCopied(t.copied) } catch { setCopied(t.copyBlocked) }
    setTimeout(() => setCopied(''), 1400)
  }
  return (
    <section className="x-plan" id="my-evening">
      {heading}
      <p className="x-sum">{t.laterSum(picks.length, byDay.size)}</p>
      {[...byDay].map(([d, plan]) => {
        const cities = [...new Set(plan.map(s => s.venue.city))].join(' + ').toUpperCase()
        return (
          <div className="x-planday" key={d}>
            <p><b>{dayName(d)}</b> · {fmt(plan[0].s)} → {endLabel(plan[plan.length - 1], t)} · {cities}</p>
            <div className="x-steps">
              {plan.map((s, i) => {
                // minutes between this end (estimated when not announced) and the next start
                const nx = plan[i + 1], gap = nx ? nx.s - s.e : 0
                const leg = gap < 0 && s.endKnown ? ' x-bad' : '' // red only for a certain overlap
                return [
                  <div className="x-step" key={s.id}>
                    <small>{timeRange(s, t)}{s.ev.price ? ' · ' + s.ev.price : ''}</small>
                    <h3>{s.ev.title}</h3>
                    <p><i style={{ background: CAT[s.category].color }} />{s.venue.name} · {s.venue.city}</p>
                    {s.ev.url && <a className="x-ticket" href={s.ev.url} target="_blank" rel="noopener noreferrer">{t.tickets} <ArrowUpRight size={14} /></a>}
                    <button className="x-remove" onClick={() => onToggle(s.id)}>{t.removeShort}</button>
                  </div>,
                  nx && <div className={'x-leg' + leg} key={s.id + '-leg'}>
                    <b>→</b>{!s.endKnown
                      ? t.endNotAnnounced + (gap < 0 ? ' – ' + t.mayOverlapShort : '')
                      : (gap < 0 ? t.overlapsBy(-gap) : gap === 0 ? t.backToBack : t.breakOf(gap))}
                  </div>,
                ]
              })}
            </div>
          </div>
        )
      })}
      <div className="x-planbtns"><button onClick={copy}>{copied || t.copyPlan}</button></div>
    </section>
  )
}
