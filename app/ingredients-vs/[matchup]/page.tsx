import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import { categoryLabel } from '@/lib/categories'
import { GUIDE_SLUGS } from '@/lib/guides'
import { INGREDIENT_MATCHUP_SLUGS, resolveIngredientMatchup } from '@/lib/ingredient-matchups'
import type { EvidenceLevel, Ingredient } from '@/lib/ingredients'

// Pure-content pages: both ingredients come from local, vetted data, so no DB
// dependency. Static-generate the curated set; dynamicParams stays false since
// the matchup list is fixed and any unknown slug should 404.
export const dynamicParams = false

const SITE = 'https://www.theliftinglab.co.uk'

const EVIDENCE_STYLE: Record<EvidenceLevel, string> = {
  Strong: 'text-lab-lime border-lab-lime/50',
  Moderate: 'text-amber-400 border-amber-400/40',
  Limited: 'text-lab-muted border-lab-border',
}

export function generateStaticParams() {
  return INGREDIENT_MATCHUP_SLUGS.map((matchup) => ({ matchup }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ matchup: string }>
}): Promise<Metadata> {
  const { matchup } = await params
  const m = resolveIngredientMatchup(matchup)
  if (!m) return { title: 'Comparison not found — The Lifting Lab' }
  const url = `${SITE}/ingredients-vs/${m.slug}`
  return {
    title: m.metaTitle,
    description: m.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: m.metaTitle,
      description: m.metaDescription,
      url,
      type: 'article',
      siteName: 'The Lifting Lab',
    },
    twitter: { card: 'summary_large_image', title: m.metaTitle, description: m.metaDescription },
  }
}

