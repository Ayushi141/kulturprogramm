import type { Metadata, Viewport } from 'next'
import { DICTS, HOME, type Lang } from '@/lib/i18n'
import '@/app/globals.css'
import '@/app/explorer.css'

/**
 * Shared root layout. Each language has its own root layout
 * (`app/(de)/layout.tsx` for `/`, `app/(en)/en/layout.tsx` for `/en`)
 * so that `<html lang>` is right in the server-rendered page.
 */
/** The public address: link previews need absolute URLs (og:image, og:url). */
const SITE = 'https://kulturprogramm.eu'

export function metadataFor(lang: Lang): Metadata {
  return {
    metadataBase: new URL(SITE),
    title: DICTS[lang].title,
    description: DICTS[lang].description,
    alternates: { canonical: HOME[lang], languages: { de: HOME.de, en: HOME.en } },
    icons: {
      icon: [
        // the orange star from the masthead
        { url: '/icon.svg', type: 'image/svg+xml' },
        { url: '/icon-32x32.png', sizes: '32x32', type: 'image/png' },
      ],
      apple: '/apple-icon.png',
    },
    // iPhone home screen: the short name under the icon (else the long page title)
    appleWebApp: { capable: true, title: 'Kulturprogramm', statusBarStyle: 'default' },
  }
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f7f3e8',
}

export function RootLayout({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return (
    <html lang={lang}>
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}
