import type { Category } from '@/lib/types'

/** Category colours. Validated as a set for colour-blind separation on --paper. */
export const CAT: Record<Category, { label: string; tag: string; color: string; ink: string }> = {
  theatre: { label: 'Theatre', tag: 'THEATRE', color: '#df3929', ink: '#ffffff' },
  opera: { label: 'Opera', tag: 'OPERA', color: '#e2a012', ink: '#201f1a' },
  movies: { label: 'Movies', tag: 'MOVIES', color: '#2646c8', ink: '#ffffff' },
}
