import { ogImage } from '@/lib/og-image'

// The link preview at a fixed address: og:image points here, and the share button
// requests it when tapped so it is drawn before the chat app asks.
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return ogImage('en', (await params).id)
}
