import { pageMetadata } from '@/lib/seo'
import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import PolicyDraftNotice from '@/components/PolicyDraftNotice'

export const metadata: Metadata = {
  openGraph: pageMetadata('/delivery', 'Delivery — The Lifting Lab', 'Draft delivery policy for review.').openGraph,
  twitter: pageMetadata('/delivery', 'Delivery — The Lifting Lab', 'Draft delivery policy for review.').twitter,
  alternates: { canonical: '/delivery' },
 title: 'Delivery — The Lifting Lab', description: 'Draft delivery policy for review.', robots: { index: false, follow: true } }

export default function Page() {
  return <div className="min-h-screen bg-lab-bg text-white"><TopNav />
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">Delivery</h1>
      <PolicyDraftNotice />
      <div className="space-y-8 text-sm leading-relaxed text-lab-muted">
        <section><h2 className="font-bold text-white">Delivery charge</h2><p>The proposed UK standard delivery charge is £4.99 per customer order. TLL absorbs supplier dispatch charges. An order split across suppliers may arrive in separate parcels; the customer is not charged extra supplier dispatch fees.</p></section>
<section><h2 className="font-bold text-white">Dispatch and delivery</h2><p>Shopify checkout will show available delivery destinations and the charge before payment. Delivery estimates and any exclusions must be confirmed before orders open. TLL is your contact for missing, damaged or delayed parcels.</p><p>TODO for Toby/Lifty: approve the delivery area, excluded postcodes, delivery estimates and handling of split parcels, then check Shopify’s actual £4.99 setting. This page records the intended policy; it does not verify the live checkout.</p></section>
        <p><Link href="/contact" className="text-lab-lime hover:underline">Contact TLL</Link> · <Link href="/terms" className="text-lab-lime hover:underline">Terms</Link></p>
      </div>
    </main>
  </div>
}
