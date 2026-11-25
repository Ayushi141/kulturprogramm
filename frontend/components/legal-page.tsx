import type { Metadata } from 'next'
import { ContactForm } from '@/components/contact-form'
import { SiteFooter } from '@/components/site-footer'
import { DICTS, HOME, LANGS, type Lang } from '@/lib/i18n'
import { imprint, LEGAL_PATH, privacy, type LegalPage as Page } from '@/lib/legal'

/**
 * One legal page (imprint or privacy policy) in one language: the wordmark back to the
 * programme, the language switch, the text, and the same footer links as the programme.
 * A plain server page: no programme data, no client code except the contact form.
 */
export function LegalPage({ page, lang }: { page: Page; lang: Lang }) {
  const t = DICTS[lang]
  const content = page === 'imprint' ? imprint(lang) : privacy(lang)
  return (
    <>
      <header>
        <div className="navwrap">
          <a className="x-brand" href={HOME[lang]} aria-label={t.backHome}>
            <span className="brand"><span className="burst" aria-hidden="true" />KULTURPROGRAMM</span>
          </a>
          <nav className="x-lang" aria-label={t.language}>
            {LANGS.map(l => (
              <a key={l} href={LEGAL_PATH[page][l]} lang={l} aria-current={l === lang ? 'true' : undefined}>{l.toUpperCase()}</a>
            ))}
          </nav>
        </div>
      </header>
      <main className="x-legal">
        <h1>{content.title}</h1>
        {content.updated && <p className="x-legalnote">{content.updated}</p>}
        {content.sections.map(s => (
          <section key={s.title}>
            <h2>{s.title}</h2>
            {s.body}
          </section>
        ))}
        {page === 'imprint' && <ContactForm lang={lang} />}
        <p><a className="x-ticket" href={HOME[lang]}>← {t.backHome}</a></p>
      </main>
      <SiteFooter lang={lang} />
    </>
  )
}

export function legalMetadata(page: Page, lang: Lang): Metadata {
  const title = (page === 'imprint' ? imprint(lang) : privacy(lang)).title
  return {
    title: `${title} · Kulturprogramm`,
    alternates: { canonical: LEGAL_PATH[page][lang], languages: { de: LEGAL_PATH[page].de, en: LEGAL_PATH[page].en } },
  }
}
