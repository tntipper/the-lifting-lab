import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import ScoreBadge from '@/components/ScoreBadge'
import { categoryLabel, CATEGORIES } from '@/lib/categories'
import { buyLink } from '@/lib/affiliate'
import { createPublicClient } from '@/lib/supabase-public'
import { PRODUCT_COLUMNS, withScore, type Product, type ScoredProduct } from '@/lib/products'
import {
  buildBrandStats,
  curatedBrandMatchups,
  resolveBrandMatchup,
  type BrandStat,
} from '@/lib/brand-matchups'

// Static-generate the curated brand-matchup set at build, daily refresh.
// dynamicParams stays true (like /brand and /vs) so any valid brand pair renders
// on demand, while resolveBrandMatchup 404s unknown or thin-brand slugs. Only
// curated pairs are listed in the sitemap/hub, so this adds resilience without
// inviting thin/duplicate indexed pages.
export const revalidate = 86400
export const dynamicParams = true

const SITE = 'https://www.theliftinglab.co.uk'
const YEAR = 2026
const CATEGORY_ORDER = CATEGORIES.map((c) => c.slug)

async function getMatchup(matchup: string): Promise<[BrandStat, BrandStat] | null> {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('status', 'active')
    if (error || !data) return null
    const scored = (data as Product[]).map(withScore)
    return resolveBrandMatchup(matchup, buildBrandStats(scored))
  } catch {
    return null
  }
}

export async function generateStaticParams() {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('status', 'active')
    if (error || !data) return []
    const scored = (data as Product[]).map(withScore)
    return curatedBrandMatchups(buildBrandStats(scored)).map((m) => ({ matchup: m.slug }))
  } catch {
    return []
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ matchup: string }>
}): Promise<Metadata> {
  const { matchup } = await params
  const pair = await getMatchup(matchup)
  if (!pair) return { title: 'Brand comparison not found — The Lifting Lab' }
  const [a, b] = pair
  const url = `${SITE}/brands-vs/${matchup}`
  const t = `${a.brand} vs ${b.brand} — Which Supplement Brand Is Better? (UK ${YEAR}) | The Lifting Lab`
  const description = `${a.brand} vs ${b.brand}: average Effectiveness Match${
    a.avgScore != null && b.avgScore != null ? ` (${a.avgScore} vs ${b.avgScore})` : ''
  }, catalogue range and true cost per serving, scored against evidence-based dosing standards.`
  return {
    title: t,
    description,
    alternates: { canonical: url },
    openGraph: { title: t, description, url, type: 'website', siteName: 'The Lifting Lab' },
    twitter: { card: 'summary_large_image', title: t, description },
  }
}

// Top scored product a brand fields in a given category (products are pre-sorted desc).
function topIn(stat: BrandStat, category: string): ScoredProduct | undefined {
  return stat.products.find((p) => p.category === category && p.score != null)
}

