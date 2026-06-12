import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'

export const metadata: Metadata = {
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
        <p className="text-lab-muted text-sm mb-10">Last updated: June 2026</p>

        <div className="space-y-8 text-lab-muted text-sm leading-relaxed">
          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">Using the site</h2>
            <p>
              By using theliftinglab.co.uk you agree to these terms. If you do not agree, please do not use the site. We may update these terms at any time — continued use after changes constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">What The Lifting Lab provides</h2>
            <p>
              The Lifting Lab provides supplement scoring, comparison, and stack-building tools for informational and educational purposes. Product scores are based on our published methodology and represent our independent assessment against clinical reference doses.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">Not medical advice</h2>
            <p>
              Nothing on this site constitutes medical, nutritional, or health advice. Supplement scores and recommendations are for general informational purposes only. Always consult a qualified healthcare professional before starting any supplement regimen, especially if you have a medical condition, are pregnant, or are taking medication. EFSA upper limits displayed in the stack builder are reference values — they are not a substitute for individual medical assessment.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">Affiliate links</h2>
            <p>
              Some links on this site are affiliate links. We may earn a commission if you purchase via these links, at no extra cost to you. Affiliate relationships have no influence on product scores or rankings. See our full <Link href="/affiliate-disclosure" className="text-lab-lime hover:underline">Affiliate Disclosure</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">Accuracy of scores</h2>
            <p>
              We make reasonable efforts to keep product data accurate, but formulations change. Scores are based on label data at the time of scoring. We accept no liability for decisions made on the basis of scores that may be outdated. If you spot an error, please contact us at{' '}
              <a href="mailto:hello@theliftinglab.co.uk" className="text-lab-lime hover:underline">
                hello@theliftinglab.co.uk
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">Intellectual property</h2>
            <p>
              The Lifting Lab scoring methodology, content, and brand are the property of Tobias Tipper / The Lifting Lab Ltd. You may not reproduce or republish our scoring data without permission. Product names and brand marks are the property of their respective owners and are used for identification purposes only.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">Limitation of liability</h2>
            <p>
              To the maximum extent permitted by law, The Lifting Lab accepts no liability for any loss or damage arising from use of this site, reliance on product scores, or purchases made via affiliate links. The site is provided &ldquo;as is&rdquo; without warranty of any kind.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">Governing law</h2>
            <p>
              These terms are governed by the laws of Scotland / England and Wales. Any disputes will be subject to the jurisdiction of the Scottish courts.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">Contact</h2>
            <p>
              Questions about these terms:{' '}
              <a href="mailto:hello@theliftinglab.co.uk" className="text-lab-lime hover:underline">
                hello@theliftinglab.co.uk
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
