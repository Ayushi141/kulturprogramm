import type { Category } from '@/lib/types'

/** Category colours. Validated as a set for colour-blind separation on --paper. Labels are in lib/i18n.ts. */
export const CAT: Record<Category, { color: string; ink: string }> = {
  theatre: { color: '#df3929', ink: '#ffffff' },
  opera: { color: '#e2a012', ink: '#201f1a' },
  movies: { color: '#2646c8', ink: '#ffffff' },
}