export default async function BrandMatchupPage({
  params,
}: {
  params: Promise<{ matchup: string }>
}) {
  const { matchup } = await params
  const pair = await getMatchup(matchup)
  if (!pair) notFound()
  const [a, b] = pair
  const url = `${SITE}/brands-vs/${matchup}`

  // Winner on average Effectiveness Match.
  const scoreWinner =
    a.avgScore != null && b.avgScore != null
      ? a.avgScore === b.avgScore
        ? null
        : a.avgScore > b.avgScore
        ? a
        : b
      : null
  const scoreTie = a.avgScore != null && b.avgScore != null && a.avgScore === b.avgScore

  // Better value: lower average true cost per serving (only when both have it).
  const valueWinner =
    a.avgCostPerServing != null && b.avgCostPerServing != null
      ? a.avgCostPerServing < b.avgCostPerServing
        ? a
        : b
      : null

  // Categories both brands compete in — the genuinely per-pair head-to-head.
  const sharedCategories = a.categories
    .filter((c) => b.categories.includes(c))
    .sort((x, y) => CATEGORY_ORDER.indexOf(x) - CATEGORY_ORDER.indexOf(y))

  const verdictText = scoreTie
    ? `${a.brand} and ${b.brand} are level on average Effectiveness Match (${a.avgScore} each across our scored range).`
    : scoreWinner
    ? `${scoreWinner.brand} edges it on average Effectiveness Match (${scoreWinner.avgScore} vs ${
        scoreWinner === a ? b.avgScore : a.avgScore
      }) across the products we score.`
    : `Neither brand has enough scored products to call an average-score winner.`

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: 'Brand Comparisons', item: `${SITE}/brands-vs` },
      { name: `${a.brand} vs ${b.brand}`, item: url },
    ].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  }
  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${a.brand} vs ${b.brand}`,
    numberOfItems: 2,
    itemListElement: [a, b].map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Brand',
        name: s.brand,
        url: `${SITE}/brand/${s.slug}`,
      },
    })),
  }
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `Is ${a.brand} or ${b.brand} better?`,
        acceptedAnswer: { '@type': 'Answer', text: verdictText },
      },
      ...(valueWinner
        ? [
            {
              '@type': 'Question',
              name: `Which is better value, ${a.brand} or ${b.brand}?`,
              acceptedAnswer: {
                '@type': 'Answer',
                text: `${valueWinner.brand} averages the lower true cost per serving at £${valueWinner.avgCostPerServing!.toFixed(
                  2,
                )}, versus £${(valueWinner === a ? b.avgCostPerServing! : a.avgCostPerServing!).toFixed(
                  2,
                )} for ${valueWinner === a ? b.brand : a.brand}.`,
              },
            },
          ]
        : []),
    ],
  }

  const statRows: { label: string; a: string; b: string; winner: 'a' | 'b' | null }[] = [
    {
      label: 'Products scored',
      a: String(a.count),
      b: String(b.count),
      winner: a.count === b.count ? null : a.count > b.count ? 'a' : 'b',
    },
    {
      label: 'Categories covered',
      a: String(a.categories.length),
      b: String(b.categories.length),
      winner:
        a.categories.length === b.categories.length
          ? null
          : a.categories.length > b.categories.length
          ? 'a'
          : 'b',
    },
    {
      label: 'Avg Effectiveness Match',
      a: a.avgScore != null ? String(a.avgScore) : '—',
      b: b.avgScore != null ? String(b.avgScore) : '—',
      winner: scoreWinner ? (scoreWinner === a ? 'a' : 'b') : null,
    },
    {
      label: 'Best score',
      a: a.bestScore != null ? String(a.bestScore) : '—',
      b: b.bestScore != null ? String(b.bestScore) : '—',
      winner:
        a.bestScore != null && b.bestScore != null && a.bestScore !== b.bestScore
          ? a.bestScore > b.bestScore
            ? 'a'
            : 'b'
          : null,
    },
    {
      label: 'Avg cost / serving',
      a: a.avgCostPerServing != null ? `£${a.avgCostPerServing.toFixed(2)}` : '—',
      b: b.avgCostPerServing != null ? `£${b.avgCostPerServing.toFixed(2)}` : '—',
      winner: valueWinner ? (valueWinner === a ? 'a' : 'b') : null,
    },
  ]

  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <main className="max-w-3xl mx-auto px-6 py-12">
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-lab-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/" className="hover:text-white">Home</Link></li>
            <li aria-hidden className="text-lab-border">/</li>
            <li><Link href="/brands-vs" className="hover:text-white">Brand Comparisons</Link></li>
            <li aria-hidden className="text-lab-border">/</li>
            <li aria-current="page" className="text-white/80">{a.brand} vs {b.brand}</li>
          </ol>
        </nav>

        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Brand Showdown · {YEAR}
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          {a.brand} <span className="text-lab-lime">vs</span> {b.brand}
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-8">
          We score every {a.brand} and {b.brand} product against the same evidence-based clinical
          reference, so you can see which brand doses better, ranges wider and costs less per
          effective serving — judged on what is in the tub, never reputation or marketing.
        </p>

        {/* verdict */}
        <div className="bg-lab-panel border border-lab-lime/40 rounded-2xl p-5 lab-glow mb-10">
          <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">Verdict</p>
          <p className="text-white text-sm">{verdictText}</p>
          {valueWinner && (
            <p className="text-lab-muted text-xs mt-1">
              Better value per serving:{' '}
              <span className="text-white font-bold">{valueWinner.brand}</span> at{' '}
              <span className="text-lab-lime font-bold">
                £{valueWinner.avgCostPerServing!.toFixed(2)}/serving
              </span>{' '}
              on average.
            </p>
          )}
        </div>

        {/* stat comparison */}
        <div
          className="grid gap-3 mb-12"
          style={{ gridTemplateColumns: `minmax(120px,1.4fr) repeat(2, minmax(0,1fr))` }}
        >
          <div />
          {[a, b].map((s) => (
            <div key={s.slug} className="bg-lab-panel border border-lab-border rounded-xl p-4 text-center">
              <Link href={`/brand/${s.slug}`} className="hover:text-lab-lime transition-colors">
                <p className="text-white text-sm font-black leading-tight">{s.brand}</p>
              </Link>
              {scoreWinner?.slug === s.slug && (
                <p className="mt-2 text-[9px] uppercase tracking-widest font-black text-lab-lime">★ Higher avg</p>
              )}
            </div>
          ))}

          {statRows.map((row) => (
            <StatRow key={row.label} row={row} />
          ))}

          <div />
          {[a, b].map((s) => (
            <div key={s.slug} className="px-2 py-3 flex justify-center">
              <Link
                href={`/brand/${s.slug}`}
                className="w-full text-center text-[10px] font-black uppercase tracking-widest py-2 rounded-lg border border-lab-border text-lab-muted hover:text-white transition-colors"
              >
                {s.brand} range →
              </Link>
            </div>
          ))}
        </div>

        {/* category head-to-head — the unique, per-pair section */}
        {sharedCategories.length > 0 && (
          <section className="mb-12">
            <h2 className="text-xl font-black uppercase tracking-wide mb-1">
              Category <span className="text-lab-lime">head-to-head</span>
            </h2>
            <p className="text-lab-muted text-sm mb-5">
              Where both brands compete, here is each one&apos;s top-scoring pick.
            </p>
            <div className="space-y-4">
              {sharedCategories.map((cat) => {
                const pa = topIn(a, cat)
                const pb = topIn(b, cat)
                if (!pa || !pb) return null
                const aWins = (pa.score ?? -1) > (pb.score ?? -1)
                const bWins = (pb.score ?? -1) > (pa.score ?? -1)
                return (
                  <div key={cat} className="bg-lab-panel border border-lab-border rounded-2xl p-4">
                    <p className="text-[10px] uppercase tracking-widest text-lab-lime mb-3">
                      {categoryLabel(cat)}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <PickCard product={pa} brand={a.brand} winner={aWins} />
                      <PickCard product={pb} brand={b.brand} winner={bWins} />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* cross-links */}
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/brand/${a.slug}`}
            className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-4 py-2.5 rounded-lg transition-colors"
          >
            {a.brand} review →
          </Link>
          <Link
            href={`/brand/${b.slug}`}
            className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-4 py-2.5 rounded-lg transition-colors"
          >
            {b.brand} review →
          </Link>
          <Link
            href="/brands-vs"
            className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-4 py-2.5 rounded-lg transition-colors"
          >
            More brand showdowns →
          </Link>
        </div>

        <section className="mt-14 bg-lab-panel border border-lab-border rounded-2xl p-6">
          <h2 className="text-lg font-black uppercase tracking-wide mb-3">How we score</h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-3">
            Every product earns an Effectiveness Match score (0–100) measuring how closely its active
            ingredient doses match the evidence-based clinical reference for its category. Brand
            averages are taken across the products we score, so a brand is rewarded for consistently
            dosing well — not for one hero product. Proprietary blends and amino-spiked formulas are
            penalised because they hide the real dose. We are independent — scores are never
            influenced by brands or affiliate deals.
          </p>
          <p className="text-lab-muted/70 text-xs leading-relaxed">
            Informational only — not medical advice. Buy links are affiliate links; we may earn a
            commission at no extra cost to you. This never affects scoring.
          </p>
        </section>
      </main>
    </div>
  )
}

