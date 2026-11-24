/**
 * The two narrators of the context drawer, as drawn on the design canvas: the Souffleur in his
 * prompter's box (stage) and the Ticket, a torn-off cinema ticket (films). Both whisper. `MOUTH` is where
 * each mouth sits at the default width of 84 px, from the top left corner: the tail of the speech
 * bubble above points there.
 */
import { MONO } from './svg-text'

export const MOUTH = { souffleur: [46, 57], ticket: [59, 52] } as const

const INK = '#201f1a', PAPER = '#f7f3e8', YELLOW = '#ffde5b', RED = '#b8281c'
const line = { stroke: INK, strokeWidth: 3, strokeLinejoin: 'round', strokeLinecap: 'round' } as const

/** The ribs of the shell, between radius 38 and 52 around (60, 88). */
const RIBS = [30, 60, 90, 120, 150].map(a => {
  const r = (a * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
  return `M${60 + 38 * c} ${88 - 38 * s}L${60 + 52 * c} ${88 - 52 * s}`
}).join('')

export function Souffleur({ width = 84 }: { width?: number }) {
  return (
    <svg width={width} height={(width * 110) / 120} viewBox="0 0 120 110" fill="none" aria-hidden="true">
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

export function Ticket({ width = 84 }: { width?: number }) {
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