export default async function IngredientMatchupPage({
  params,
}: {
  params: Promise<{ matchup: string }>
}) {
  const { matchup } = await params
  const m = resolveIngredientMatchup(matchup)
  if (!m) notFound()

  const url = `${SITE}/ingredients-vs/${m.slug}`
  const { ia, ib } = m
  const guides = m.guides.filter((g) => GUIDE_SLUGS.includes(g))

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: 'Ingredient Comparisons', item: `${SITE}/ingredients-vs` },
      { name: `${ia.name} vs ${ib.name}`, item: url },
    ].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  }

  // FAQPage — the curated matchup FAQs plus the verdict as a lead question, all
  // backed 1:1 by visible on-page content.
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `${ia.name} vs ${ib.name}: which should you take?`,
        acceptedAnswer: { '@type': 'Answer', text: m.verdict },
      },
      ...m.faqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    ],
  }

  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <article className="max-w-3xl mx-auto px-6 py-12">
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-lab-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/" className="hover:text-white">Home</Link></li>
            <li aria-hidden className="text-lab-border">/</li>
            <li><Link href="/ingredients-vs" className="hover:text-white">Ingredient Comparisons</Link></li>
            <li aria-hidden className="text-lab-border">/</li>
            <li aria-current="page" className="text-white/80">{ia.name} vs {ib.name}</li>
          </ol>
        </nav>

        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Ingredient Head-to-Head
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          {ia.name} <span className="text-lab-lime">vs</span> {ib.name}
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-8">{m.intro}</p>

        {/* verdict up top — the answer people came for */}
        <div className="bg-lab-panel border border-lab-lime/40 rounded-2xl p-5 lab-glow mb-10">
          <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">Verdict</p>
          <p className="text-white text-sm leading-relaxed">{m.verdict}</p>
        </div>

        {/* side-by-side "when to pick" cards */}
        <div className="grid gap-4 sm:grid-cols-2 mb-10">
          <PickCard ing={ia} bestFor={m.bestForA} slug={ia.slug} />
          <PickCard ing={ib} bestFor={m.bestForB} slug={ib.slug} />
        </div>

        {/* comparison table */}
        <div
          className="grid gap-3 mb-10"
          style={{ gridTemplateColumns: `minmax(90px,0.8fr) repeat(2, minmax(0,1fr))` }}
        >
          <div />
          {[ia, ib].map((ing) => (
            <div key={ing.slug} className="bg-lab-panel border border-lab-border rounded-xl p-4 text-center">
              <Link href={`/ingredients/${ing.slug}`} className="hover:text-lab-lime transition-colors">
                <p className="text-white text-sm font-bold leading-tight">{ing.name}</p>
              </Link>
              <span className={`inline-block mt-2 text-[9px] uppercase tracking-widest font-bold border rounded-full px-2 py-0.5 ${EVIDENCE_STYLE[ing.evidence]}`}>
                {ing.evidence}
              </span>
            </div>
          ))}

          <Cell head>Best for</Cell>
          <Cell>{m.bestForA}</Cell>
          <Cell>{m.bestForB}</Cell>

          <Cell head>Effective dose</Cell>
          {[ia, ib].map((ing) => (
            <Cell key={ing.slug}>{ing.dose}</Cell>
          ))}

          <Cell head>Safety</Cell>
          {[ia, ib].map((ing) => (
            <Cell key={ing.slug}>{ing.safety}</Cell>
          ))}

          <Cell head>Found in</Cell>
          {[ia, ib].map((ing) => (
            <Cell key={ing.slug}>{ing.foundIn}</Cell>
          ))}
        </div>

        {/* key difference + stacking */}
        <section className="mb-8">
          <h2 className="text-xl font-black uppercase tracking-wide mb-3">The key difference</h2>
          <p className="text-lab-muted leading-relaxed">{m.keyDifference}</p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-black uppercase tracking-wide mb-3">Should you take both?</h2>
          <p className="text-lab-muted leading-relaxed">{m.together}</p>
        </section>

        {/* cross-links: ingredient pages + guides + browse */}
        <div className="flex flex-wrap gap-2 mb-14">
          <Link
            href={`/ingredients/${ia.slug}`}
            className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-4 py-2.5 rounded-lg transition-colors"
          >
            {ia.name} guide →
          </Link>
          <Link
            href={`/ingredients/${ib.slug}`}
            className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-4 py-2.5 rounded-lg transition-colors"
          >
            {ib.name} guide →
          </Link>
          {guides.map((g) => (
            <Link
              key={g}
              href={`/guide/${g}`}
              className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-4 py-2.5 rounded-lg hover:opacity-90"
            >
              {categoryLabel(g)} buyer&apos;s guide →
            </Link>
          ))}
          <Link
            href="/ingredients-vs"
            className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-4 py-2.5 rounded-lg transition-colors"
          >
            More comparisons →
          </Link>
        </div>

        {/* FAQ */}
        <section className="mb-14">
          <h2 className="text-xl font-black uppercase tracking-wide mb-5">Frequently asked</h2>
          <div className="space-y-4">
            {m.faqs.map((f) => (
              <div key={f.q} className="bg-lab-panel border border-lab-border rounded-xl p-5">
                <h3 className="text-white text-sm font-bold mb-2">{f.q}</h3>
                <p className="text-lab-muted text-sm leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <p className="text-lab-muted/70 text-xs leading-relaxed">
          This comparison is educational and not medical advice. Doses are general guidance from the
          published research, not a personal prescription. Before starting any supplement that could
          affect a medical condition or interact with medication, speak to a qualified clinician.
        </p>

        <div className="mt-8 pt-8 border-t border-lab-border">
          <Link
            href="/ingredients-vs"
            className="text-xs uppercase tracking-widest font-bold text-lab-muted hover:text-white"
          >
            ← All ingredient comparisons
          </Link>
        </div>
      </article>
    </div>
  )
}

function PickCard({ ing, bestFor, slug }: { ing: Ingredient; bestFor: string; slug: string }) {
  return (
    <div className="bg-lab-panel border border-lab-border rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <Link href={`/ingredients/${slug}`} className="hover:text-lab-lime transition-colors">
          <h2 className="text-base font-black uppercase tracking-wide">{ing.name}</h2>
        </Link>
        <span className={`shrink-0 text-[9px] uppercase tracking-widest font-bold border rounded-full px-2 py-1 ${EVIDENCE_STYLE[ing.evidence]}`}>
          {ing.evidence}
        </span>
      </div>
      <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-lab-lime mb-1">Pick it when</p>
      <p className="text-lab-muted text-sm leading-relaxed">{bestFor}</p>
    </div>
  )
}

function Cell({ children, head }: { children: React.ReactNode; head?: boolean }) {
  return (
    <div
      className={`px-3 py-2.5 text-sm border-b border-lab-border ${
        head
          ? 'text-lab-muted text-xs uppercase tracking-widest font-bold flex items-center'
          : 'text-white/90 leading-relaxed'
      }`}
    >
      {children}
    </div>
  )
}