function StatRow({ row }: { row: { label: string; a: string; b: string; winner: 'a' | 'b' | null } }) {
  return (
    <>
      <div className="px-3 py-2.5 text-xs uppercase tracking-widest font-bold text-lab-muted border-b border-lab-border flex items-center">
        {row.label}
      </div>
      <div
        className={`px-3 py-2.5 text-sm border-b border-lab-border flex items-center justify-center font-medium ${
          row.winner === 'a' ? 'text-lab-lime font-black' : 'text-white'
        }`}
      >
        {row.a}
      </div>
      <div
        className={`px-3 py-2.5 text-sm border-b border-lab-border flex items-center justify-center font-medium ${
          row.winner === 'b' ? 'text-lab-lime font-black' : 'text-white'
        }`}
      >
        {row.b}
      </div>
    </>
  )
}

function PickCard({
  product,
  brand,
  winner,
}: {
  product: ScoredProduct
  brand: string
  winner: boolean
}) {
  const href = buyLink(product.brand, product.name, product.buy_url)
  return (
    <div className="flex flex-col items-center text-center">
      <ScoreBadge score={product.score} />
      <p className="text-[10px] uppercase tracking-widest text-lab-muted mt-2">{brand}</p>
      <Link href={`/products/${product.id}`} className="hover:text-lab-lime transition-colors">
        <p className="text-white text-xs font-bold leading-tight mt-0.5">{product.name}</p>
      </Link>
      {product.cost_per_serving != null && (
        <p className="text-[11px] text-white/60 mt-1">£{product.cost_per_serving.toFixed(2)}/serving</p>
      )}
      {winner && (
        <p className="mt-1 text-[9px] uppercase tracking-widest font-black text-lab-lime">★ Winner</p>
      )}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-2 w-full text-center text-[10px] font-black uppercase tracking-widest py-2 rounded-lg"
          style={{
            background: 'rgba(166,226,46,0.12)',
            color: '#a6e22e',
            border: '1px solid rgba(166,226,46,0.5)',
          }}
        >
          Buy →
        </a>
      )}
    </div>
  )
}
