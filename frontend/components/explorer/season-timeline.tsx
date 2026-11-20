'use client'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowUpRight, Bookmark, X } from 'lucide-react'
import type { Venue } from '@/lib/types'
import { productions, timeRange, type Item } from '@/lib/plan'
import { dayLabel, daysBetween, shiftDate, weekday } from '@/lib/time'
import { useT } from '../i18n'
import { Picture } from '../picture'
import { CAT } from './categories'
import { fitText, T, TEXT_FONT, TITLE_FONT, TRACK, wrapText } from './svg-text'
import { BASE_W, MAX_ZOOM, MIN_W, NARROW } from './timeline'

/* Geometry (logical px, scaled by Z like the day timeline) */
const GUTTER = 200, R = 20, TOP = 52, LANE = 24, MARK_H = 11
/** Phones: the title sits on its own row above the marks, and each day gets at least DAY_PX. */
const TITLE_ROW = 17, DAY_PX = 5
const INK = '#201f1a', RED = '#df3929'

type Float = { x: number; y: number }
type Row = { kind: 'city' | 'venue' | 'lane'; label: string; y: number; h: number; alt?: boolean; x?: number }

export type SeasonTimelineProps = {
  venues: Venue[]
  /** Performances in the range (category filter applied), plus saved ones. */
  items: Item[]
  /** First and last day of the range (YYYY-MM-DD). */
  from: string
  to: string
  planIds: Set<string>
  onToggle: (id: string) => void
}

