import { notFound } from 'next/navigation'
import TopNav from '@/components/TopNav'
import { StagingCartContents } from '@/components/StagingCartPanel'
import { stagingCartUiEnabled } from '@/lib/commerce/staging-cart-types'

export const metadata = { title: 'Staging test cart | The Lifting Lab', robots: { index: false, follow: false } }
export default function CartPage() {
  if (!stagingCartUiEnabled()) notFound()
  return <><TopNav /><main className="mx-auto w-full max-w-xl p-4 sm:p-6"><h1 className="mb-5 text-2xl font-black">Test cart</h1><StagingCartContents /></main></>
}
