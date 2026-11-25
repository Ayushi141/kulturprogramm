import { DICTS, type Lang } from '@/lib/i18n'
import { LEGAL_PATH } from '@/lib/legal-path'

/** The footer of every page: the wordmark, where the data comes from, imprint and privacy. */
export function SiteFooter({ lang }: { lang: Lang }) {
  const t = DICTS[lang]
  return (
    <footer>
      <span className="brand x-footbrand"><span className="burst" aria-hidden="true" />KULTURPROGRAMM</span>
      <span>{t.footer}</span>
      <nav className="x-footlinks">
        <a href={LEGAL_PATH.imprint[lang]}>{t.imprint}</a>
        <a href={LEGAL_PATH.privacy[lang]}>{t.privacy}</a>
      </nav>
    </footer>
  )
}
