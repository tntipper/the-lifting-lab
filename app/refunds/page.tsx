import { pageMetadata } from '@/lib/seo'
import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import PolicyDraftNotice from '@/components/PolicyDraftNotice'

export const metadata: Metadata = {
  openGraph: pageMetadata('/refunds', 'Refunds and returns — The Lifting Lab', 'Draft refunds policy for review.').openGraph,
  twitter: pageMetadata('/refunds', 'Refunds and returns — The Lifting Lab', 'Draft refunds policy for review.').twitter,
  alternates: { canonical: '/refunds' },
 title: 'Refunds and returns — The Lifting Lab', description: 'Draft refunds policy for review.', robots: { index: false, follow: true } }

export default function Page() {
  return <div className="min-h-screen bg-lab-bg text-white"><TopNav />
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">Refunds and returns</h1>
      <PolicyDraftNotice />
      <div className="space-y-8 text-sm leading-relaxed text-lab-muted">
        <section><h2 className="font-bold text-white">Changing your mind</h2><p>For eligible online purchases, tell us within 14 days after receiving the goods if you wish to cancel, then return them within a further 14 days. Contact hello@theliftinglab.co.uk with your order reference and the items you wish to return. We will provide return instructions; do not send goods to a supplier without those instructions.</p><p>For an eligible full-order cancellation we refund the goods and standard delivery charge. Refunds are made to the original payment method within 14 days after we receive the returned goods or evidence that you sent them, whichever is earlier. A deduction may apply for handling beyond what is needed to inspect the goods.</p></section>
<section><h2 className="font-bold text-white">Sealed products and faulty goods</h2><p>The cancellation exception for unsealed goods applies only where they were sealed and are unsuitable for return for genuine health or hygiene reasons. It is not a blanket exclusion for every supplement. Your rights for faulty, damaged or incorrectly supplied goods remain.</p><p>Contact TLL about a fault or delivery error so we can arrange an appropriate remedy and necessary return costs. Supplier return conditions do not remove your statutory rights against TLL.</p></section>
<section><h2 className="font-bold text-white">Details awaiting review</h2><p>TODO for Toby/Lifty: confirm the returns address, change-of-mind return postage policy, partial-order delivery refunds, eligible sealed-product exceptions and cancellation form. Match this draft in Shopify before publication. Shopify handles refund transactions; this website does not process a refund.</p></section>
        <p><Link href="/contact" className="text-lab-lime hover:underline">Contact TLL</Link> · <Link href="/terms" className="text-lab-lime hover:underline">Terms</Link></p>
      </div>
    </main>
  </div>
}
