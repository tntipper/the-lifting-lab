import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'

export const metadata: Metadata = {
  title: 'Affiliate Disclosure — The Lifting Lab',
  description: 'Our affiliate relationship disclosure for Amazon Associates and other programmes.',
  alternates: { canonical: 'https://www.theliftinglab.co.uk/affiliate-disclosure' },
}

export default function AffiliateDisclosurePage() {
  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">Legal</p>
        <h1 className="text-3xl font-black uppercase tracking-tight mb-2">Affiliate Disclosure</h1>
        <p className="text-lab-muted text-sm mb-10">Last updated: June 2026</p>

        <div className="space-y-8 text-lab-muted text-sm leading-relaxed">
          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">Amazon Associates</h2>
            <p>
              The Lifting Lab is a participant in the <strong className="text-white">Amazon Associates Programme</strong>, an affiliate advertising programme designed to provide a means for sites to earn advertising fees by advertising and linking to Amazon.co.uk.
            </p>
            <p className="mt-3">
              Some product links on this site are Amazon affiliate links. If you click one of these links and make a qualifying purchase, we may earn a small commission — at no additional cost to you.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">Bulk (via Awin)</h2>
            <p>
              The Lifting Lab is an affiliate partner of <strong className="text-white">Bulk</strong> (bulk.com) via the <strong className="text-white">Awin affiliate network</strong>. Some links to Bulk products on this site are affiliate links. If you click one of these links and make a qualifying purchase, we may earn a small commission — at no additional cost to you.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">How this affects our scores</h2>
            <p>
              It doesn&apos;t. Our product scores are calculated using a fixed, published methodology based solely on label data and evidence-based reference doses. <strong className="text-white">Affiliate relationships have zero influence on product rankings, scores, or recommendations.</strong> We do not accept payment for placements or score adjustments.
            </p>
            <p className="mt-3">
              The same product receives the same score regardless of whether an affiliate link exists or which retailer is linked.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">Other affiliate programmes</h2>
            <p>
              We may join additional affiliate programmes over time. Any new relationships will be added to this disclosure promptly. The same principle always applies: affiliate status has no effect on product scoring.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">Questions</h2>
            <p>
              If you have questions about our affiliate relationships, contact us at{' '}
              <a href="mailto:hello@theliftinglab.co.uk" className="text-lab-lime hover:underline">
                hello@theliftinglab.co.uk
              </a>.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-lab-border">
          <Link href="/" className="text-xs uppercase tracking-widest font-bold text-lab-muted hover:text-white">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}
