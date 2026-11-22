import { OG_SIZE, ogImage } from '@/lib/og-image'

// Drawn on each request from the database (not reachable while the image builds).
export const dynamic = 'force-dynamic'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  return ogImage('en', (await params).id)
}
