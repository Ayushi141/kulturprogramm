'use client'
import { createContext, useContext, type ReactNode } from 'react'
import { DICTS, type Dict, type Lang } from '@/lib/i18n'

const LangContext = createContext<Lang>('de')

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>
}

export const useLang = () => useContext(LangContext)

/** Texts for the current language. */
export const useT = (): Dict => DICTS[useContext(LangContext)]
