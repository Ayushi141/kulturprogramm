import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { DICTS, HOME, type Lang } from '@/lib/i18n'
import { colorVariables, PALETTE } from '@/lib/colors'
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

/**
 * Umami, the visitor statistics (dashboard: stats.kulturprogramm.eu). The tracker loads from this
 * domain under /k, and sends its events there too (backend/deploy/Caddyfile). Not a secret: the ID
 * is in every page. `data-do-not-track`: a browser that sends Do Not Track is not counted.
 */
const UMAMI_WEBSITE_ID = 'WEBSITE-ID'

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: PALETTE.paper,
}

export function RootLayout({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return (
    <html lang={lang} style={colorVariables()}>
      <body className="antialiased">
        {children}
        <Script src="/k/s.js" data-website-id={UMAMI_WEBSITE_ID} data-do-not-track="true" />
      </body>
    </html>
  )
}