/** Months ahead: one line per production, one square per performance. */
export function SeasonTimeline(p: SeasonTimelineProps) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [cw, setCw] = useState(1100) // CSS px available for the chart
  const [narrow, setNarrow] = useState(false)
  const [tip, setTip] = useState<(Float & { body: ReactNode }) | null>(null)
  // `fitted` is set once the popover has been measured and, if needed, moved on screen
  const [pop, setPop] = useState<(Float & { id: string; fitted?: boolean }) | null>(null)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const n = el.clientWidth <= NARROW
      setNarrow(n)
      setCw(n ? el.clientWidth : Math.max(MIN_W, el.clientWidth))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // a popover that would stick out of the window is centred instead
  useLayoutEffect(() => {
    const el = popRef.current
    if (!pop || pop.fitted || !el) return
    const r = el.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, m = 8
    const inside = r.left >= m && r.top >= m && r.right <= vw - m && r.bottom <= vh - m
    setPop(inside ? { ...pop, fitted: true } : { ...pop, fitted: true, x: Math.max(m, (vw - r.width) / 2), y: Math.max(m, (vh - r.height) / 2) })
  }, [pop])
  // close the popover on outside click, Escape or a real scroll
  useEffect(() => {
    if (!pop) return
    const down = (e: PointerEvent) => { if (!popRef.current?.contains(e.target as Node) && !(e.target as Element).closest?.('[data-mark]')) setPop(null) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setPop(null) }
    const b = box.current, y0 = window.scrollY, x0 = b?.scrollLeft ?? 0
    const close = () => { if (Math.abs(window.scrollY - y0) > 60 || Math.abs((b?.scrollLeft ?? 0) - x0) > 60) setPop(null) }
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key)
    window.addEventListener('scroll', close, { passive: true })
    b?.addEventListener('scroll', close, { passive: true })
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); window.removeEventListener('scroll', close); b?.removeEventListener('scroll', close) }
  }, [pop])

  const nDays = daysBetween(p.from, p.to) + 1
  // desktop: zoomed like the day timeline; phones: no gutter, scrolls sideways at DAY_PX per day
  const L = narrow ? 12 : GUTTER
  const Z = narrow ? 1 : Math.min(MAX_ZOOM, Math.max(1, cw / BASE_W))
  const W = narrow ? Math.max(cw, L + nDays * DAY_PX + R) : cw / Z
  const k = (W - L - R) / nDays // px per day
  const xd = (day: string) => L + (daysBetween(p.from, day) + 0.5) * k
  // a mark is at most one day wide, so performances on consecutive days never overlap
  const mw = Math.max(2.5, Math.min(9, k - 1.5))
  const head = narrow ? TITLE_ROW : 0

  /* rows: city → venue → one lane per production */
  const layout = useMemo(() => {
    const prods = productions(p.items)
    const cities: string[] = []
    p.venues.forEach(v => { if (!cities.includes(v.city)) cities.push(v.city) })
    const rows: Row[] = [], laneY = new Map<string, number>()
    let y = TOP
    for (const city of cities) {
      const vs = p.venues.filter(v => v.city === city)
        .map(v => ({ v, ps: prods.filter(pr => pr.venue.id === v.id).sort((a, b) => a.dates[0].day.localeCompare(b.dates[0].day) || a.title.localeCompare(b.title)) }))
        .filter(r => r.ps.length)
      if (!vs.length) continue
      rows.push({ kind: 'city', label: city, y, h: 30 }); y += 30
      for (const { v, ps } of vs) {
        rows.push({ kind: 'venue', label: v.name, y, h: 22 }); y += 22
        ps.forEach((pr, i) => {
          const h = head + LANE
          // phones: the title starts at the first performance, so it scrolls along with its marks
          rows.push({ kind: 'lane', label: pr.title, y, h, alt: i % 2 === 1, x: narrow ? Math.max(L, xd(pr.dates[0].day) - mw / 2) : undefined })
          laneY.set(pr.key, y + head); y += h
        })
        y += 4
      }
      y += 6
    }
    return { rows, prods, laneY, H: Math.max(y + 20, TOP + 120) }
    // xd and mw follow from W, L and the range
  }, [p.items, p.venues, head, narrow, W, L, p.from, p.to])
  const H = layout.H

  /* axis: month starts (labelled) and Mondays (dashed) */
  const months: { x: number; label: string }[] = [], mondays: number[] = []
  for (let i = 0; i < nDays; i++) {
    const d = shiftDate(p.from, i), x = L + i * k
    if (i === 0 || d.endsWith('-01')) {
      // drop the previous label when it has no room (the range starts a few days before a new month)
      if (months.length && x - months[months.length - 1].x < 70) months.pop()
      const m = +d.slice(5, 7)
      months.push({ x, label: t.months[m - 1] + (m === 1 || i === 0 ? ' ' + d.slice(0, 4) : '') })
    }
    if (weekday(d) === 1) mondays.push(x)
  }

  const near = (cx: number, cy: number, w = 340, h = 200): Float => ({
    x: cx > window.innerWidth - w - 20 ? cx - w - 12 : cx + 14,
    y: cy > window.innerHeight - h - 20 ? cy - h - 12 : cy + 14,
  })
  const summary = (it: Item) => <>
    <div className="x-tt">{it.ev.title}</div>
    <div className="x-tm">{t.wd[weekday(it.day)]} {dayLabel(it.day)} · {timeRange(it, t)}<br />{it.venue.name} · {it.venue.city}{it.ev.price && <> · {it.ev.price}</>}
      {p.planIds.has(it.id) && <><br /><span className="x-hl">{t.inLater}</span></>}</div>
  </>
  const popItem = pop ? p.items.find(i => i.id === pop.id) : undefined

  return (
    // no drag-to-pan here: the chart always uses the native sideways scroll, so touch must keep it (x-overflow)
    <div className="x-chart x-overflow" ref={box}>
      <svg width={W * Z} height={H * Z} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.seasonLabel}>
        {/* grid */}
        {mondays.map(x => <line key={x} x1={x} x2={x} y1={TOP - 8} y2={H - 12} stroke="#e6dfcf" strokeDasharray="2 3" />)}
        {months.map(m => <g key={m.x}>
          <line x1={m.x} x2={m.x} y1={TOP - 26} y2={H - 12} stroke="#cfc6b2" />
          <text x={m.x + 5} y={TOP - 14} {...T.label} letterSpacing={TRACK}>{m.label.toUpperCase()}</text>
        </g>)}
        {!narrow && <line x1={L - 10} x2={L - 10} y1={TOP - 26} y2={H - 12} stroke={INK} />}

        {/* rows */}
        {layout.rows.map((r, i) => r.kind === 'city'
          ? <g key={i}>
              <line x1={12} x2={W - R} y1={r.y + 24} y2={r.y + 24} stroke={INK} strokeWidth={1.5} />
              <text x={12} y={r.y + 18} {...T.label} letterSpacing={TRACK}>{r.label.toUpperCase()}</text>
            </g>
          : r.kind === 'venue'
            ? <text key={i} x={12} y={r.y + 16} {...T.ui}>{r.label}</text>
            : <g key={i}>
                {r.alt && <rect x={0} y={r.y} width={W} height={r.h} fill={INK} opacity={0.035} />}
                {narrow
                  ? <text x={r.x} y={r.y + 13} {...T.title}>{fitText(r.label, W - R - r.x!, TITLE_FONT)}</text>
                  : <text x={20} y={r.y + 17} {...T.title}>{fitText(r.label, L - 40, TITLE_FONT)}</text>}
              </g>)}
        {!layout.rows.length && (
          <text x={W / 2} y={TOP + 60} textAnchor="middle" {...T.text} fill="#565247">
            {wrapText(t.seasonEmpty, Math.min(W, cw) - 40, TEXT_FONT).map((line, i) => <tspan key={i} x={Math.min(W, cw) / 2} dy={i ? 19 : 0}>{line}</tspan>)}
          </text>
        )}

        {/* runs and performances */}
        {layout.prods.map(pr => {
          const y = layout.laneY.get(pr.key)! + LANE / 2, xs = pr.dates.map(d => xd(d.day)), cat = CAT[pr.category]
          return <g key={pr.key}>
            <line x1={Math.min(...xs)} x2={Math.max(...xs)} y1={y} y2={y} stroke={INK} strokeWidth={1} opacity={0.45} />
            {pr.dates.map(it => {
              const x = xd(it.day), planned = p.planIds.has(it.id), sel = pop?.id === it.id
              // the hover tooltip is for a mouse only: phones fire hover on a long press, and a tap opens the card
              return <g key={it.id} data-mark="" style={{ cursor: 'pointer' }}
                onPointerEnter={e => { if (e.pointerType === 'mouse' && !pop) setTip({ ...near(e.clientX, e.clientY), body: summary(it) }) }}
                onPointerLeave={() => setTip(null)}
                onContextMenu={e => e.preventDefault()}
                onClick={e => { setTip(null); setPop(sel ? null : { id: it.id, ...near(e.clientX, e.clientY, 340, 370) }) }}>
                {/* click area = exactly this day, so neighbours never steal the click */}
                <rect x={x - k / 2} y={y - LANE / 2} width={k} height={LANE} fill="transparent" />
                {planned && <rect x={x - mw / 2 + 2} y={y - MARK_H / 2 + 2} width={mw} height={MARK_H} fill={RED} />}
                <rect x={x - mw / 2} y={y - MARK_H / 2} width={mw} height={MARK_H} fill={cat.color} stroke={INK} strokeWidth={planned || sel ? 2 : 1} />
              </g>
            })}
          </g>
        })}
      </svg>

      {tip && !pop && <div className="x-tip" style={{ left: tip.x, top: tip.y }}>{tip.body}</div>}
      {pop && popItem && (
        <div className="x-pop" ref={popRef} role="dialog" aria-label={popItem.ev.title} style={{ left: pop.x, top: pop.y }}>
          <button className="x-popclose" aria-label={t.close} onClick={() => setPop(null)}><X size={15} /></button>
          <div className="x-popphoto"><Picture image={popItem.ev.image} category={popItem.category} key={popItem.id} peek={popItem.ev.title} /></div>
          {summary(popItem)}
          <div className="x-popbtns">
            <button onClick={() => { p.onToggle(popItem.id); setPop(null) }}>
              <Bookmark size={15} fill={p.planIds.has(popItem.id) ? 'currentColor' : 'none'} />{p.planIds.has(popItem.id) ? t.removeShort : t.save}
            </button>
            {popItem.ev.url && <a href={popItem.ev.url} target="_blank" rel="noopener noreferrer">{t.tickets}<ArrowUpRight size={15} /></a>}
          </div>
        </div>
      )}
    </div>
  )
}
