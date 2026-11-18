import Guide from '@/components/guide'
import { getProgramme } from '@/lib/get-programme'

export const revalidate = 900

export default async function Page() {
  const programme = await getProgramme()
  return <Guide programme={programme} />
}
