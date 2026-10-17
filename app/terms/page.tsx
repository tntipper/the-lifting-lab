import { pageMetadata } from '@/lib/seo'
import type { Metadata } from 'next'
import Link from 'next/link'
import PolicyDraftNotice from '@/components/PolicyDraftNotice'
import TopNav from '@/components/TopNav'

export const metadata: Metadata = {
  openGraph: pageMetadata('/terms', 'Terms of Use — The Lifting Lab', 'Terms governing your use of theliftinglab.co.uk.').openGraph,
  twitter: pageMetadata('/terms', 'Terms of Use — The Lifting Lab', 'Terms governing your use of theliftinglab.co.uk.').twitter,

  title: 'Terms of Use — The Lifting Lab',
  description: 'Terms governing your use of theliftinglab.co.uk.',
  alternates: { canonical: 'https://theliftinglab.co.uk/terms' },
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">Legal</p>
        <h1 className="text-3xl font-black uppercase tracking-tight mb-2">Terms of Use</h1>
        <p className="text-lab-muted text-sm mb-10">Draft updated: October 2026</p>

        <PolicyDraftNotice />
        <div className="space-y-8 text-lab-muted text-sm leading-relaxed">
          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">Purchases from the TLL Store</h2>
            <p>The Lifting Lab is a trading name of THE LIFTING LAB LTD, registered in England and Wales, company number 17497631, registered office 82a James Carter Road, Mildenhall, IP28 7DE. Shopify provides checkout, payments, purchase accounts and order emails. TLL handles customer support and remains responsible for purchases from its store, including where a supplier dispatches the goods. See our <Link href="/delivery" className="text-lab-lime hover:underline">delivery</Link> and <Link href="/refunds" className="text-lab-lime hover:underline">refunds</Link> drafts. Purchases through external retailer links are with that retailer.</p>
            <p className="mt-3">TODO for Toby/Lifty: confirm the contact telephone number, service area, contract acceptance point and matching Shopify policies before publication. Nothing in these terms removes your statutory consumer rights, or excludes liability that cannot lawfully be excluded.</p>
          </section>
          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">Using the site</h2>
            <p>
              By using theliftinglab.co.uk you agree to these terms. If you do not agree, please do not use the site. We may update these terms at any time — continued use after changes constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">What The Lifting Lab provides</h2>
            <p>No approved effectiveness assessment is available. Historical percentages are unverified and do not establish dosing, product quality or a recommendation. Labels and listed prices remain available for research.</p>
          </section>

          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">Not medical advice</h2>
            <p>Content is general information, not personal medical advice. Read the current product label and seek advice from a qualified health professional about suitability, medicines, pregnancy or existing conditions. Product warnings and age guidance do not establish that a supplement is suitable for you.</p>
          </section>

          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">Affiliate links</h2>
            <p>
              Some links on this site are affiliate links. We may earn a commission if you purchase via these links, at no extra cost to you. Affiliate links are identified separately from product information. See our full <Link href="/affiliate-disclosure" className="text-lab-lime hover:underline">Affiliate Disclosure</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">Accuracy of scores</h2>
            <p>
              We make reasonable efforts to keep product data accurate, but formulations change. Recorded label data and historical scores may be incomplete or outdated. No approved product effectiveness assessment is currently available. If you spot an error, please contact us at{' '}
              <a href="mailto:help@theliftinglab.co.uk" className="text-lab-lime hover:underline">
                help@theliftinglab.co.uk
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">Intellectual property</h2>
            <p>
              The Lifting Lab scoring methodology, content, and brand are the property of THE LIFTING LAB LTD. You may not reproduce or republish our scoring data without permission. Product names and brand marks are the property of their respective owners and are used for identification purposes only.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">Limitation of liability</h2>
            <p>
              We do not guarantee that research information is complete or up to date. This does not affect your statutory rights for goods bought from TLL. We do not exclude liability for fraud, death or personal injury caused by negligence, or any other liability that cannot lawfully be excluded.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">Governing law</h2>
            <p>
              These terms are governed by the laws of the United Kingdom as they apply in England and Wales. If you live in Scotland or Northern Ireland, you can also bring proceedings in your local courts.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">Contact</h2>
            <p>
              Questions about these terms:{' '}
              <a href="mailto:help@theliftinglab.co.uk" className="text-lab-lime hover:underline">
                help@theliftinglab.co.uk
              </a>
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
