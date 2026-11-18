import { metadataFor, RootLayout } from '@/components/root-layout'

export const metadata = metadataFor('de')
export { viewport } from '@/components/root-layout'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <RootLayout lang="de">{children}</RootLayout>
}
