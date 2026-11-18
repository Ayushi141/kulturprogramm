import type { NextRequest } from 'next/server'
import { getPool } from '@/lib/get-programme'

/**
 * Serves an event image from the `images` table. The scraper downloads the
 * originals, so visitors never load them from the venues' servers.
 * A key is a hash of the image bytes, so its content does not change: browsers
 * may cache it for a long time.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<'/img/[key]'>) {
  const { key } = await ctx.params
  const db = getPool()
  if (!db || !/^[0-9a-f]{32}$/.test(key)) return new Response('Not found', { status: 404 })
  const { rows } = await db.query<{ content_type: string; data: Buffer }>(
    'SELECT content_type, data FROM images WHERE key = $1',
    [key],
  )
  if (!rows.length) return new Response('Not found', { status: 404 })
  return new Response(new Uint8Array(rows[0].data), {
    headers: {
      'Content-Type': rows[0].content_type,
      'Cache-Control': 'public, max-age=2592000, immutable',
    },
  })
}
