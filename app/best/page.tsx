import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import ScoreBadge from '@/components/ScoreBadge'
import { categoryLabel } from '@/lib/categories'
import { CATEGORY_GROUPS } from '@/lib/category-groups'
import { GUIDE_SLUGS } from '@/lib/guides'
import { buyLink } from '@/lib/affiliate'
import { createPublicClient } from '@/lib/supabase-public'
import { PRODUCT_COLUMNS, withScore, type Product, type ScoredProduct } from '@/lib/products'

// SSG with a daily refresh so newly added/rescored products can change the
// category winners without a redeploy.
export const revalidate = 86400

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/best`
const YEAR = 2026

export const metadata: Metadata = {
  title: 'Best Supplements UK 2026 — The Lifting Lab Awards',
  description:
    'The highest-scoring supplement in every category for 2026, ranked against evidence-based reference doses. The single best whey, creatine, pre-workout, EAAs and more — by effectiveness, not brand reputation.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'Best Supplements UK 2026 — The Lifting Lab Awards',
    description:
      'The top-scoring supplement in every category for 2026, ranked against evidence-based reference doses.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Best Supplements UK 2026 — The Lifting Lab Awards',
    description:
      'The top-scoring supplement in every category for 2026, ranked by effectiveness not brand reputation.',
  },
}

type Winner = { category: string; product: ScoredProduct }

// Single server-side query, then derive the highest-scoring active product per
// category. Mirrors the guide page's fetch pattern (DB-failure safe: an empty
// result just renders the graceful empty state, never a 500).
async function categoryWinners(): Promise<Winner[]> {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('status', 'active')
    if (error || !data) return []
    const scored = (data as Product[]).map(withScore)
    const best = new Map<string, ScoredProduct>()
    for (const p of scored) {
      if (p.score == null) continue
      const cur = best.get(p.category)
      if (!cur || (cur.score ?? -1) < p.score) best.set(p.category, p)
    }
    return Array.from(best.entries()).map(([category, product]) => ({ category, product }))
  } catch {
    return []
  }
}

function fmt(n: number) {
  return n < 10 ? `£${n.toFixed(2)}` : `£${Math.round(n)}`
}

export default async function BestPage() {
  const winners = await categoryWinners()
  const byCategory = new Map(winners.map((w) => [w.category, w.product]))

  // Overall ranking — the highest-rated winners across every category. Powers
  // both the "Hall of Fame" hero list and the ItemList schema.
  const overall = [...winners]
    .sort((a, b) => (b.product.score ?? -1) - (a.product.score ?? -1))
    .slice(0, 5)

  // Per-group sections, in the same order the homepage browse grid uses, so the
  // page reads as a structured "best in every category" index.
  const sections = CATEGORY_GROUPS.map((g) => ({
    group: g,
    items: g.categories
      .map((slug) => {
        const product = byCategory.get(slug)
        return product ? { slug, product } : null
      })
      .filter((x): x is { slug: string; product: ScoredProduct } => x !== null),
  })).filter((s) => s.items.length > 0)

  // ItemList — the canonical "best X 2026" structured-data signal, backed 1:1 by
  // the visible Hall of Fame list; each entry resolves to a schema-rich product
  // page so Google can build a ranked carousel. Guarded so a DB hiccup never
  // emits an empty/invalid list.
  const itemListJsonLd = overall.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Best Supplements UK ${YEAR}`,
    description: `The highest-scoring supplements of ${YEAR}, ranked by The Lifting Lab Effectiveness Match score.`,
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

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: `Best Supplements ${YEAR}`, item: URL },
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-lab-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/" className="hover:text-white">Home</Link></li>
            <li aria-hidden className="text-lab-border">/</li>
            <li aria-current="page" className="text-white/80">Best Supplements {YEAR}</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          The Lifting Lab Awards · {YEAR}
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Best Supplements <span className="text-lab-lime">UK {YEAR}</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          The single highest-scoring supplement in every category, decided by one thing only:
          how closely each product&apos;s active doses match the evidence-based clinical
          reference for its category. No brand deals. No pay-to-win. Just the numbers.
        </p>
        <p className="text-lab-muted leading-relaxed mb-10">
          Every winner below earned the top Effectiveness Match score (0–100) in its category
          across the {winners.length} categories we currently track. Scores are recalculated as
          the catalogue updates, so this page always reflects the current pick.
        </p>

        {winners.length === 0 ? (
          <div className="text-center py-16 text-lab-muted">
            <p className="text-4xl mb-3">🏆</p>
            <p className="text-sm">Winners are being tallied. Check back shortly.</p>
          </div>
        ) : (
          <>
            {/* Hall of Fame — overall top picks */}
            {overall.length > 0 && (
              <section className="mb-14">
                <h2 className="text-xl font-black uppercase tracking-wide mb-1">
                  Hall of <span className="text-lab-lime">Fame</span>
                </h2>
                <p className="text-lab-muted text-sm mb-5">
                  The highest-rated products across every category this year.
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
                          Best {categoryLabel(w.product.category)}
                        </p>
                      </div>
                      <Link
                        href={`/products/${w.product.id}`}
                        className="text-[10px] uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-3 py-1.5 rounded-lg shrink-0"
                      >
                        View
                      </Link>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Per-category winners, grouped */}
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
                    return (
                      <div
                        key={p.id}
                        className="bg-lab-panel border border-lab-border rounded-xl p-4"
                      >
                        <div className="flex items-center gap-4">
                          <ScoreBadge score={p.score} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] uppercase tracking-widest text-lab-lime mb-0.5">
                              Best {categoryLabel(slug)}
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
                            {p.cost_per_serving != null && (
                              <p className="text-[11px] text-white/60 mt-1">
                                {fmt(p.cost_per_serving)} per serving
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-3">
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
                          <a
                            href={buyLink(p.brand, p.name, p.buy_url)}
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
                How winners are chosen
              </h2>
              <p className="text-lab-muted text-sm leading-relaxed mb-3">
                Each product earns an Effectiveness Match score (0–100) measuring how closely its
                active ingredient doses match the evidence-based clinical reference for its
                category. The highest scorer in each category takes the award. Cost per serving is
                shown for context but does not decide the winner.
              </p>
              <p className="text-lab-muted/70 text-xs leading-relaxed mb-5">
                Informational only — not medical advice. Buy links are affiliate links; we may earn
                a commission at no extra cost to you. This never affects scoring.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/wizard"
                  className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
                >
                  Build my stack →
                </Link>
                <Link
                  href="/value"
                  className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
                >
                  Best by value
                </Link>
                <Link
                  href="/products"
                  className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
                >
                  Browse all products
                </Link>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
