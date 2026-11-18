'use client'
import { Fragment } from 'react'
import { Bookmark } from 'lucide-react'
import { CATEGORIES } from '@/lib/types'
import { HOME, LANGS } from '@/lib/i18n'
import { useLang, useT } from './i18n'

/**
 * Site header: the wordmark with the categories as a printed stamp,
 * the language switch, and one action, "My evening".
 */
export function Masthead({ count, showPicks }: { count: number; showPicks: () => void }) {
  const t = useT(), lang = useLang()
  return (
    <header>
      <div className="navwrap">
        <a className="x-brand" href="#top" aria-label={t.toTop}>
          <span className="brand"><span className="burst" aria-hidden="true" />KULTURPROGRAMM</span>
          <span className="issue x-stamp">
            {CATEGORIES.map((c, i) => <Fragment key={c}>{i > 0 && <span>/</span>}{t.cat[c].tag}</Fragment>)}
            <span>·</span>NRW
          </span>
        </a>
        <div className="x-navtools">
          <nav className="x-lang" aria-label={t.language}>
            {LANGS.map(l => (
              // keep the view (#timeline / #poster) when switching
              <a key={l} href={HOME[l]} lang={l} aria-current={l === lang ? 'true' : undefined}
                onClick={e => { e.preventDefault(); location.href = HOME[l] + location.hash }}>{l.toUpperCase()}</a>
            ))}
          </nav>
          <button className="saves" onClick={showPicks} aria-label={`${t.myEvening} (${count})`}><Bookmark size={15} /><span className="x-saves-label">{t.myEvening}</span><b>{count}</b></button>
        </div>
      </div>
    </header>
  )
}
