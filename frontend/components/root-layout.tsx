import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { DICTS, HOME, type Lang } from '@/lib/i18n'
import '@/app/globals.css'
import '@/app/explorer.css'

/**
 * Shared root layout. Each language has its own root layout
 * (`app/(de)/layout.tsx` for `/`, `app/(en)/en/layout.tsx` for `/en`)
 * so that `<html lang>` is right in the server-rendered page.
 */
export function metadataFor(lang: Lang): Metadata {
  return {
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
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
