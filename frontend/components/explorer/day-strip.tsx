'use client'
import type { Item, Window } from '@/lib/plan'
import { DAY0, dayLabel, weekday } from '@/lib/time'
import { useT } from '../i18n'

type Props = {
  days: string[]
  selected: string
  win: Window
  /** Items per day, category filter applied. */
  itemsOf: (day: string) => Item[]
  /** How many items are still to come on that day. */
  countOf: (day: string) => number
  onSelect: (day: string) => void
}

/** Seven day buttons, each with a 24-bar sparkline of how much is on per hour. The red band marks the part the timeline shows. */
export function DayStrip({ days, selected, win, itemsOf, countOf, onSelect }: Props) {
  const t = useT()
  const wa = (win[0] - DAY0) / 60 * 4, wb = (win[1] - DAY0) / 60 * 4
  return (
    <div className="x-days" role="group" aria-label={t.dayGroup}>
      {days.map((d, i) => {
        const items = itemsOf(d)
        const cnt = Array.from({ length: 24 }, (_, h) => { const t = DAY0 + h * 60 + 30; return items.filter(it => it.s <= t && it.e > t).length })
        const max = Math.max(1, ...cnt)
        return (
          <button key={d} className="x-day" aria-pressed={d === selected} onClick={() => onSelect(d)}>
            <small>{i === 0 ? t.today : i === 1 ? t.tomorrow : ' '}</small>
            <strong>{t.wd[weekday(d)]} {dayLabel(d)}</strong>
            <span>{t.events(countOf(d))}</span>
            <svg viewBox="0 0 96 22" preserveAspectRatio="none" aria-hidden="true">
              <rect x={wa} y={0} width={wb - wa} height={22} fill="#df3929" opacity={0.28} />
              {cnt.map((c, h) => c ? <rect key={h} x={h * 4 + 0.4} y={22 - c / max * 20} width={3.2} height={c / max * 20} fill="currentColor" /> : null)}
              <line x1={0} x2={96} y1={21.6} y2={21.6} stroke="currentColor" strokeWidth={0.8} />
            </svg>
          </button>
        )
      })}
    </div>
  )
}
