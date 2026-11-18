'use client'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowUpRight, Bookmark, X } from 'lucide-react'
import type { Venue } from '@/lib/types'
import { CATEGORIES } from '@/lib/types'
import { clashes, upcoming, type Item, type Window } from '@/lib/plan'
import { DAY0, DAY1, dur, fmt } from '@/lib/time'
import { CAT } from './categories'

/* Geometry (px) */
const L = 200, R = 20, OV_Y = 38, OV_H = 44, TOP = 158, LANE = 32, BAR = 24
const INK = '#201f1a', PAPER = '#f7f3e8', CARD = '#fbf8f1', RED = '#df3929'
const MONO = "'Courier New', monospace"
const TITLE_FONT = '14.5px Poster, Impact, sans-serif'

/* Text fitting with canvas measurement (SVG has no text-overflow). */
let ctx: CanvasRenderingContext2D | null = null
function width(s: string, font: string) {
  if (typeof document === 'undefined') return s.length * 7
  ctx ??= document.createElement('canvas').getContext('2d')
  if (!ctx) return s.length * 7
  ctx.font = font
  return ctx.measureText(s).width
}
function fitText(s: string, max: number, font: string) {
  if (width(s, font) <= max) return s
  let t = s
  while (t.length > 1 && width(t + '…', font) > max) t = t.slice(0, -1)
  return t.trimEnd() + '…'
}
const snap = (t: number) => Math.max(DAY0, Math.min(DAY1, Math.round(t / 30) * 30))

type Row = { kind: 'city' | 'venue'; label: string; y: number; h: number; alt: boolean }
type Float = { x: number; y: number } | null

export type TimelineProps = {
  venues: Venue[]
  /** Items of the selected day that pass the category filter, plus planned items. */
  items: Item[]
  /** Items for the whole-day overview strip (category filter applied). */
  overviewItems: Item[]
  /** The part of the day the main timeline shows. */
  win: Window
  /** Minutes now, on today; null on other days. */
  nowMin: number | null
  /** Picked items of the day, in time order. */
  plan: Item[]
  planIds: Set<string>
  onToggle: (id: string) => void
  onWindow: (w: Window) => void
}

/** One line that says how an item relates to the picks of its day, or null if there is nothing to say. */
export function relation(it: Item, plan: Item[], planIds: Set<string>, nowMin: number | null): { text: string; strong: boolean } | null {
  const clash = clashes(it, plan)
  if (planIds.has(it.id)) return { text: clash.length ? `In your evening · overlaps ${clash.map(c => c.ev.title).join(', ')}` : 'In your evening', strong: true }
  if (!upcoming(it, nowMin)) return { text: 'Already started', strong: false }
  if (clash.length) return { text: `Overlaps ${clash.map(c => c.ev.title).join(', ')} in your evening`, strong: false }
  return null
}

