import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import { categoryLabel } from '@/lib/categories'
import { STACK_GUIDES } from '@/lib/stacks'

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/stacks`

export const metadata: Metadata = {
  title: 'Best Supplement Stacks UK 2026 — By Goal | The Lifting Lab',
  description:
    'Ready-made supplement stacks for every goal: muscle building, fat loss, strength, endurance, over 40, everyday health and budget. Real UK products ranked by effectiveness.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'Best Supplement Stacks UK 2026 — By Goal',
    description:
      'Ready-made supplement stacks for every goal, built from real UK products ranked by effectiveness.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Best Supplement Stacks UK 2026 — By Goal',
    description: 'Ready-made supplement stacks for every goal, ranked by effectiveness.',
  },
}

export default function StacksHubPage() {
  // CollectionPage ItemList — backed 1:1 by the visible stack cards below; each
  // entry resolves to a per-goal stack page Google can surface as a set.
  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Best Supplement Stacks UK 2026',
    description: 'Supplement stacks by training and health goal.',
    numberOfItems: STACK_GUIDES.length,
    itemListElement: STACK_GUIDES.map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: s.h1,
      url: `${SITE}/stacks/${s.slug}`,
    })),
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: 'Stacks', item: URL },
    ].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  }

  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-lab-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/" className="hover:text-white">Home</Link></li>
            <li aria-hidden className="text-lab-border">/</li>
            <li aria-current="page" className="text-white/80">Stacks</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Supplement Stacks · 2026
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Best Supplement <span className="text-lab-lime">Stacks</span> by Goal
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          A stack is just the handful of supplements worth combining for a specific goal. We have
          built one for each, using only the ingredients with real evidence and filling each slot
          with the current top-scoring UK product.
        </p>
        <p className="text-lab-muted leading-relaxed mb-10">
          Pick the goal closest to yours below, or answer a few quick questions to personalise a
          stack to your budget and training.
        </p>

        {/* stack cards */}
        <div className="space-y-3">
          {STACK_GUIDES.map((s) => (
            <Link
              key={s.slug}
              href={`/stacks/${s.slug}`}
              className="block bg-lab-panel border border-lab-border rounded-xl p-5 hover:border-lab-lime/40 transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-widest text-lab-lime mb-1">
                    {s.eyebrow.replace(/^Goal · /, '')}
                  </p>
                  <h2 className="text-white text-base font-black leading-tight mb-1">{s.h1}</h2>
                  <p className="text-lab-muted text-sm leading-relaxed line-clamp-2">{s.intro}</p>
                  <p className="text-[11px] text-white/50 mt-2 truncate">
                    {s.categories.slice(0, s.maxProducts).map((c) => categoryLabel(c)).join(' · ')}
                  </p>
                </div>
                <span className="text-lab-lime text-lg font-black shrink-0">→</span>
              </div>
            </Link>
          ))}
        </div>

        {/* funnel */}
        <section className="mt-12 bg-lab-panel border border-lab-border rounded-2xl p-6">
          <h2 className="text-lg font-black uppercase tracking-wide mb-3">
            Want it tailored?
          </h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-5">
            Find My Stack asks a few quick questions about your goals, budget and training, then
            builds a stack around your answers and what you already take.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/wizard"
              className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
            >
              Find my stack →
            </Link>
            <Link
              href="/best"
              className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
            >
              Best supplements 2026
            </Link>
          </div>
        </section>

        <p className="text-lab-muted/70 text-xs mt-8 leading-relaxed">
          Informational only — not medical advice. Buy links are affiliate links; we may earn a
          commission at no extra cost to you. This never affects scoring.
        </p>
      </main>
    </div>
  )
}
