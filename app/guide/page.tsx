import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import { GUIDES } from '@/lib/guides'

export const metadata: Metadata = {
  title: 'Supplement Guides — Evidence-Based UK Buyer’s Guides | The Lifting Lab',
  description:
    'Supplement research guides and recorded label context. Product effectiveness recommendations remain unavailable pending assessment approval.',
  alternates: { canonical: 'https://www.theliftinglab.co.uk/guide' },
}

export default function GuideIndex() {
  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <div className="max-w-4xl mx-auto px-6 py-12">
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Supplement Guides
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight mb-3">
          Know what you&apos;re <span className="text-lab-lime">buying</span>
        </h1>
        <p className="text-lab-muted max-w-2xl mb-6">
          Supplement research guides. Product effectiveness recommendations are unavailable. Research how to
          understand ingredient and label context. The recorded products remain available for inspection.
        </p>
        <p className="text-sm text-lab-muted mb-10">
          Want to go deeper on a single active?{' '}
          <Link href="/ingredients" className="text-lab-lime font-bold hover:underline underline-offset-2">
            Browse the ingredient library →
          </Link>{' '}
          Or skim{' '}
          <Link href="/faq" className="text-lab-lime font-bold hover:underline underline-offset-2">
            common questions →
          </Link>
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {GUIDES.map((g) => (
            <Link
              key={g.slug}
              href={`/guide/${g.slug}`}
              className="group bg-lab-panel border border-lab-border rounded-2xl p-6 hover:border-lab-lime transition-colors"
            >
              <h2 className="text-lg font-black uppercase tracking-wide mb-2 group-hover:text-lab-lime transition-colors">
                {g.h1}
              </h2>
              <p className="text-lab-muted text-sm leading-relaxed line-clamp-3">{g.intro}</p>
              <span className="inline-block mt-4 text-[11px] uppercase tracking-widest font-bold text-lab-lime">
                Read guide →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