export function Timeline(p: TimelineProps) {
  const box = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(1100)
  const [, setFontsReady] = useState(0)
  const [tip, setTip] = useState<(Float & { body: ReactNode }) | null>(null)
  const [pop, setPop] = useState<(Float & { id: string }) | null>(null)
  const [preview, setPreview] = useState<Window | null>(null)
  const drag = useRef<{ p0: number; moved: boolean } | null>(null)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(Math.max(960, el.clientWidth)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => { document.fonts?.ready.then(() => setFontsReady(n => n + 1)) }, [])
  // close the detail popover on outside click, Escape or scroll
  useEffect(() => {
    if (!pop) return
    const down = (e: PointerEvent) => { if (!popRef.current?.contains(e.target as Node) && !(e.target as Element).closest?.('[data-bar]')) setPop(null) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setPop(null) }
    // close only on a real scroll; small or late scroll events (e.g. after a click) keep it open
    const b = box.current, y0 = window.scrollY, x0 = b?.scrollLeft ?? 0
    const close = () => { if (Math.abs(window.scrollY - y0) > 60 || Math.abs((b?.scrollLeft ?? 0) - x0) > 60) setPop(null) }
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key)
    window.addEventListener('scroll', close, { passive: true })
    b?.addEventListener('scroll', close, { passive: true })
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); window.removeEventListener('scroll', close); b?.removeEventListener('scroll', close) }
  }, [pop])

  const [A, B] = p.win
  const k = (W - L - R) / (B - A), ko = (W - L - R) / (DAY1 - DAY0)
  const x = (t: number) => L + (Math.max(A, Math.min(B, t)) - A) * k
  const xo = (t: number) => L + (Math.max(DAY0, Math.min(DAY1, t)) - DAY0) * ko
  const fromXo = (px: number) => DAY0 + (px - L) / ko

  /* Rows: venues grouped by city, overlapping items packed into lanes */
  const layout = useMemo(() => {
    const inWin = p.items.filter(it => it.s < p.win[1] && it.e > p.win[0])
    const cities: string[] = []
    p.venues.forEach(v => { if (!cities.includes(v.city)) cities.push(v.city) })
    const rows: Row[] = [], ys = new Map<string, number>()
    let y = TOP
    for (const city of cities) {
      const vs = p.venues.filter(v => v.city === city)
        .map(v => ({ v, its: inWin.filter(i => i.venue.id === v.id).sort((a, b) => a.s - b.s) }))
        .filter(r => r.its.length)
      if (!vs.length) continue
      rows.push({ kind: 'city', label: city, y, h: 30, alt: false }); y += 30
      vs.forEach(({ v, its }, i) => {
        const lanes: number[] = []
        its.forEach(it => {
          let li = lanes.findIndex(end => end <= it.s)
          if (li < 0) { li = lanes.length; lanes.push(0) }
          lanes[li] = it.e; ys.set(it.id, y + 7 + li * LANE)
        })
        const h = lanes.length * LANE + 8
        rows.push({ kind: 'venue', label: v.name, y, h, alt: i % 2 === 1 }); y += h
      })
      y += 6
    }
    return { rows, ys, inWin, H: Math.max(y + 24, TOP + 120) }
  }, [p.items, p.venues, p.win])
  const H = layout.H

  /* Whole-day overview: stacked counts per 15 minutes */
  const overview = useMemo(() => {
    const step = 15, cols: { t: number; cnt: Record<string, number> }[] = []
    let max = 1
    for (let t = DAY0; t < DAY1; t += step) {
      const mid = t + step / 2, cnt: Record<string, number> = {}
      let tot = 0
      for (const it of p.overviewItems) if (it.s <= mid && it.e > mid) { cnt[it.category] = (cnt[it.category] ?? 0) + 1; tot++ }
      cols.push({ t, cnt }); max = Math.max(max, tot)
    }
    return { cols, max, step }
  }, [p.overviewItems])

  const opacity = (it: Item) => (upcoming(it, p.nowMin) || p.planIds.has(it.id) ? 1 : 0.22)

  const near = (cx: number, cy: number, w = 340, h = 190): Float => ({
    x: cx > window.innerWidth - w - 20 ? cx - w - 12 : cx + 14,
    y: cy > window.innerHeight - h - 20 ? cy - h - 12 : cy + 14,
  })
  const itemSummary = (it: Item) => {
    const r = relation(it, p.plan, p.planIds, p.nowMin)
    return <>
      <div className="x-tt">{it.ev.title}</div>
      <div className="x-tm">{CAT[it.category].label} · {fmt(it.s)}–{fmt(it.e)} · {dur(it.e - it.s)}<br />{it.venue.name} · {it.venue.city}{it.ev.price && <> · {it.ev.price}</>}
        {r && <><br /><span className={r.strong ? 'x-hl' : undefined}>{r.text}</span></>}</div>
    </>
  }

  /* Overview brush: drag draws a new window, a click moves the current one */
  const localX = (e: React.PointerEvent | React.MouseEvent) => e.clientX - (svg.current?.getBoundingClientRect().left ?? 0)
  const onDown = (e: React.PointerEvent) => { drag.current = { p0: localX(e), moved: false }; (e.target as Element).setPointerCapture(e.pointerId); setTip(null); setPop(null) }
  const onMove = (e: React.PointerEvent) => {
    const px = localX(e), d = drag.current
    if (d) {
      if (Math.abs(px - d.p0) > 5) {
        d.moved = true
        let a = snap(fromXo(Math.min(px, d.p0))), b = snap(fromXo(Math.max(px, d.p0)))
        if (b - a < 60) { b = Math.min(DAY1, a + 60); a = b - 60 }
        setPreview([a, b])
      }
      return
    }
    const t = Math.floor(fromXo(px) / 15) * 15
    if (t < DAY0 || t >= DAY1) return
    const on = p.overviewItems.filter(it => it.s <= t && it.e > t)
    const by = CATEGORIES.map(c => [c, on.filter(i => i.category === c).length] as const).filter(r => r[1])
    setTip({ ...near(e.clientX, e.clientY, 340, 90)!, body: <><div className="x-tt">{fmt(t)}</div><div className="x-tm">{on.length} running{by.length ? ': ' + by.map(([c, n]) => `${n} ${CAT[c].label.toLowerCase()}`).join(', ') : ''}<br /><span className="x-hl">click to move the view here · drag to zoom to a range</span></div></> })
  }
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.moved && preview) p.onWindow(preview)
    else {
      const w = B - A
      let a = snap(fromXo(localX(e)) - w / 2)
      a = Math.max(DAY0, Math.min(DAY1 - w, a))
      p.onWindow([a, a + w])
    }
    setPreview(null)
  }

  /* Axis ticks adapt to zoom */
  const pxPerH = 60 * k
  const labelEvery = pxPerH >= 46 ? 60 : pxPerH >= 23 ? 120 : 180
  const minor = pxPerH >= 90 ? 30 : 60
  const ticks: number[] = []
  for (let t = Math.ceil(A / minor) * minor; t <= B; t += minor) ticks.push(t)

  const frame = preview ?? p.win
  const fa = xo(frame[0]), fb = xo(frame[1])
  const frameLabel = `${fmt(frame[0])}–${fmt(frame[1])}`, flw = frameLabel.length * 6.6 + 12
  const flx = Math.max(L + flw / 2, Math.min(W - R - flw / 2, (fa + fb) / 2))

  const popItem = pop ? p.items.find(i => i.id === pop.id) : undefined

  return (
    <div className="x-chart" ref={box}>
      <svg ref={svg} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Timeline of events by venue">
        {/* overview */}
        <g>
          {overview.cols.map(col => {
            let y = OV_Y + OV_H
            return CATEGORIES.map(c => {
              const h = (col.cnt[c] ?? 0) * OV_H / overview.max
              if (!h) return null
              y -= h
              return <rect key={col.t + c} x={xo(col.t) + 0.3} y={y} width={Math.max(1, overview.step * ko - 0.8)} height={Math.max(0, h - 0.8)} fill={CAT[c].color} />
            })
          })}
          <line x1={L} x2={W - R} y1={OV_Y + OV_H + 0.5} y2={OV_Y + OV_H + 0.5} stroke={INK} strokeWidth={1.5} />
          {Array.from({ length: 9 }, (_, i) => DAY0 + i * 180).map(t => (
            <g key={t}>
              <line x1={xo(t)} x2={xo(t)} y1={OV_Y + OV_H} y2={OV_Y + OV_H + 4} stroke={INK} />
              <text x={xo(t)} y={OV_Y + OV_H + 16} textAnchor="middle" fontFamily={MONO} fontSize={10.5} fill="#565247">{fmt(t)}</text>
            </g>
          ))}
          <text x={12} y={OV_Y + 14} fontFamily={MONO} fontSize={11} fontWeight={700} letterSpacing={1}>WHOLE DAY</text>
          <text x={12} y={OV_Y + 29} fontFamily={MONO} fontSize={10.5} fill="#565247">things on at once</text>
          <text x={12} y={OV_Y + 43} fontFamily={MONO} fontSize={10.5} fill="#565247">drag to zoom</text>
          {p.nowMin !== null && <>
            <line x1={xo(p.nowMin)} x2={xo(p.nowMin)} y1={OV_Y - 6} y2={OV_Y + OV_H} stroke={RED} strokeWidth={2} />
            <text x={xo(p.nowMin) + 4} y={OV_Y - 2} fontFamily={MONO} fontSize={10.5} fontWeight={700} fill={RED}>now</text>
          </>}
          <rect x={L} y={OV_Y - 8} width={Math.max(0, fa - L)} height={OV_H + 8} fill={CARD} opacity={0.72} />
          <rect x={fb} y={OV_Y - 8} width={Math.max(0, W - R - fb)} height={OV_H + 8} fill={CARD} opacity={0.72} />
          <rect x={fa} y={OV_Y - 8} width={fb - fa} height={OV_H + 8} fill="none" stroke={RED} strokeWidth={2.5} />
          <path d={`M${fa},${OV_Y + OV_H} L${L},${TOP - 30} M${fb},${OV_Y + OV_H} L${W - R},${TOP - 30}`} stroke={RED} strokeWidth={1} opacity={0.55} fill="none" />
          <rect x={flx - flw / 2} y={OV_Y + OV_H + 21} width={flw} height={17} fill={RED} />
          <text x={flx} y={OV_Y + OV_H + 33} textAnchor="middle" fontFamily={MONO} fontSize={11} fontWeight={700} fill="#fff">{frameLabel}</text>
        </g>

        {/* rows */}
        <g>
          {layout.rows.map((r, i) => r.kind === 'city'
            ? <g key={i}>
                <line x1={12} x2={W - R} y1={r.y + 24} y2={r.y + 24} stroke={INK} strokeWidth={1.5} />
                <text x={12} y={r.y + 18} fontFamily={MONO} fontSize={11} fontWeight={700} letterSpacing={1}>{r.label.toUpperCase()}</text>
              </g>
            : <g key={i}>
                {r.alt && <rect x={0} y={r.y} width={W} height={r.h} fill={INK} opacity={0.035} />}
                <text x={12} y={r.y + 7 + BAR / 2 + 4.5} fontFamily="Arial, Helvetica, sans-serif" fontSize={13} fontWeight={700}>{fitText(r.label, L - 30, 'bold 13px Arial')}</text>
              </g>)}
          {!layout.rows.length && <text x={W / 2} y={TOP + 60} textAnchor="middle" fontFamily={MONO} fontSize={13} fill="#565247">Nothing on in this part of the day — move the view on the whole-day strip above.</text>}
        </g>

        {/* main axis */}
        <g>
          {ticks.map(t => {
            const major = t % labelEvery === 0
            return <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={TOP - 6} y2={H - 14} stroke={major ? '#cfc6b2' : '#e6dfcf'} strokeDasharray={major ? undefined : '2 3'} />
              {major && <text x={x(t)} y={TOP - 12} textAnchor="middle" fontFamily={MONO} fontSize={11.5} fontWeight={700}>{fmt(t)}</text>}
            </g>
          })}
          <line x1={L - 10} x2={L - 10} y1={OV_Y} y2={H - 14} stroke={INK} />
        </g>

        {/* links between consecutive picks; red when they overlap */}
        <g pointerEvents="none">
          {p.plan.filter(s => layout.ys.has(s.id)).map((s, i, arr) => {
            const nx = arr[i + 1]
            if (!nx) return null
            const yb = layout.ys.get(s.id)! + BAR + 0.5, y2 = layout.ys.get(nx.id)! + BAR + 0.5
            const x1 = x(s.e), x2 = x(nx.s), dx = Math.max(24, (x2 - x1) / 2)
            const ok = nx.s >= s.e
            return <path key={s.id} d={`M${x1},${yb} C${x1 + dx},${yb} ${x2 - dx},${y2} ${x2},${y2}`} fill="none" stroke={ok ? INK : RED} strokeWidth={2.5} strokeDasharray="5 4" />
          })}
        </g>

        {/* bars */}
        <g>
          {layout.inWin.map(it => {
            const y = layout.ys.get(it.id)!, cat = CAT[it.category], planned = p.planIds.has(it.id), selected = pop?.id === it.id
            const x0 = x(it.s) + 1, w = Math.max(4, x(it.e) - 1 - x0)
            const lpad = it.s < A ? 14 : 7, avail = w - lpad - 8, time = fmt(it.s)
            const showTime = width(it.ev.title, TITLE_FONT) + width(time, '10.5px ' + MONO) + 10 <= avail
            return (
              <g key={it.id} data-bar="" opacity={opacity(it)} style={{ cursor: 'pointer' }}
                onMouseEnter={e => { if (!pop) setTip({ ...near(e.clientX, e.clientY)!, body: itemSummary(it) }) }}
                onMouseMove={e => { if (!pop) setTip({ ...near(e.clientX, e.clientY)!, body: itemSummary(it) }) }}
                onMouseLeave={() => setTip(null)}
                onClick={e => { setTip(null); setPop(pop?.id === it.id ? null : { id: it.id, ...near(e.clientX, e.clientY, 340, 230)! }) }}>
                {planned && <rect x={x0 + 4} y={y + 4} width={w} height={BAR} fill={RED} />}
                <rect x={x0} y={y} width={w} height={BAR} fill={cat.color} stroke={INK} strokeWidth={planned || selected ? 3 : 1.5} />
                {it.s < A && <text x={x0 + 4} y={y + 17} fontFamily={MONO} fontSize={12} fontWeight={700} fill={cat.ink}>‹</text>}
                {it.e > B && <text x={x0 + w - 4} y={y + 17} textAnchor="end" fontFamily={MONO} fontSize={12} fontWeight={700} fill={cat.ink}>›</text>}
                {avail > 16 && (
                  <text x={x0 + lpad} y={y + 17.5} fontFamily="Poster, Impact, sans-serif" fontSize={14.5} fill={cat.ink} letterSpacing={0.2}>
                    {showTime ? it.ev.title : fitText(it.ev.title, avail, TITLE_FONT)}
                    {showTime && <tspan fontFamily={MONO} fontSize={10.5} dx={7} opacity={0.85}>{time}</tspan>}
                  </text>
                )}
              </g>
            )
          })}
        </g>

        {/* the planned evening: thick line under each pick (links between picks are drawn behind the bars) */}
        <g pointerEvents="none">
          {p.plan.filter(s => layout.ys.has(s.id)).map(s => {
            const yb = layout.ys.get(s.id)! + BAR + 0.5
            return <g key={s.id}>
              <line x1={x(s.s)} x2={x(s.e)} y1={yb} y2={yb} stroke={INK} strokeWidth={5} />
              <circle cx={x(s.s)} cy={yb} r={4.5} fill={INK} />
              <circle cx={x(s.e)} cy={yb} r={4.5} fill={PAPER} stroke={INK} strokeWidth={2} />
            </g>
          })}
        </g>

        {/* past part of today */}
        {p.nowMin !== null && p.nowMin > A && (
          <g pointerEvents="none">
            <rect x={L} y={TOP - 4} width={x(p.nowMin) - L} height={H - TOP - 10} fill={PAPER} opacity={0.6} />
            {p.nowMin < B && <>
              <line x1={x(p.nowMin)} x2={x(p.nowMin)} y1={TOP - 4} y2={H - 14} stroke={RED} strokeWidth={2} />
              <rect x={x(p.nowMin) - 32} y={TOP - 27} width={64} height={17} fill={RED} />
              <text x={x(p.nowMin)} y={TOP - 15} textAnchor="middle" fontFamily={MONO} fontSize={11} fontWeight={700} fill="#fff">now {fmt(p.nowMin)}</text>
            </>}
          </g>
        )}

        {/* brush hit area on the overview (on top, so it gets the pointer) */}
        <rect x={L} y={OV_Y - 12} width={W - L - R} height={OV_H + 32} fill="transparent" style={{ cursor: 'ew-resize', touchAction: 'none' }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onMouseLeave={() => { if (!drag.current) setTip(null) }} />
      </svg>

      {tip && !pop && <div className="x-tip" style={{ left: tip.x, top: tip.y }}>{tip.body}</div>}
      {pop && popItem && (
        <div className="x-pop" ref={popRef} role="dialog" aria-label={popItem.ev.title} style={{ left: pop.x, top: pop.y }}>
          <button className="x-popclose" aria-label="Close" onClick={() => setPop(null)}><X size={15} /></button>
          {itemSummary(popItem)}
          <div className="x-popbtns">
            <button onClick={() => { p.onToggle(popItem.id); setPop(null) }}>
              <Bookmark size={15} fill={p.planIds.has(popItem.id) ? 'currentColor' : 'none'} />{p.planIds.has(popItem.id) ? 'Remove' : 'Add to my evening'}
            </button>
            {popItem.ev.url && <a href={popItem.ev.url} target="_blank" rel="noopener noreferrer">Tickets &amp; details<ArrowUpRight size={15} /></a>}
          </div>
        </div>
      )}
    </div>
  )
}
