import type { Category } from '@/lib/types'

/**
 * Category colours, validated as a set on the chart card (#fbf8f1), all pairs
 * (any two can sit side by side): protan/deutan ΔE ≥ 16.8, normal ΔE ≥ 20.9
 * (OKLab ×100). `ink` (bar titles) has ≥ 4.5:1 on its colour. Opera and dance
 * are light (2.1:1 on the card), so their bars always carry visible titles.
 * Theatre and movies are the brand red and blue (red one step darker for its
 * white titles). Labels are in lib/i18n.ts.
 */
export const CAT: Record<Category, { color: string; ink: string }> = {
  theatre: { color: '#da3626', ink: '#ffffff' },
  opera: { color: '#fa960b', ink: '#201f1a' },
  dance: { color: '#25c2c2', ink: '#201f1a' },
  concerts: { color: '#7f2866', ink: '#ffffff' },
  movies: { color: '#2646c8', ink: '#ffffff' },
}
