import type { Category } from '@/lib/types'

/**
 * Every colour of the site, in one place. Change a colour here only.
 * - CSS reads them as custom properties (`var(--ink)`, `var(--cat-theatre)`,
 *   `var(--cat-dark-theatre)`): `colorVariables()` sets them on <html> in the root layout.
 * - SVG drawings (timelines, mascots), the share preview image and the web app manifest
 *   import the constants, because they are drawn outside the page's CSS.
 */
export const PALETTE = {
  paper: '#f7f3e8',
  ink: '#201f1a',
  blue: '#2646c8',
  red: '#df3929',
  yellow: '#ffde5b',
  grey: '#565247', // secondary text: never smaller or lighter, only grey
  card: '#fbf8f1', // the timeline's chart card
  rule: '#cfc6b2', // timeline grid: month and day lines
  ruleFaint: '#e6dfcf', // timeline grid: minor lines
  redDeep: '#b8281c', // the mascots' red, a step darker than `red`
  cyan: '#00a0e3', // the print colour bar (with magenta, yellow, ink, red, blue, paper)
  magenta: '#e4007c',
}

/**
 * Category colours, validated as a set on the chart card (`PALETTE.card`), all pairs
 * (any two can sit side by side): protan/deutan ΔE ≥ 16.8, normal ΔE ≥ 20.9
 * (OKLab ×100). `ink` (bar titles) has ≥ 4.5:1 on its colour. Opera and dance
 * are light (2.1:1 on the card), so their bars always carry visible titles.
 * Theatre and movies are the brand red and blue (red one step darker for its
 * white titles). Labels are in lib/i18n.ts.
 */
export const CAT: Record<Category, { color: string; ink: string }> = {
  theatre: { color: '#da3626', ink: '#ffffff' },
  opera: { color: '#fa960b', ink: PALETTE.ink },
  dance: { color: '#25c2c2', ink: PALETTE.ink },
  concerts: { color: '#7f2866', ink: '#ffffff' },
  movies: { color: PALETTE.blue, ink: '#ffffff' },
}

/** Darker category colours for white text on a solid block (share preview without a photo,
    the image frame while a photo loads). */
export const CAT_DARK: Record<Category, string> = {
  theatre: '#ab382a',
  opera: '#8f5400',
  dance: '#11706f',
  concerts: '#7f2866',
  movies: PALETTE.blue,
}

/** The colours as CSS custom properties, for the `style` of <html>. */
export function colorVariables(): Record<string, string> {
  return {
    ...Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [`--${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}`, v])),
    ...Object.fromEntries(Object.entries(CAT).map(([k, v]) => [`--cat-${k}`, v.color])),
    ...Object.fromEntries(Object.entries(CAT_DARK).map(([k, v]) => [`--cat-dark-${k}`, v])),
  }
}
