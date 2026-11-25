'use client'
import type { Item, Window } from '@/lib/plan'
import { DAY0, dayLabel, weekday } from '@/lib/time'
import { useT } from '../i18n'
import { PALETTE } from '@/lib/colors'

type Props = {
  days: string[]
  selected: string
  win: Window
  /** Items per day, category filter applied. */
  itemsOf: (day: string) => Item[]
  /** How many items are still to come on that day. */
  countOf: (day: string) => number
  onSelect: (day: string) => void
  /** The "later" button: everything after the seven days. `weekly` = performances per week. */
  later: { key: string; until: string; count: number; weekly: number[] }
}

/**
 * Seven day buttons, each with a 24-bar sparkline of how much is on per hour (the red band marks
 * the part the timeline shows), and one "later" button for the months after them, with one bar per week.
 */
export function DayStrip({ days, selected, win, itemsOf, countOf, onSelect, later }: Props) {
  const t = useT()
  const wmax = Math.max(1, ...later.weekly), bw = 96 / Math.max(1, later.weekly.length)
  const wa = (win[0] - DAY0) / 60 * 4, wb = (win[1] - DAY0) / 60 * 4
  return (
    <div className="x-days" role="group" aria-label={t.dayGroup}>
      {days.map((d, i) => {
        const items = itemsOf(d)
        const cnt = Array.from({ length: 24 }, (_, h) => { const t = DAY0 + h * 60 + 30; return items.filter(it => it.s <= t && it.e > t).length })
        const max = Math.max(1, ...cnt)
        return (
          <button key={d} className="x-day" aria-pressed={d === selected} onClick={() => onSelect(d)}>
            {/* days without a label keep an empty line, so all dates line up */}
            <small>{i === 0 ? t.today : i === 1 ? t.tomorrow : ' '}</small>
            <strong>{t.wd[weekday(d)]} {dayLabel(d)}</strong>
            <span>{t.events(countOf(d))}</span>
            <svg viewBox="0 0 96 22" preserveAspectRatio="none" aria-hidden="true">
              <rect x={wa} y={0} width={wb - wa} height={22} fill={PALETTE.red} opacity={0.28} />
              {cnt.map((c, h) => c ? <rect key={h} x={h * 4 + 0.4} y={22 - c / max * 20} width={3.2} height={c / max * 20} fill="currentColor" /> : null)}
              <line x1={0} x2={96} y1={21.6} y2={21.6} stroke="currentColor" strokeWidth={0.8} />
            </svg>
          </button>
        )
      })}
      <button className="x-day x-later" aria-pressed={selected === later.key} onClick={() => onSelect(later.key)}>
        <small>{t.later}</small>
        <strong>{t.until(dayLabel(later.until))}</strong>
        <span>{t.shows(later.count)}</span>
        <svg viewBox="0 0 96 22" preserveAspectRatio="none" aria-hidden="true">
          {later.weekly.map((c, w) => c ? <rect key={w} x={w * bw + 0.3} y={22 - c / wmax * 20} width={Math.max(0.8, bw - 0.9)} height={c / wmax * 20} fill="currentColor" /> : null)}
          <line x1={0} x2={96} y1={21.6} y2={21.6} stroke="currentColor" strokeWidth={0.8} />
        </svg>
      </button>
    </div>
  )
}
