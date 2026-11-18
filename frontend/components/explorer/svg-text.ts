/**
 * Text in the SVG charts (day timeline and season timeline): the type styles
 * and canvas-based measurement, since SVG has no text-overflow.
 */

export const MONO = "'Courier New', monospace"
export const SANS = 'Arial, Helvetica, sans-serif'
export const DISPLAY = 'Poster, Impact, sans-serif'

/**
 * Type styles: the same system as the page (see "Type system" in explorer.css).
 * Sizes are logical px; a chart scales them by its zoom Z, as the page scales by --zs.
 */
export const T = {
  label: { fontFamily: MONO, fontSize: 11, fontWeight: 700 }, // labels, axis times, badges
  mark: { fontFamily: MONO, fontSize: 11 }, // small marks: overview ticks, times in bars
  text: { fontFamily: MONO, fontSize: 12 }, // sentences
  ui: { fontFamily: SANS, fontSize: 13, fontWeight: 700 }, // venue names
  title: { fontFamily: DISPLAY, fontSize: 15 }, // bar and production titles
} as const
/** Tracking for uppercase labels (.08em). */
export const TRACK = 0.88
/** The same styles as canvas fonts, for text measurement. */
export const TITLE_FONT = `15px ${DISPLAY}`, MARK_FONT = `11px ${MONO}`, LABEL_FONT = `bold 11px ${MONO}`,
  UI_FONT = `bold 13px ${SANS}`, TEXT_FONT = `12px ${MONO}`

let ctx: CanvasRenderingContext2D | null = null
/** Width of `s` in px when drawn in `font`. */
export function width(s: string, font: string) {
  if (typeof document === 'undefined') return s.length * 7
  ctx ??= document.createElement('canvas').getContext('2d')
  if (!ctx) return s.length * 7
  ctx.font = font
  return ctx.measureText(s).width
}

/** `s`, shortened with "…" to at most `max` px. */
export function fitText(s: string, max: number, font: string) {
  if (width(s, font) <= max) return s
  let t = s
  while (t.length > 1 && width(t + '…', font) > max) t = t.slice(0, -1)
  return t.trimEnd() + '…'
}

/** Splits text into lines no wider than `max` px. */
export function wrapText(s: string, max: number, font: string) {
  const lines: string[] = []
  let line = ''
  for (const word of s.split(' ')) {
    const next = line ? line + ' ' + word : word
    if (line && width(next, font) > max) { lines.push(line); line = word } else line = next
  }
  return line ? [...lines, line] : lines
}
