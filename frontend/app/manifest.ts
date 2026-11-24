import type { MetadataRoute } from 'next'

/**
 * The web app manifest, served at `/manifest.webmanifest`. With it, phones can install the site
 * ("Add to Home Screen"): it opens from its own icon, without the browser's address bar.
 * One manifest for the whole site, so the installed app starts on the German page (`/`).
 * The colours match `viewport` in `components/root-layout.tsx` (paper).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Kulturprogramm',
    short_name: 'Kulturprogramm',
    description: 'Theater, Oper, Tanz, Konzerte und Kino in NRW auf einer Timeline.',
    lang: 'de',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f7f3e8',
    theme_color: '#f7f3e8',
    icons: [
      { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Android cuts icons into its own shape (circle, squircle): the star stays inside the safe zone
      { src: '/icon-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
