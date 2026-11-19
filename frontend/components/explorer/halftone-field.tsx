'use client'
import { useLayoutEffect, useRef, useState } from 'react'

/**
 * A halftone field for the hero: yellow dots on the same rotated 30° screen as
 * the open-end bars, full size in the top-right corner and shrinking to
 * nothing towards the middle of the content (left) and the bottom. Purely decorative.
 * All dots go into one path, like the open-end bars.
 */
const CELL = 13
const ANGLE = (30 * Math.PI) / 180
const COS = Math.cos(ANGLE), SIN = Math.sin(ANGLE)
const n = (v: number) => Math.round(v * 10) / 10

function dots(w: number, h: number) {
  const out: string[] = []
  // the screen is rotated, so cover the box with grid coordinates from all four corners
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
  for (const [px, py] of [[0, 0], [w, 0], [0, h], [w, h]]) {
    const u = (px * COS + py * SIN) / CELL, v = (-px * SIN + py * COS) / CELL
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v)
  }
  for (let u = Math.floor(u0); u <= Math.ceil(u1); u++) {
    for (let v = Math.floor(v0); v <= Math.ceil(v1); v++) {
      const cx = (u * COS - v * SIN) * CELL, cy = (u * SIN + v * COS) * CELL
      if (cx < -CELL || cx > w + CELL || cy < -CELL || cy > h + CELL) continue
      // 0 at the left edge of the field, 1 at the right edge; weaker towards the bottom
      const tx = Math.min(1, Math.max(0, cx / w)), ty = 1 - 0.55 * Math.min(1, Math.max(0, cy / h))
      const r = 0.62 * CELL * (tx * ty) ** 1.3
      if (r < 0.45) continue
      out.push(`M${n(cx - r)},${n(cy)}a${n(r)},${n(r)} 0 1,0 ${n(2 * r)},0a${n(r)},${n(r)} 0 1,0 ${n(-2 * r)},0`)
    }
  }
  return out.join('')
}

export function HalftoneField() {
  const box = useRef<HTMLDivElement>(null)
  const [d, setD] = useState<{ w: number; h: number; path: string } | null>(null)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const w = Math.round(el.clientWidth), h = Math.round(el.clientHeight)
      setD(prev => (prev && prev.w === w && prev.h === h ? prev : { w, h, path: dots(w, h) }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div className="x-halftone" ref={box} aria-hidden="true">
      {d && <svg width={d.w} height={d.h} viewBox={`0 0 ${d.w} ${d.h}`}><path d={d.path} fill="var(--yellow)" /></svg>}
    </div>
  )
}
