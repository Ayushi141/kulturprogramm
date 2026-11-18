'use client'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowUpRight, Bookmark, X } from 'lucide-react'
import type { Venue } from '@/lib/types'
import { CATEGORIES } from '@/lib/types'
import { clashes, spanLabel, surelyOverlap, upcoming, type Item, type Window } from '@/lib/plan'
import { DAY0, DAY1, fmt } from '@/lib/time'
import type { Dict } from '@/lib/i18n'
import { useT } from '../i18n'
import { CAT } from './categories'
import { edgeDots, halftone, openOutline, splitPoint, wedge } from './open-end'

/* Geometry (px) */
const L = 200, R = 20, OV_Y = 38, OV_H = 44, TOP = 158, LANE = 32, BAR = 24
/**
 * The chart is drawn at a logical width of about BASE_W px and scaled up to the
 * available width, by at most MAX_ZOOM. Wide screens get bigger text and bars
 * instead of only more space between the hours. Below MIN_W it scrolls sideways.
 */
const BASE_W = 1000, MAX_ZOOM = 1.5, MIN_W = 960
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
/** Event id usable inside an SVG id and url(#…). */
const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '_')
const snap = (t: number) => Math.max(DAY0, Math.min(DAY1, Math.round(t / 30) * 30))

type OpenEnd = { xm: number; xe: number; fill: string; dots: string; outline: string }
/** Everything needed to draw one bar. `open` is set when the end was not announced. */
type BarGeo = { it: Item; y: number; x0: number; w: number; sw: number; planned: boolean; lpad: number; time: string; labelW: number; avail: number; open?: OpenEnd }

/** "overlaps A · may overlap B", or "" when nothing overlaps. */
function overlapText(it: Item, clash: Item[], t: Dict) {
  const names = (xs: Item[]) => xs.map(c => c.ev.title).join(', ')
  const sure = clash.filter(c => surelyOverlap(it, c)), maybe = clash.filter(c => !surelyOverlap(it, c))
  return [sure.length ? t.overlaps(names(sure)) : '', maybe.length ? t.mayOverlap(names(maybe)) : ''].filter(Boolean).join(' · ')
}

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
export function relation(it: Item, plan: Item[], planIds: Set<string>, nowMin: number | null, t: Dict): { text: string; strong: boolean } | null {
  const overlap = overlapText(it, clashes(it, plan), t)
  if (planIds.has(it.id)) return { text: overlap ? `${t.inYourEvening} · ${overlap}` : t.inYourEvening, strong: true }
  if (!upcoming(it, nowMin)) return { text: t.alreadyStarted, strong: false }
  if (overlap) return { text: t.clashWithPlan(overlap), strong: false }
  return null
}

