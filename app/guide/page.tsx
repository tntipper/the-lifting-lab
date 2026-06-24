import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import { GUIDES } from '@/lib/guides'

export const metadata: Metadata = {
  title: 'Supplement Guides — Evidence-Based UK Buyer’s Guides | The Lifting Lab',
  description:
    'Plain-English, evidence-based guides to creatine, whey, pre-workout, EAAs and more. Learn how to dose each supplement and which UK products are worth buying.',
  alternates: { canonical: 'https://theliftinglab.co.uk/guide' },
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
          Short, honest, evidence-based guides to the supplements that matter. How to
          dose them, what the marketing hides, and which UK products actually deliver.
        </p>
        <p className="text-sm text-lab-muted mb-10">
          Want to go deeper on a single active?{' '}
          <Link href="/ingredients" className="text-lab-lime font-bold hover:underline underline-offset-2">
            Browse the ingredient library →
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
