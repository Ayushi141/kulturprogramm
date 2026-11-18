/**
 * Geometry for a bar whose end was not announced ("open end").
 *
 * The bar is solid category colour from x0 to xm. From xm to xe (the end
 * estimated for layout) it turns into a halftone screen in the category colour
 * that shrinks to specks, and its top and bottom outlines dissolve into ink
 * dots at the same rate. There is no right edge: nothing claims an end time.
 *
 * All functions return SVG path data. Every dot of one layer goes into one
 * path, so a bar costs a handful of DOM nodes however many dots it has.
 */

/** Halftone grid spacing in px. */
export const CELL = 5
/** Screen angle. 0°, 45° and 90° read as rows parallel to the bar edges. */
const ANGLE = (30 * Math.PI) / 180
const COS = Math.cos(ANGLE), SIN = Math.sin(ANGLE)

/** One decimal (0.1 px) keeps the path strings short; finer steps are not visible. */
const n = (v: number) => Math.round(v * 10) / 10

/** A full circle as two arcs. */
const circle = (cx: number, cy: number, r: number) =>
  `M${n(cx - r)},${n(cy)}a${n(r)},${n(r)} 0 1,0 ${n(2 * r)},0a${n(r)},${n(r)} 0 1,0 ${n(-2 * r)},0`

/** Size factor: 1 at xm, falling to 0 at xe. */
function size(cx: number, xm: number, xe: number) {
  const t = Math.min(1, Math.max(0, (cx - xm) / (xe - xm)))
  return (1 - t) ** 0.8
}

/**
 * Where the solid part ends. The label (ending at `textEnd`) always sits on
 * solid colour; at least the last 24 px are halftone.
 */
export function splitPoint(x0: number, xe: number, textEnd: number) {
  const w = xe - x0
  return Math.max(x0, Math.min(xe - 24, Math.max(x0 + 0.4 * w, textEnd)))
}

/**
 * Halftone dots between xm and xe over the bar box (y … y + h). Only dots
 * that can show inside [vx0, vx1] (the visible plot area) are emitted. The
 * caller clips the path to the bar box.
 */
export function halftone(xm: number, xe: number, y: number, h: number, vx0: number, vx1: number) {
  const bx0 = Math.max(xm, vx0) - CELL, bx1 = Math.min(xe, vx1) + CELL
  const by0 = y - CELL, by1 = y + h + CELL
  if (bx1 - bx0 <= 2 * CELL || xe <= xm) return ''
  // grid coordinates (u, v) of the box corners, relative to the origin (xm, y)
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
  for (const px of [bx0, bx1]) for (const py of [by0, by1]) {
    const dx = px - xm, dy = py - y
    const u = (dx * COS + dy * SIN) / CELL, v = (-dx * SIN + dy * COS) / CELL
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v)
  }
  const out: string[] = []
  for (let u = Math.floor(u0); u <= Math.ceil(u1); u++) {
    for (let v = Math.floor(v0); v <= Math.ceil(v1); v++) {
      const cx = xm + (u * COS - v * SIN) * CELL, cy = y + (u * SIN + v * COS) * CELL
      // at xm the dots overlap into a solid area, so there is no seam
      const r = 0.4 + size(cx, xm, xe) * (0.72 * CELL - 0.4)
      // skip dots that lie entirely outside the clipped bar box or the view
      if (cx + r < Math.max(xm, vx0) || cx - r > Math.min(xe, vx1) || cy + r < y || cy - r > y + h) continue
      out.push(circle(cx, cy, r))
    }
  }
  return out.join('')
}

/**
 * The top and bottom outlines from xm to xe as rows of ink dots that shrink
 * with the halftone. `sw` is the outline width of the solid part.
 */
export function edgeDots(xm: number, xe: number, y: number, h: number, sw: number, vx0: number, vx1: number) {
  const r0 = sw / 2 + 0.15, step = 1.7 * r0, out: string[] = []
  for (let cx = xm; cx <= xe; cx += step) {
    const r = r0 * size(cx, xm, xe)
    if (r < 0.2) break // radii only shrink from here on
    if (cx < vx0 - r || cx > vx1 + r) continue
    out.push(circle(cx, y, r), circle(cx, y + h, r))
  }
  return out.join('')
}

/** Left, top and bottom edges of the solid part. No right edge. */
export const openOutline = (x0: number, xm: number, y: number, h: number) => `M${n(xm)},${n(y)}H${n(x0)}V${n(y + h)}H${n(xm)}`

/** Full height from x0 to xm, then tapering to a point at xe (mid-height). */
export const wedge = (x0: number, xm: number, xe: number, y: number, h: number) =>
  `M${n(x0)},${n(y)}H${n(xm)}L${n(xe)},${n(y + h / 2)}L${n(xm)},${n(y + h)}H${n(x0)}Z`
