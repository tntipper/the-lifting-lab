import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import { INGREDIENTS, type EvidenceLevel } from '@/lib/ingredients'

export const metadata: Metadata = {
  title: 'Supplement Ingredients A-Z — What Works and the Dose | The Lifting Lab',
  description:
    'Plain-English, evidence-based guides to the ingredients inside your supplements: caffeine, creatine, citrulline, beta-alanine and more. What each does, the effective dose, and the safe limit.',
  alternates: { canonical: 'https://www.theliftinglab.co.uk/ingredients' },
  openGraph: {
    title: 'Supplement Ingredients A-Z | The Lifting Lab',
    description:
      'What each supplement ingredient actually does, the effective dose, and the safe limit. Evidence-based and UK-focused.',
    url: 'https://www.theliftinglab.co.uk/ingredients',
    type: 'website',
    siteName: 'The Lifting Lab',
  },
}

const EVIDENCE_STYLE: Record<EvidenceLevel, string> = {
  Strong: 'text-lab-lime border-lab-lime/50',
  Moderate: 'text-amber-400 border-amber-400/40',
  Limited: 'text-lab-muted border-lab-border',
}

export default function IngredientIndex() {
  // Alphabetical for a clean A-Z directory feel.
  const sorted = [...INGREDIENTS].sort((a, b) => a.name.localeCompare(b.name))

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Supplement ingredients A-Z',
    description:
      'Evidence-based guides to common supplement ingredients, with effective doses and safety notes.',
    numberOfItems: sorted.length,
    itemListElement: sorted.map((ing, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: ing.name,
      url: `https://www.theliftinglab.co.uk/ingredients/${ing.slug}`,
    })),
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: 'https://www.theliftinglab.co.uk' },
      { name: 'Ingredients', item: 'https://www.theliftinglab.co.uk/ingredients' },
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
      <div className="max-w-4xl mx-auto px-6 py-12">
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-lab-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="hover:text-white">Home</Link>
            </li>
            <li aria-hidden className="text-lab-border">/</li>
            <li aria-current="page" className="text-white/80">Ingredients</li>
          </ol>
        </nav>
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Ingredient Library
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight mb-3">
          What&apos;s actually <span className="text-lab-lime">in it</span>
        </h1>
        <p className="text-lab-muted max-w-2xl mb-6">
          The ingredients that fill supplement labels, decoded. What each one does, the dose
          that actually works, the safe limit, and an honest read on the evidence behind it.
        </p>
        <p className="text-sm text-lab-muted mb-10">
          Torn between two?{' '}
          <Link href="/ingredients-vs" className="text-lab-lime font-bold hover:underline underline-offset-2">
            Compare ingredients head-to-head →
          </Link>{' '}
          Shopping a whole category instead?{' '}
          <Link href="/guide" className="text-lab-lime font-bold hover:underline underline-offset-2">
            See the buyer&apos;s guides →
          </Link>{' '}
          Or jump to{' '}
          <Link href="/faq" className="text-lab-lime font-bold hover:underline underline-offset-2">
            common supplement questions →
          </Link>
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {sorted.map((ing) => (
            <Link
              key={ing.slug}
              href={`/ingredients/${ing.slug}`}
              className="group bg-lab-panel border border-lab-border rounded-2xl p-6 hover:border-lab-lime transition-colors"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <h2 className="text-lg font-black uppercase tracking-wide group-hover:text-lab-lime transition-colors">
                  {ing.name}
                </h2>
                <span
                  className={`shrink-0 text-[9px] uppercase tracking-widest font-bold border rounded-full px-2 py-1 ${EVIDENCE_STYLE[ing.evidence]}`}
                >
                  {ing.evidence}
                </span>
              </div>
              <p className="text-lab-muted text-sm leading-relaxed line-clamp-3">{ing.oneLiner}</p>
              <span className="inline-block mt-4 text-[11px] uppercase tracking-widest font-bold text-lab-lime">
                Read ingredient →
              </span>
            </Link>
          ))}
        </div>

        <p className="text-lab-muted/70 text-xs mt-10 leading-relaxed max-w-2xl">
          Evidence ratings reflect the strength of research behind each ingredient&apos;s headline
          benefit, not a promise of results for you. This is educational, not medical advice.
        </p>
      </div>
    </div>
  )
}
