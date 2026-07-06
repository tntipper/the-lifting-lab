import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import ScoreBadge from '@/components/ScoreBadge'
import { categoryLabel } from '@/lib/categories'
import { CATEGORY_GROUPS } from '@/lib/category-groups'
import { GUIDE_SLUGS } from '@/lib/guides'
import { buyLink } from '@/lib/affiliate'
import { fetchCheapest, MIN_SCORE, type CheapProduct } from '@/lib/cheapest'

// SSG with a daily refresh so price/serving + score updates flow into the
// cheapest-per-serving rankings without a redeploy.
export const revalidate = 86400

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/cheapest`
const YEAR = 2026

// Most products to list per category, cheapest first. Keeps each section
// substantive without dumping an entire catalogue on one page.
const MAX_PER_CATEGORY = 6
// Size of the overall cheapest leaderboard across all categories.
const OVERALL_LIMIT = 8

export const metadata: Metadata = {
  title: 'Cheapest Supplements Per Serving UK 2026 — Lowest Price Per Dose',
  description:
    'UK supplements ranked by the cheapest price per serving in every category, from whey and creatine to pre-workout and vitamins. Only products that pass our evidence-based dosing bar are ranked, so the cheapest pick still actually works.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'Cheapest Supplements Per Serving UK 2026 — Lowest Price Per Dose',
    description:
      'Every category ranked by absolute cost per serving, cheapest first — filtered to products that still pass our evidence-based dosing bar.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cheapest Supplements Per Serving UK 2026',
    description: 'UK supplements ranked by the cheapest price per serving that still works.',
  },
}

function fmtServing(n: number) {
  return `£${n.toFixed(2)}`
}

export default async function CheapestPage() {
  const rows = await fetchCheapest()

  // Overall cheapest-per-serving leaderboard across every category.
  const overall = rows.slice(0, OVERALL_LIMIT)

  // Per-group sections, each category fully ranked cheapest-first (capped).
  const byCategory = new Map<string, CheapProduct[]>()
  for (const r of rows) {
    const list = byCategory.get(r.category) ?? []
    list.push(r)
    byCategory.set(r.category, list)
  }

  const sections = CATEGORY_GROUPS.map((g) => ({
    group: g,
    items: g.categories
      .map((slug) => {
        const list = byCategory.get(slug)
        return list && list.length > 0 ? { slug, list: list.slice(0, MAX_PER_CATEGORY) } : null
      })
      .filter((x): x is { slug: string; list: CheapProduct[] } => x !== null),
  })).filter((s) => s.items.length > 0)

  // ItemList — the cheapest-per-serving signal, backed 1:1 by the visible
  // leaderboard; each entry resolves to a schema-rich product page. Ascending
  // order reflects the cheapest-first ranking.
  const itemListJsonLd =
    overall.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: `Cheapest Supplements Per Serving UK ${YEAR}`,
          description: `UK supplements ranked by the lowest cost per serving for ${YEAR}, filtered to products that pass our evidence-based dosing bar.`,
          itemListOrder: 'https://schema.org/ItemListOrderAscending',
          numberOfItems: overall.length,
          itemListElement: overall.map((r, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            item: {
              '@type': 'Product',
              name: r.name,
              brand: { '@type': 'Brand', name: r.brand },
              category: categoryLabel(r.category),
              url: `${SITE}/products/${r.id}`,
            },
          })),
        }
      : null

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How is cost per serving calculated?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'Cost per serving is the retail price divided by the number of servings in the container. It is the fairest way to compare products of different tub sizes, because a bigger, more expensive tub can still work out cheaper per serving than a small cheap one.',
        },
      },
      {
        '@type': 'Question',
        name: 'Is the cheapest supplement per serving always the best buy?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'Not always. Cheapest per serving is the right metric when you want the lowest price, but a slightly pricier product can score higher on effectiveness. Every product here first has to pass our Effectiveness Match bar, and we show its score alongside the price, so you can weigh cheapest against best-dosed. For the best effectiveness per pound, see our Best Value page.',
        },
      },
      {
        '@type': 'Question',
        name: 'Why do some cheap supplements not appear here?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'A product only ranks if it clears our evidence-based dosing bar (an Effectiveness Match of at least ' +
            MIN_SCORE +
            ') and has the price and servings data needed for an honest per-serving figure. A dirt-cheap tub that is under-dosed is deliberately excluded, because a low price for a dose that does not work is not a saving.',
        },
      },
    ],
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: `Cheapest Supplements Per Serving ${YEAR}`, item: URL },
    ].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  }

  const row = (r: CheapProduct, i: number, showRank: boolean) => {
    const hasGuide = GUIDE_SLUGS.includes(r.category)
    return (
      <div
        key={r.id}
        className="bg-lab-panel border rounded-xl p-4"
        style={
          showRank && i === 0
            ? { borderColor: 'rgba(166,226,46,0.45)', boxShadow: '0 0 22px rgba(166,226,46,0.12)' }
            : { borderColor: '#262626' }
        }
      >
        <div className="flex items-center gap-4">
          {showRank && (
            <span className="text-xl shrink-0 w-6 text-center">
              {['🥇', '🥈', '🥉'][i] ?? `#${i + 1}`}
            </span>
          )}
          <ScoreBadge score={r.score} size="sm" />
          <div className="min-w-0 flex-1">
            <Link href={`/products/${r.id}`} className="hover:text-lab-lime transition-colors">
              <p className="text-white text-sm font-black leading-tight truncate">{r.brand}</p>
            </Link>
            <p className="text-lab-muted text-xs truncate">{r.name}</p>
            <p className="text-[10px] uppercase tracking-widest text-lab-lime mt-1">
              Cheapest {categoryLabel(r.category)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lab-lime text-base font-black leading-none">
              {fmtServing(r.cost_per_serving)}
            </p>
            <p className="text-[9px] uppercase tracking-widest text-lab-muted mt-1">per serving</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <Link
            href={`/products/${r.id}`}
            className="text-center text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl border border-lab-border text-lab-muted hover:text-white transition-colors"
          >
            Details
          </Link>
          {hasGuide ? (
            <Link
              href={`/guide/${r.category}`}
              className="text-center text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl border border-lab-border text-lab-muted hover:text-white transition-colors"
            >
              Guide
            </Link>
          ) : (
            <Link
              href={`/products?category=${r.category}`}
              className="text-center text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl border border-lab-border text-lab-muted hover:text-white transition-colors"
            >
              See all
            </Link>
          )}
          <a
            href={buyLink(r.brand, r.name, r.buy_url)}
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
            <li>
              <Link href="/" className="hover:text-white">
                Home
              </Link>
            </li>
            <li aria-hidden className="text-lab-border">
              /
            </li>
            <li aria-current="page" className="text-white/80">
              Cheapest Per Serving {YEAR}
            </li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Lowest Price Per Serving · {YEAR}
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Cheapest Supplements <span className="text-lab-lime">Per Serving UK {YEAR}</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          Every category ranked by the one number that decides what you actually pay: the cost of a
          single serving. Tub price is misleading — a bigger, pricier tub often works out cheaper per
          serving than a small cheap one.
        </p>
        <p className="text-lab-muted leading-relaxed mb-10">
          To keep it honest, a product only appears once it passes our Effectiveness Match bar (score{' '}
          {MIN_SCORE}+), so the cheapest pick still actually works. Want the best effectiveness per
          pound instead of the flat cheapest?{' '}
          <Link href="/value" className="text-lab-lime hover:underline">
            See Best Value
          </Link>
          .
        </p>

        {rows.length === 0 ? (
          <div className="text-center py-16 text-lab-muted">
            <p className="text-4xl mb-3">🏷️</p>
            <p className="text-sm">Cheapest-per-serving rankings are being tallied. Check back shortly.</p>
          </div>
        ) : (
          <>
            {/* Overall cheapest leaderboard */}
            {overall.length > 0 && (
              <section className="mb-14">
                <h2 className="text-xl font-black uppercase tracking-wide mb-1">
                  Cheapest <span className="text-lab-lime">Per Serving</span>
                </h2>
                <p className="text-lab-muted text-sm mb-5">
                  The lowest cost-per-serving picks across every category that still pass our dosing
                  bar.
                </p>
                <div className="space-y-3">{overall.map((r, i) => row(r, i, true))}</div>
              </section>
            )}

            {/* Per-group sections, each category cheapest-first */}
            {sections.map(({ group, items }) => (
              <section key={group.slug} className="mb-12">
                <h2 className="text-lg font-black uppercase tracking-wide mb-1">{group.label}</h2>
                <p className="text-lab-muted text-xs uppercase tracking-widest mb-4">
                  {group.tagline}
                </p>
                {items.map(({ slug, list }) => (
                  <div key={slug} className="mb-6">
                    <h3 className="text-sm font-black uppercase tracking-widest text-white/80 mb-3">
                      {categoryLabel(slug)}
                    </h3>
                    <div className="space-y-3">{list.map((r, i) => row(r, i, false))}</div>
                  </div>
                ))}
              </section>
            ))}

            {/* methodology + funnel */}
            <section className="mt-14 bg-lab-panel border border-lab-border rounded-2xl p-6">
              <h2 className="text-lg font-black uppercase tracking-wide mb-3">
                How cheapest per serving is worked out
              </h2>
              <p className="text-lab-muted text-sm leading-relaxed mb-3">
                Cost per serving is simply the retail price divided by the servings in the container.
                We rank the products that pass our Effectiveness Match bar (score {MIN_SCORE}+) from
                cheapest per serving upward, so you get the lowest price for a dose that still works —
                not the lowest price full stop. Rankings recalculate as prices change.
              </p>
              <p className="text-lab-muted/70 text-xs leading-relaxed mb-5">
                Informational only — not medical advice. Buy links are affiliate links; we may earn a
                commission at no extra cost to you. This never affects scoring or rankings.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/value"
                  className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
                >
                  Best value (per pound) →
                </Link>
                <Link
                  href="/best"
                  className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
                >
                  Best by score
                </Link>
                <Link
                  href="/protein-value"
                  className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
                >
                  Protein £/gram
                </Link>
                <Link
                  href="/products?sort=budget"
                  className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
                >
                  Browse cheapest
                </Link>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
