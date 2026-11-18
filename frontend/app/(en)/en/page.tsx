import Guide from '@/components/guide'
import { getProgramme } from '@/lib/get-programme'

// Render on each request: the database is not reachable while the image builds.
export const dynamic = 'force-dynamic'

export default async function Page() {
  return <Guide programme={await getProgramme()} lang="en" />
}
