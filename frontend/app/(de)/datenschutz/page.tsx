import { LegalPage, legalMetadata } from '@/components/legal-page'

export const metadata = legalMetadata('privacy', 'de')

export default function Page() {
  return <LegalPage page="privacy" lang="de" />
}
