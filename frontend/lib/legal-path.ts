import type { Lang } from './i18n'

/** The legal pages and their addresses; the texts are in legal.tsx (kept out of client code). */
export type LegalPage = 'imprint' | 'privacy'

export const LEGAL_PATH: Record<LegalPage, Record<Lang, string>> = {
  imprint: { de: '/impressum', en: '/en/imprint' },
  privacy: { de: '/datenschutz', en: '/en/privacy' },
}
