import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import { INGREDIENT_MATCHUPS, resolveIngredientMatchup } from '@/lib/ingredient-matchups'
import type { EvidenceLevel } from '@/lib/ingredients'

const SITE = 'https://www.theliftinglab.co.uk'

export const metadata: Metadata = {
  title: 'Ingredient Comparisons: Creatine vs Beta-Alanine and More | The Lifting Lab',
  description:
    'Head-to-head comparisons of the ingredients people confuse: creatine vs beta-alanine, caffeine vs theanine, magnesium vs zinc. What each does, when to pick which, and whether to take both.',
  alternates: { canonical: `${SITE}/ingredients-vs` },
  openGraph: {
    title: 'Supplement Ingredient Comparisons | The Lifting Lab',
    description:
      'Evidence-based, plain-English head-to-heads for the ingredients people mix up. Pick the right one, or learn why you want both.',
    url: `${SITE}/ingredients-vs`,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
}

const EVIDENCE_STYLE: Record<EvidenceLevel, string> = {
  Strong: 'text-lab-lime border-lab-lime/50',
  Moderate: 'text-amber-400 border-amber-400/40',
  Limited: 'text-lab-muted border-lab-border',
}

export default function IngredientsVsIndex() {
  // Resolve so the cards can show each ingredient's real name + evidence tier.
  const matchups = INGREDIENT_MATCHUPS.map((m) => resolveIngredientMatchup(m.slug)).filter(
    (m): m is NonNullable<typeof m> => m != null,
  )

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Supplement ingredient comparisons',
    description:
      'Head-to-head comparisons of commonly-confused supplement ingredients, with the effective dose and when to choose each.',
    numberOfItems: matchups.length,
    itemListElement: matchups.map((m, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: `${m.ia.name} vs ${m.ib.name}`,
      url: `${SITE}/ingredients-vs/${m.slug}`,
    })),
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: 'Ingredient Comparisons', item: `${SITE}/ingredients-vs` },
    ].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  }

  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <div className="max-w-4xl mx-auto px-6 py-12">
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-lab-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="hover:text-white">Home</Link>
            </li>
            <li aria-hidden className="text-lab-border">/</li>
            <li aria-current="page" className="text-white/80">Ingredient Comparisons</li>
          </ol>
        </nav>

        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Ingredient Head-to-Head
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight mb-3">
          Creatine or <span className="text-lab-lime">beta-alanine?</span>
        </h1>
        <p className="text-lab-muted max-w-2xl mb-6">
          The ingredients people mix up, settled. Each comparison shows what the two actually do,
          the effective dose, when to reach for which — and, honestly, when you should just take
          both. Evidence-based and UK-focused.
        </p>
        <p className="text-sm text-lab-muted mb-10">
          Want the full picture on one ingredient?{' '}
          <Link href="/ingredients" className="text-lab-lime font-bold hover:underline underline-offset-2">
            Browse the ingredient library →
          </Link>{' '}
          Or see{' '}
          <Link href="/faq" className="text-lab-lime font-bold hover:underline underline-offset-2">
            common supplement questions →
          </Link>
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {matchups.map((m) => (
            <Link
              key={m.slug}
              href={`/ingredients-vs/${m.slug}`}
              className="group bg-lab-panel border border-lab-border rounded-2xl p-6 hover:border-lab-lime transition-colors"
            >
              <h2 className="text-lg font-black uppercase tracking-wide group-hover:text-lab-lime transition-colors mb-3">
                {m.ia.name} <span className="text-lab-lime">vs</span> {m.ib.name}
              </h2>
              <div className="flex flex-wrap gap-2 mb-3">
                <span className={`text-[9px] uppercase tracking-widest font-bold border rounded-full px-2 py-1 ${EVIDENCE_STYLE[m.ia.evidence]}`}>
                  {m.ia.name}: {m.ia.evidence}
                </span>
                <span className={`text-[9px] uppercase tracking-widest font-bold border rounded-full px-2 py-1 ${EVIDENCE_STYLE[m.ib.evidence]}`}>
                  {m.ib.name}: {m.ib.evidence}
                </span>
              </div>
              <p className="text-lab-muted text-sm leading-relaxed line-clamp-3">{m.intro}</p>
              <span className="inline-block mt-4 text-[11px] uppercase tracking-widest font-bold text-lab-lime">
                Compare →
              </span>
            </Link>
          ))}
        </div>

        <p className="text-lab-muted/70 text-xs mt-10 leading-relaxed max-w-2xl">
          These comparisons are educational, not medical advice. Doses are general guidance from the
          published research, not a personal prescription. Evidence ratings reflect the strength of
          research behind each ingredient&apos;s headline benefit, not a promise of results for you.
        </p>
      </div>
    </div>
  )
}
