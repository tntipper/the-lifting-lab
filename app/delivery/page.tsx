import { pageMetadata } from '@/lib/seo'
import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'

export const metadata: Metadata = {
  openGraph: pageMetadata('/delivery', 'Delivery — The Lifting Lab', 'Standard DPD Next Day delivery to mainland UK: £4.99, free on orders of £100+.').openGraph,
  twitter: pageMetadata('/delivery', 'Delivery — The Lifting Lab', 'Standard DPD Next Day delivery to mainland UK: £4.99, free on orders of £100+.').twitter,
  alternates: { canonical: '/delivery' },
 title: 'Delivery — The Lifting Lab', description: 'Standard DPD Next Day delivery to mainland UK: £4.99, free on orders of £100+.', robots: { index: false, follow: true } }

export default function Page() {
  return <div className="min-h-screen bg-lab-bg text-white"><TopNav />
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">Delivery</h1>
      <div className="space-y-8 text-sm leading-relaxed text-lab-muted">
        <section><h2 className="font-bold text-white">Delivery charge</h2><p>£4.99 Standard DPD Next Day, free on orders of £100+. Delivery is tracked and insured.</p></section>
        <section><h2 className="font-bold text-white">When your order arrives</h2><p>Order by 4pm Monday to Friday, excluding UK bank holidays, for next working day delivery. Orders placed after 4pm are dispatched the next working day. Orders placed after 4pm on Friday, at weekends or on bank holidays go out the next working day, usually Monday (or the next working day if Monday is a bank holiday).</p><p>Delivery to some Scottish Highlands postcodes takes 2–3 working days. We email your tracking details when your order is dispatched. Delivery times are estimates and may be affected by courier disruption.</p></section>
        <section><h2 className="font-bold text-white">Where we deliver</h2><p>We deliver to mainland UK only.</p></section>
        <section><h2 className="font-bold text-white">Questions</h2><p>For delivery questions, email <a href="mailto:help@theliftinglab.co.uk" className="text-lab-lime hover:underline">help@theliftinglab.co.uk</a>. For questions about a specific order, email <a href="mailto:orders@theliftinglab.co.uk" className="text-lab-lime hover:underline">orders@theliftinglab.co.uk</a>.</p></section>
        <p><Link href="/contact" className="text-lab-lime hover:underline">Contact TLL</Link> · <Link href="/terms" className="text-lab-lime hover:underline">Terms</Link></p>
      </div>
    </main>
  </div>
}
