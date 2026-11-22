import { SharePage, shareMetadata } from '@/components/share-page'

// Render on each request: the database is not reachable while the image builds.
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  return shareMetadata('en', (await params).id)
}

export default async function Page({ params }: Props) {
  return <SharePage lang="en" id={(await params).id} />
}
