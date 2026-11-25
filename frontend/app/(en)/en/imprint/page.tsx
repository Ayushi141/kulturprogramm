import { LegalPage, legalMetadata } from '@/components/legal-page'

export const metadata = legalMetadata('imprint', 'en')

export default function Page() {
  return <LegalPage page="imprint" lang="en" />
}
