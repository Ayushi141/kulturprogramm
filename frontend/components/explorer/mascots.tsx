/**
 * The narrators of the context drawer, as drawn on the design canvas: the Souffleur in his
 * prompter's box (theatre, dance, concerts), the Opernglas, a pair of opera glasses (opera), and the
 * Ticket, a torn-off cinema ticket (films). All whisper. `NARRATOR` gives each category its narrator.
 * `MOUTH` is where each mouth sits at the default width of 84 px, from the top left corner: the tail
 * of the speech bubble above points there.
 */
import { MONO } from './svg-text'
import { PALETTE } from '@/lib/colors'
import type { Category } from '@/lib/types'

export type NarratorName = 'souffleur' | 'opernglas' | 'ticket'

export const NARRATOR: Record<Category, NarratorName> = {
  theatre: 'souffleur', dance: 'souffleur', concerts: 'souffleur', opera: 'opernglas', movies: 'ticket',
}

export const MOUTH: Record<NarratorName, readonly [number, number]> = { souffleur: [46, 57], opernglas: [16, 28], ticket: [59, 52] }

/**
 * The narrator of a category at `width` px. `tight`: the box is cut to the drawing (no room for a
 * speech bubble above it), so the mascot can be centred like an icon.
 */
export function Narrator({ category, width, tight = false }: { category: Category; width?: number; tight?: boolean }) {
  const N = { souffleur: Souffleur, opernglas: Opernglas, ticket: Ticket }[NARRATOR[category]]
  return <N width={width} tight={tight} />
}

const { ink: INK, paper: PAPER, yellow: YELLOW, redDeep: RED } = PALETTE
const line = { stroke: INK, strokeWidth: 3, strokeLinejoin: 'round', strokeLinecap: 'round' } as const

/** The ribs of the shell, between radius 38 and 52 around (60, 88). */
const RIBS = [30, 60, 90, 120, 150].map(a => {
  const r = (a * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
  return `M${60 + 38 * c} ${88 - 38 * s}L${60 + 52 * c} ${88 - 52 * s}`
}).join('')

/** `tight` drops the empty space above the shell (the speech bubble's room), for use as a small icon. */
export function Souffleur({ width = 84, tight = false }: { width?: number; tight?: boolean }) {
  const [top, height] = tight ? [33, 78] : [0, 110]
  return (
    <svg width={width} height={(width * height) / 120} viewBox={`0 ${top} 120 ${height}`} fill="none" aria-hidden="true">
      <path d="M8 88 A52 52 0 0 1 112 88 Z" fill={RED} {...line} />
      <path d="M22 88 A38 38 0 0 1 98 88 Z" fill={INK} />
      <path d={RIBS} {...line} strokeWidth={2.5} />
      <circle cx="60" cy="70" r="23" fill={PAPER} {...line} />
      <path d="M39 66 q-3 -7 3 -11M81 66 q3 -7 -3 -11" {...line} strokeWidth={2.5} />
      <circle cx="51" cy="68" r="6.5" stroke={INK} strokeWidth={2.5} />
      <circle cx="69" cy="68" r="6.5" stroke={INK} strokeWidth={2.5} />
      <path d="M57.5 68h5M44.5 66h13M62.5 66h13" stroke={INK} strokeWidth={2.5} />
      <circle cx="53.5" cy="69.5" r="2" fill={INK} />
      <circle cx="71.5" cy="69.5" r="2" fill={INK} />
      <circle cx="66" cy="82" r="2.3" fill={INK} />
      <path d="M73 90 q10 -4 9 -16 q-1 -5 -5 -3 q-1 8 -7 12" fill={PAPER} {...line} />
      <rect x="2" y="88" width="116" height="20" fill={YELLOW} {...line} />
    </svg>
  )
}

/** `tight` changes nothing: the ticket already fills its box. */
export function Ticket({ width = 84 }: { width?: number; tight?: boolean }) {
  return (
    <svg width={width} height={(width * 110) / 120} viewBox="0 0 120 110" fill="none" aria-hidden="true">
      <g transform="rotate(-15 60 58)">
        <path d="M22 14 h76 v30 a8 8 0 0 0 0 16 v40 h-76 v-40 a8 8 0 0 0 0 -16 z" fill={PAPER} {...line} />
        <rect x="23.5" y="15.5" width="73" height="14" fill={RED} />
        <text x="60" y="26" fontFamily={MONO} fontWeight="700" fontSize="9" letterSpacing="1.5" fill={PAPER} textAnchor="middle">EINLASS</text>
        <path d="M32 52 h56" stroke={INK} strokeWidth={2} strokeDasharray="4 4" />
        <text x="60" y="95" fontFamily={MONO} fontWeight="700" fontSize="7" fill={INK} textAnchor="middle">Nº 0047</text>
        <circle cx="51" cy="70" r="3.4" fill={INK} />
        <circle cx="73" cy="70" r="3.4" fill={INK} />
        <path d="M44 67h10M66 67h10" stroke={INK} strokeWidth={2.5} />
        {/* a side mouth: the tail of the bubble passes beside the eyes */}
        <circle cx="80" cy="80" r="2.4" fill={INK} />
      </g>
      <path d="M100 66 q5 6 0 12M107 61 q8 11 0 22" {...line} strokeWidth={2.5} />
    </svg>
  )
}

/**
 * Two lenses on a handle; the pupils look down. No mouth (as on the design canvas): `MOUTH` is the
 * top left corner of the left barrel, so the bubble's tail ends there and covers nothing. Barrels and
 * handle are red, not ink, so they stay visible on the dark card (as the Souffleur's shell).
 */
/** `tight` cuts the box to the drawing (x 17–103, y 32–106), as the Souffleur's. */
export function Opernglas({ width = 84, tight = false }: { width?: number; tight?: boolean }) {
  const lens = (cx: number) => <>
    <circle cx={cx} cy="58" r="19" fill={YELLOW} {...line} />
    <circle cx={cx} cy="58" r="12" fill={PAPER} stroke={INK} strokeWidth={2} />
    <path d={`M${cx - 12} 58 A12 12 0 0 1 ${cx + 12} 58 Z`} fill={INK} />
    <circle cx={cx + 4} cy="62" r="3" fill={INK} />
  </>
  return (
    <svg width={width} height={tight ? (width * 74) / 86 : (width * 110) / 120} viewBox={tight ? '17 32 86 74' : '0 0 120 110'} fill="none" aria-hidden="true">
      {/* 6 units lower than on the design canvas: the top stays free for the bubble's edge, as on the Souffleur */}
      <g transform="translate(0 6)">
      <path d="M84 70 L99 98" stroke={RED} strokeWidth={7} strokeLinecap="round" />
      <path d="M50 36h20v12H50z" fill={RED} {...line} />
      <rect x="22" y="28" width="32" height="24" rx="3" fill={RED} {...line} />
      <rect x="66" y="28" width="32" height="24" rx="3" fill={RED} {...line} />
      {lens(38)}{lens(82)}
      </g>
    </svg>
  )
}