export function Timeline(p: TimelineProps) {
  const t = useT()
  // prefix for SVG ids (clip paths); only characters that are safe inside url(#…)
  const uid = 'x' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const box = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [cw, setCw] = useState(1100) // CSS px available for the chart
  const [, setFontsReady] = useState(0)
  const [tip, setTip] = useState<(Float & { body: ReactNode }) | null>(null)
  // `fitted` is set once the popover has been measured and, if needed, moved on screen
  const [pop, setPop] = useState<(Float & { id: string; fitted?: boolean }) | null>(null)
  const [preview, setPreview] = useState<Window | null>(null)
  const drag = useRef<{ p0: number; moved: boolean } | null>(null)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setCw(Math.max(MIN_W, el.clientWidth)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => { document.fonts?.ready.then(() => setFontsReady(n => n + 1)) }, [])
  // a popover that would stick out of the window is centred instead
  useLayoutEffect(() => {
    const el = popRef.current
    if (!pop || pop.fitted || !el) return
    const r = el.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, m = 8
    const inside = r.left >= m && r.top >= m && r.right <= vw - m && r.bottom <= vh - m
    setPop(inside ? { ...pop, fitted: true } : { ...pop, fitted: true, x: Math.max(m, (vw - r.width) / 2), y: Math.max(m, (vh - r.height) / 2) })
  }, [pop])
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

  const Z = Math.min(MAX_ZOOM, Math.max(1, cw / BASE_W)), W = cw / Z // zoom and logical width
  const [A, B] = p.win
  const k = (W - L - R) / (B - A), ko = (W - L - R) / (DAY1 - DAY0)
  const x = (m: number) => L + (Math.max(A, Math.min(B, m)) - A) * k
  const xo = (m: number) => L + (Math.max(DAY0, Math.min(DAY1, m)) - DAY0) * ko
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

  /* Bar geometry. Memoised so hover (which re-renders for the tooltip) does not rebuild the halftone paths. */
  const popId = pop?.id
  const bars = useMemo(() => {
    const geo = new Map<string, BarGeo>()
    for (const it of layout.inWin) {
      const y = layout.ys.get(it.id)!, planned = p.planIds.has(it.id), sw = planned || popId === it.id ? 3 : 1.5
      const x0 = x(it.s) + 1, lpad = it.s < A ? 14 : 7, time = fmt(it.s)
      const labelW = width(it.ev.title, TITLE_FONT) + 7 + width(time, '10.5px ' + MONO)
      if (it.endKnown) {
        const w = Math.max(4, x(it.e) - 1 - x0)
        geo.set(it.id, { it, y, x0, w, sw, planned, lpad, time, labelW, avail: w - lpad - 8 })
        continue
      }
      // the estimated end is not clamped to the view; the drawing is clipped to the plot area instead
      const xe = Math.max(x0 + 4, L + (it.e - A) * k - 1), vx1 = W - R
      const xm = splitPoint(x0, xe, x0 + lpad + labelW + 12)
      geo.set(it.id, {
        it, y, x0, w: xe - x0, sw, planned, lpad, time, labelW, avail: xm - x0 - lpad - 12,
        open: { xm, xe, fill: halftone(xm, xe, y, BAR, L, vx1), dots: edgeDots(xm, xe, y, BAR, sw, L, vx1), outline: openOutline(x0, xm, y, BAR) },
      })
    }
    return geo
  }, [layout, A, k, W, p.planIds, popId])

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
    const r = relation(it, p.plan, p.planIds, p.nowMin, t)
    return <>
      <div className="x-tt">{it.ev.title}</div>
      <div className="x-tm">{t.cat[it.category].label} · {spanLabel(it, t)}<br />{it.venue.name} · {it.venue.city}{it.ev.price && <> · {it.ev.price}</>}
        {r && <><br /><span className={r.strong ? 'x-hl' : undefined}>{r.text}</span></>}</div>
    </>
  }

  /* Overview brush: drag draws a new window, a click moves the current one */
  // pointer position in chart units (the SVG is scaled by Z)
  const localX = (e: React.PointerEvent | React.MouseEvent) => (e.clientX - (svg.current?.getBoundingClientRect().left ?? 0)) / Z
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
    const at = Math.floor(fromXo(px) / 15) * 15
    if (at < DAY0 || at >= DAY1) return
    const on = p.overviewItems.filter(it => it.s <= at && it.e > at)
    const by = CATEGORIES.map(c => [t.cat[c].label, on.filter(i => i.category === c).length] as [string, number]).filter(r => r[1])
    setTip({ ...near(e.clientX, e.clientY, 340, 90)!, body: <><div className="x-tt">{fmt(at)}</div><div className="x-tm">{t.running(on.length, by)}<br /><span className="x-hl">{t.stripHint}</span></div></> })
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
  for (let m = Math.ceil(A / minor) * minor; m <= B; m += minor) ticks.push(m)

  /* "now" badge on the main axis: sized to its text; hour labels under it are hidden */
  const nowOnAxis = p.nowMin !== null && p.nowMin > A && p.nowMin < B
  const nowText = p.nowMin !== null ? `${t.now} ${fmt(p.nowMin)}` : ''
  const nowW = width(nowText, `bold 11px ${MONO}`) + 12, nowX = nowOnAxis ? x(p.nowMin!) : 0
  // centred on the now line, but kept inside the chart area
  const nowLeft = Math.max(L, Math.min(W - R - nowW, nowX - nowW / 2))
  const AXIS_LABEL_W = 42 // "00:00" at 11.5px bold mono, plus a little air
  const underNow = (m: number) => nowOnAxis && x(m) + AXIS_LABEL_W / 2 > nowLeft && x(m) - AXIS_LABEL_W / 2 < nowLeft + nowW
  /* labels at the chart edges start or end there instead of hanging over the divider */
  const anchorAt = (px: number, x0: number, x1: number) => (px <= x0 + 1 ? 'start' : px >= x1 - 1 ? 'end' : 'middle')

  const frame = preview ?? p.win
  const fa = xo(frame[0]), fb = xo(frame[1])
  const frameLabel = `${fmt(frame[0])}–${fmt(frame[1])}`, flw = frameLabel.length * 6.6 + 12
  const flx = Math.max(L + flw / 2, Math.min(W - R - flw / 2, (fa + fb) / 2))

  const popItem = pop ? p.items.find(i => i.id === pop.id) : undefined

  return (
    <div className="x-chart" ref={box}>
      <svg ref={svg} width={cw} height={H * Z} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.timelineLabel}>
        <defs>
          {/* open-end bars may reach past the view; they are clipped to the plot area */}
          <clipPath id={`${uid}plot`}><rect x={L} y={0} width={W - L - R} height={H} /></clipPath>
        </defs>
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
          {Array.from({ length: 9 }, (_, i) => DAY0 + i * 180).map(m => (
            <g key={m}>
              <line x1={xo(m)} x2={xo(m)} y1={OV_Y + OV_H} y2={OV_Y + OV_H + 4} stroke={INK} />
              <text x={xo(m)} y={OV_Y + OV_H + 16} textAnchor={anchorAt(xo(m), L, W - R)} fontFamily={MONO} fontSize={10.5} fill="#565247">{fmt(m)}</text>
            </g>
          ))}
          <text x={12} y={OV_Y + 14} fontFamily={MONO} fontSize={11} fontWeight={700} letterSpacing={1}>{t.wholeDay}</text>
          <text x={12} y={OV_Y + 29} fontFamily={MONO} fontSize={10.5} fill="#565247">{t.onAtOnce}</text>
          <text x={12} y={OV_Y + 43} fontFamily={MONO} fontSize={10.5} fill="#565247">{t.dragToZoom}</text>
          {p.nowMin !== null && <>
            {/* the label sits above the window frame (whose top edge is at OV_Y - 8) */}
            <line x1={xo(p.nowMin)} x2={xo(p.nowMin)} y1={OV_Y - 22} y2={OV_Y + OV_H} stroke={RED} strokeWidth={2} />
            {(() => {
              const nx = xo(p.nowMin!), right = nx > W - R - 50
              return <text x={right ? nx - 4 : nx + 4} y={OV_Y - 13} textAnchor={right ? 'end' : 'start'} fontFamily={MONO} fontSize={10.5} fontWeight={700} fill={RED}>{t.now}</text>
            })()}
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
          {!layout.rows.length && <text x={W / 2} y={TOP + 60} textAnchor="middle" fontFamily={MONO} fontSize={13} fill="#565247">{t.nothingInView}</text>}
        </g>

        {/* main axis */}
        <g>
          {ticks.map(m => {
            const major = m % labelEvery === 0
            return <g key={m}>
              <line x1={x(m)} x2={x(m)} y1={TOP - 6} y2={H - 14} stroke={major ? '#cfc6b2' : '#e6dfcf'} strokeDasharray={major ? undefined : '2 3'} />
              {major && !underNow(m) && <text x={x(m)} y={TOP - 12} textAnchor={anchorAt(x(m), L, W - R)} fontFamily={MONO} fontSize={11.5} fontWeight={700}>{fmt(m)}</text>}
            </g>
          })}
          <line x1={L - 10} x2={L - 10} y1={OV_Y} y2={H - 14} stroke={INK} />
        </g>

        {/* bars */}
        <g>
          {layout.inWin.map(it => {
            const g = bars.get(it.id)!, { y, x0, w, sw, planned, lpad, time, labelW, avail, open } = g, cat = CAT[it.category]
            const showTime = labelW <= avail
            // the › marker sits on the halftone (paper) when the solid part ends inside the view
            const moreInk = open && open.xm < W - R ? INK : cat.ink
            return (
              <g key={it.id} data-bar="" opacity={opacity(it)} style={{ cursor: 'pointer' }}
                onMouseEnter={e => { if (!pop) setTip({ ...near(e.clientX, e.clientY)!, body: itemSummary(it) }) }}
                onMouseMove={e => { if (!pop) setTip({ ...near(e.clientX, e.clientY)!, body: itemSummary(it) }) }}
                onMouseLeave={() => setTip(null)}
                onClick={e => { setTip(null); setPop(pop?.id === it.id ? null : { id: it.id, ...near(e.clientX, e.clientY, 340, 230)! }) }}>
                {open ? (
                  <g clipPath={`url(#${uid}plot)`}>
                    {planned && <path d={wedge(x0, open.xm, open.xe, y, BAR)} transform="translate(4,4)" fill={RED} />}
                    {/* hit area: the gaps between dots still belong to the bar */}
                    <rect x={x0} y={y} width={w} height={BAR} fill="transparent" />
                    {open.fill && <>
                      <clipPath id={`${uid}b${safeId(it.id)}`}><rect x={open.xm} y={y} width={open.xe - open.xm} height={BAR} /></clipPath>
                      <rect x={open.xm} y={y} width={open.xe - open.xm} height={BAR} fill={CARD} />
                    </>}
                    {/* the solid part reaches 1 px under the full-size dots, so anti-aliasing shows no seam */}
                    <rect x={x0} y={y} width={Math.max(0, Math.min(open.xm + 1, open.xe) - x0)} height={BAR} fill={cat.color} />
                    {open.fill && <path d={open.fill} fill={cat.color} clipPath={`url(#${uid}b${safeId(it.id)})`} />}
                    <path d={open.outline} fill="none" stroke={INK} strokeWidth={sw} />
                    {open.dots && <path d={open.dots} fill={INK} />}
                  </g>
                ) : <>
                  {planned && <rect x={x0 + 4} y={y + 4} width={w} height={BAR} fill={RED} />}
                  <rect x={x0} y={y} width={w} height={BAR} fill={cat.color} stroke={INK} strokeWidth={sw} />
                </>}
                {it.s < A && <text x={x0 + 4} y={y + 17} fontFamily={MONO} fontSize={12} fontWeight={700} fill={cat.ink}>‹</text>}
                {it.e > B && <text x={(open ? W - R : x0 + w) - 4} y={y + 17} textAnchor="end" fontFamily={MONO} fontSize={12} fontWeight={700} fill={moreInk}>›</text>}
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

        {/* the planned evening: thick line under each pick. With an open end it is a wedge
            that tapers to a point, and there is no end dot. */}
        <g pointerEvents="none">
          {p.plan.filter(s => layout.ys.has(s.id)).map(s => {
            const yb = layout.ys.get(s.id)! + BAR + 0.5, open = bars.get(s.id)?.open
            return <g key={s.id}>
              {open
                ? <path d={wedge(x(s.s), open.xm, open.xe, yb - 2.5, 5)} fill={INK} clipPath={`url(#${uid}plot)`} />
                : <line x1={x(s.s)} x2={x(s.e)} y1={yb} y2={yb} stroke={INK} strokeWidth={5} />}
              <circle cx={x(s.s)} cy={yb} r={4.5} fill={INK} />
              {!open && <circle cx={x(s.e)} cy={yb} r={4.5} fill={PAPER} stroke={INK} strokeWidth={2} />}
            </g>
          })}
        </g>

        {/* past part of today */}
        {p.nowMin !== null && p.nowMin > A && (
          <g pointerEvents="none">
            <rect x={L} y={TOP - 4} width={x(p.nowMin) - L} height={H - TOP - 10} fill={PAPER} opacity={0.6} />
            {p.nowMin < B && <>
              <line x1={x(p.nowMin)} x2={x(p.nowMin)} y1={TOP - 4} y2={H - 14} stroke={RED} strokeWidth={2} />
              <rect x={nowLeft} y={TOP - 27} width={nowW} height={17} fill={RED} />
              <text x={nowLeft + nowW / 2} y={TOP - 15} textAnchor="middle" fontFamily={MONO} fontSize={11} fontWeight={700} fill="#fff">{nowText}</text>
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
          <button className="x-popclose" aria-label={t.close} onClick={() => setPop(null)}><X size={15} /></button>
          {itemSummary(popItem)}
          <div className="x-popbtns">
            <button onClick={() => { p.onToggle(popItem.id); setPop(null) }}>
              <Bookmark size={15} fill={p.planIds.has(popItem.id) ? 'currentColor' : 'none'} />{p.planIds.has(popItem.id) ? t.removeShort : t.add}
            </button>
            {popItem.ev.url && <a href={popItem.ev.url} target="_blank" rel="noopener noreferrer">{t.tickets}<ArrowUpRight size={15} /></a>}
          </div>
        </div>
      )}
    </div>
  )
}
