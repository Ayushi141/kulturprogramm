import { metadataFor, RootLayout } from '@/components/root-layout'

export const metadata = metadataFor('en')
export { viewport } from '@/components/root-layout'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <RootLayout lang="en">{children}</RootLayout>
}
