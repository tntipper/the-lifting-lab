import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import ScoreBadge from '@/components/ScoreBadge'
import { categoryLabel } from '@/lib/categories'
import { CATEGORY_GROUPS } from '@/lib/category-groups'
import { GUIDE_SLUGS } from '@/lib/guides'
import { buyLink } from '@/lib/affiliate'
import { createPublicClient } from '@/lib/supabase-public'
import { PRODUCT_COLUMNS, hasVerifiedCost, withScore, type Product, type ScoredProduct } from '@/lib/products'

// SSG with a daily refresh so price/serving + score updates flow into the value
// rankings without a redeploy.
export const revalidate = 86400

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/value`
const YEAR = 2026

// Only products that are clinically credible should appear on a value page — a
// dirt-cheap product that does nothing is not "good value". Require a passing
// Effectiveness Match before ranking on price.
const MIN_SCORE = 50

export const metadata: Metadata = {
  title: 'Best Value Supplements UK 2026 — Lowest True Cost per Serving',
  description:
    'The best-value supplement in every category for 2026, ranked by True Cost: price per full effective serving against evidence-based dosing. The cheapest creatine, whey, pre-workout and more that still actually work.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'Best Value Supplements UK 2026 — Lowest True Cost per Serving',
    description:
      'The best-value supplement in every category for 2026, ranked by True Cost: effectiveness per pound, not sticker price.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Best Value Supplements UK 2026 — Lowest True Cost per Serving',
    description:
      'The best-value supplement in every category for 2026, ranked by effectiveness per pound.',
  },
}

type ValueProduct = ScoredProduct & { cost_per_serving: number; score: number; valueRatio: number }
type Winner = { category: string; product: ValueProduct }

// Single server-side query, then keep only credibly-scored, priced products and
// derive the best value (highest Effectiveness Match per £ per serving) in each
// category. DB-failure safe: an empty result renders the graceful empty state,
// never a 500. Mirrors the /best page's fetch pattern.
async function categoryWinners(): Promise<Winner[]> {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('status', 'active')
    if (error || !data) return []
    const eligible: ValueProduct[] = (data as Product[])
      .map(withScore)
      .flatMap((p) =>
        p.score != null && p.score >= MIN_SCORE && hasVerifiedCost(p)
          ? [{ ...p, score: p.score, cost_per_serving: p.cost_per_serving, valueRatio: p.score / p.cost_per_serving }]
          : [],
      )
    const best = new Map<string, ValueProduct>()
    for (const p of eligible) {
      const cur = best.get(p.category)
      if (!cur || cur.valueRatio < p.valueRatio) best.set(p.category, p)
    }
    return Array.from(best.entries()).map(([category, product]) => ({ category, product }))
  } catch {
    return []
  }
}

function fmtServing(n: number) {
  return `£${n.toFixed(2)}`
}

export default async function ValuePage() {
  const winners = await categoryWinners()
  const byCategory = new Map(winners.map((w) => [w.category, w.product]))

  // Overall value leaderboard — the strongest effectiveness-per-pound picks
  // across every category. Powers both the visible leaderboard and ItemList.
  const overall = [...winners]
    .sort((a, b) => b.product.valueRatio - a.product.valueRatio)
    .slice(0, 6)

  // Per-group sections, in the same order the homepage browse grid uses.
  const sections = CATEGORY_GROUPS.map((g) => ({
    group: g,
    items: g.categories
      .map((slug) => {
        const product = byCategory.get(slug)
        return product ? { slug, product } : null
      })
      .filter((x): x is { slug: string; product: ValueProduct } => x !== null),
  })).filter((s) => s.items.length > 0)

  // ItemList — the canonical "best value X 2026" signal, backed 1:1 by the
  // visible leaderboard; each entry resolves to a schema-rich product page.
  const itemListJsonLd = overall.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Best Value Supplements UK ${YEAR}`,
    description: `The best-value supplements of ${YEAR}, ranked by True Cost — Effectiveness Match per £ per serving.`,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    numberOfItems: overall.length,
    itemListElement: overall.map((w, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: w.product.name,
        brand: { '@type': 'Brand', name: w.product.brand },
        category: categoryLabel(w.product.category),
        url: `${SITE}/products/${w.product.id}`,
      },
    })),
  } : null

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What does best value mean on The Lifting Lab?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'Best value is not the cheapest tub on the shelf. We rank by True Cost — the price of one full, evidence-based effective serving — and only include products that already earn a passing Effectiveness Match score. A cheap product that is under-dosed is poor value; the winners deliver the most clinical effect per pound.',
        },
      },
      {
        '@type': 'Question',
        name: 'How is True Cost per serving calculated?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'True Cost per serving is the retail price divided by the number of servings in the container. Where a product needs more than one scoop to reach an effective clinical dose, the per-serving cost reflects what you actually pay to get a working dose, not the marketing serving size.',
        },
      },
      {
        '@type': 'Question',
        name: 'Is the cheapest supplement always the best buy?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'No. Many budget supplements cut the dose or use cheaper, less-studied forms. We balance price against the Effectiveness Match score so the value winners are products that are both affordable and properly dosed.',
        },
      },
    ],
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: `Best Value Supplements ${YEAR}`, item: URL },
    ].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  }

  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      {itemListJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
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
            <li aria-current="page" className="text-white/80">Best Value Supplements {YEAR}</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          True Cost Rankings · {YEAR}
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Best Value Supplements <span className="text-lab-lime">UK {YEAR}</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          The best-value pick in every category, ranked by True Cost: the price of one full,
          evidence-based effective serving. Cheap means nothing if the dose does not work, so every
          product here first has to earn a passing Effectiveness Match score.
        </p>
        <p className="text-lab-muted leading-relaxed mb-10">
          Winners are the products delivering the most clinical effect per pound across the{' '}
          {winners.length} categories we currently price. Rankings recalculate as prices and the
          catalogue change, so this page always reflects the current best buy.
        </p>

        {winners.length === 0 ? (
          <div className="text-center py-16 text-lab-muted">
            <p className="text-4xl mb-3">💷</p>
            <p className="text-sm">Value picks are being tallied. Check back shortly.</p>
          </div>
        ) : (
          <>
            {/* Value leaderboard — overall best effectiveness-per-pound */}
            {overall.length > 0 && (
              <section className="mb-14">
                <h2 className="text-xl font-black uppercase tracking-wide mb-1">
                  Value <span className="text-lab-lime">Leaderboard</span>
                </h2>
                <p className="text-lab-muted text-sm mb-5">
                  The strongest effectiveness-per-pound picks across every category this year.
                </p>
                <div className="space-y-3">
                  {overall.map((w, i) => (
                    <div
                      key={w.product.id}
                      className="flex items-center gap-4 bg-lab-panel border rounded-xl p-4"
                      style={i === 0 ? {
                        borderColor: 'rgba(166,226,46,0.45)',
                        boxShadow: '0 0 22px rgba(166,226,46,0.12)',
                      } : { borderColor: '#262626' }}
                    >
                      <span className="text-xl shrink-0 w-6 text-center">
                        {['🥇', '🥈', '🥉'][i] ?? `#${i + 1}`}
                      </span>
                      <ScoreBadge score={w.product.score} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-sm font-bold truncate">{w.product.brand}</p>
                        <p className="text-lab-muted text-xs truncate">{w.product.name}</p>
                        <p className="text-[10px] uppercase tracking-widest text-lab-lime mt-1">
                          Best value {categoryLabel(w.product.category)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-lab-lime text-sm font-black leading-none">
                          {fmtServing(w.product.cost_per_serving)}
                        </p>
                        <p className="text-[9px] uppercase tracking-widest text-lab-muted mt-1">
                          per serving
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Per-category value winners, grouped */}
            {sections.map(({ group, items }) => (
              <section key={group.slug} className="mb-12">
                <h2 className="text-lg font-black uppercase tracking-wide mb-1">
                  {group.label}
                </h2>
                <p className="text-lab-muted text-xs uppercase tracking-widest mb-4">
                  {group.tagline}
                </p>
                <div className="space-y-3">
                  {items.map(({ slug, product: p }) => {
                    const hasGuide = GUIDE_SLUGS.includes(slug)
                    const href = buyLink(p.brand, p.name, p.buy_url)
                    return (
                      <div
                        key={p.id}
                        className="bg-lab-panel border border-lab-border rounded-xl p-4"
                      >
                        <div className="flex items-center gap-4">
                          <ScoreBadge score={p.score} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] uppercase tracking-widest text-lab-lime mb-0.5">
                              Best value {categoryLabel(slug)}
                            </p>
                            <Link
                              href={`/products/${p.id}`}
                              className="hover:text-lab-lime transition-colors"
                            >
                              <p className="text-white text-sm font-black leading-tight truncate">
                                {p.brand}
                              </p>
                            </Link>
                            <p className="text-lab-muted text-xs truncate">{p.name}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-lab-lime text-base font-black leading-none">
                              {fmtServing(p.cost_per_serving)}
                            </p>
                            <p className="text-[9px] uppercase tracking-widest text-lab-muted mt-1">
                              per serving
                            </p>
                          </div>
                        </div>
                        <div className={`grid ${href ? 'grid-cols-3' : 'grid-cols-2'} gap-2 mt-3`}>
                          <Link
                            href={`/products/${p.id}`}
                            className="text-center text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl border border-lab-border text-lab-muted hover:text-white transition-colors"
                          >
                            Details
                          </Link>
                          {hasGuide ? (
                            <Link
                              href={`/guide/${slug}`}
                              className="text-center text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl border border-lab-border text-lab-muted hover:text-white transition-colors"
                            >
                              Guide
                            </Link>
                          ) : (
                            <Link
                              href={`/products?category=${slug}`}
                              className="text-center text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl border border-lab-border text-lab-muted hover:text-white transition-colors"
                            >
                              See all
                            </Link>
                          )}
                          {href && (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="text-center text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl"
                              style={{
                                background: 'rgba(166,226,46,0.12)',
                                color: '#a6e22e',
                                border: '1px solid rgba(166,226,46,0.5)',
                              }}
                            >
                              Buy
                            </a>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}

            {/* methodology + funnel */}
            <section className="mt-14 bg-lab-panel border border-lab-border rounded-2xl p-6">
              <h2 className="text-lg font-black uppercase tracking-wide mb-3">
                How value is judged
              </h2>
              <p className="text-lab-muted text-sm leading-relaxed mb-3">
                Each product earns an Effectiveness Match score (0–100) measuring how closely its
                active doses match the evidence-based clinical reference for its category. We then
                rank the products that pass (score {MIN_SCORE}+) by True Cost — price per full
                effective serving — so the value winner is the cheapest product that actually works,
                not the cheapest product full stop.
              </p>
              <p className="text-lab-muted/70 text-xs leading-relaxed mb-5">
                Informational only — not medical advice. Buy links are affiliate links; we may earn
                a commission at no extra cost to you. This never affects scoring or rankings.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/best"
                  className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
                >
                  Best by score →
                </Link>
                <Link
                  href="/wizard"
                  className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
                >
                  Build my stack
                </Link>
                <Link
                  href="/cheapest"
                  className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
                >
                  Cheapest per serving
                </Link>
                <Link
                  href="/protein-value"
                  className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
                >
                  Protein £/gram
                </Link>
                <Link
                  href="/products?sort=value"
                  className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
                >
                  Browse by value
                </Link>
                <Link
                  href="/watch-outs"
                  className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
                >
                  Watch-outs
                </Link>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
