import type { Category } from '@/lib/types'

/** A number from a string (FNV-1a): the same title always gets the same picture. */
function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

// Each composition is two or three flat shapes in a 100 x 100 box. The CSS gives them their
// colours (.ph-a: category tint, .ph-b: paper) and the hard ink shadow (.ph-s).
const COMPOSITIONS: ((s: 'a' | 'b') => React.ReactNode)[] = [
  // a circle over a block
  s => <><rect className={`ph-${s === 'a' ? 'b' : 'a'}`} x="22" y="48" width="56" height="30" /><circle className={`ph-${s}`} cx="50" cy="42" r="20" /></>,
  // an arch on a bar
  s => <><rect className={`ph-${s === 'a' ? 'b' : 'a'}`} x="18" y="64" width="64" height="12" /><path className={`ph-${s}`} d="M30 64V48a20 20 0 0 1 40 0v16z" /></>,
  // two blocks, one tilted, and a dot
  s => <><rect className={`ph-${s}`} x="24" y="30" width="34" height="44" /><rect className={`ph-${s === 'a' ? 'b' : 'a'}`} x="46" y="40" width="30" height="30" transform="rotate(-8 61 55)" /><circle className="ph-b" cx="35" cy="40" r="4" /></>,
  // a half disc on its side and a column
  s => <><rect className={`ph-${s === 'a' ? 'b' : 'a'}`} x="56" y="24" width="16" height="54" /><path className={`ph-${s}`} d="M52 30a22 22 0 0 0 0 44z" /></>,
]

/** The picture for an event without an image: a few calm shapes in the category's colour,
    chosen and placed from the title, so cards differ but a title always looks the same. */
export function Placeholder({ category, seed }: { category: Category; seed: string }) {
  const h = hash(seed)
  const draw = COMPOSITIONS[h % COMPOSITIONS.length]
  const swap = (h >> 3) & 1 ? 'a' : 'b'
  const flip = (h >> 4) & 1 ? 'matrix(-1 0 0 1 100 0)' : undefined
  const turn = ((h >> 5) % 13) - 6 // -6..6 degrees
  return (
    <div className={'source-image ph cat-' + category} aria-hidden>
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        <g transform={flip}>
          <g transform={`rotate(${turn} 50 52)`}>
            <g className="ph-s" transform="translate(2.5 2.5)">{draw(swap)}</g>
            {draw(swap)}
          </g>
        </g>
      </svg>
    </div>
  )
}
