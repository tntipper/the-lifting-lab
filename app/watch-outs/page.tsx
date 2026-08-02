import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import ScoreBadge from '@/components/ScoreBadge'
import { categoryLabel } from '@/lib/categories'
import { CATEGORY_GROUPS } from '@/lib/category-groups'
import { GUIDE_SLUGS } from '@/lib/guides'
import { buyLink } from '@/lib/affiliate'
import { categoryWatchOuts, type CategoryWatchOut } from '@/lib/watch-outs'

// SSG with a daily refresh so re-scored / added / removed products flow through
// without a redeploy — matches the /best and /value hubs.
export const revalidate = 86400

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/watch-outs`
const YEAR = 2026

export const metadata: Metadata = {
  title: 'Supplement Watch-Outs UK 2026 — What to Avoid & Buy Instead',
  description:
    'The lowest-scoring supplements in each category, flagged against evidence-based reference doses — proprietary blends, amino-spiking and underdosed formulas — each paired with a higher-scoring pick to buy instead.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'Supplement Watch-Outs UK 2026 — What to Avoid & Buy Instead',
    description:
      'The lowest-scoring supplements in each category, flagged against evidence-based reference doses, each with a better-scoring alternative.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Supplement Watch-Outs UK 2026 — What to Avoid & Buy Instead',
    description:
      'The lowest-scoring supplements in each category, each paired with a higher-scoring pick to buy instead.',
  },
}

function fmt(n: number) {
  return n < 10 ? `£${n.toFixed(2)}` : `£${Math.round(n)}`
}

export default async function WatchOutsPage() {
  const watchOuts = await categoryWatchOuts()
  const byCategory = new Map<string, CategoryWatchOut>(watchOuts.map((w) => [w.category, w]))

  // Group into the same browse-order sections the /best hub uses, so the page
  // reads as a structured index rather than a random dump.
  const sections = CATEGORY_GROUPS.map((g) => ({
    group: g,
    items: g.categories
      .map((slug) => byCategory.get(slug))
      .filter((x): x is CategoryWatchOut => x != null),
  })).filter((s) => s.items.length > 0)

  const totalFlagged = watchOuts.reduce((n, w) => n + w.flagged.length, 0)

  // ItemList schema — deliberately built from the BETTER picks (positive,
  // product-page-resolving entities), backed 1:1 by the "buy instead" cards on
  // the page. We never emit structured data asserting a product is bad.
  const betterPicks = watchOuts.map((w) => w.best)
  const itemListJsonLd =
    betterPicks.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: `Better-scoring supplement picks UK ${YEAR}`,
          description: `Higher-scoring alternatives to the lowest-rated products in each category, by The Lifting Lab Effectiveness Match score.`,
          numberOfItems: betterPicks.length,
          itemListElement: betterPicks.map((p, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            item: {
              '@type': 'Product',
              name: p.name,
              brand: { '@type': 'Brand', name: p.brand },
              category: categoryLabel(p.category),
              url: `${SITE}/products/${p.id}`,
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
        name: 'How do you decide a supplement is a watch-out?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'A product is listed only when it scores below our 50 Effectiveness Match pass bar and there is a clearly better-scoring alternative in the same category. The score measures how closely a product’s active doses match the evidence-based clinical reference for its category. It is our editorial opinion, not a claim that a product is defective or unsafe.',
        },
      },
      {
        '@type': 'Question',
        name: 'What makes a supplement score low?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Common reasons are underdosed active ingredients versus the evidence-based reference, proprietary blends that hide individual doses on the label, amino-spiking that inflates stated protein, and a high cost per serving for the effectiveness delivered.',
        },
      },
      {
        '@type': 'Question',
        name: 'Are these products unsafe?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'No. A low score means a formula is underdosed or poor value versus the best in its category, not that it is unsafe. Always check the current label and consult a qualified professional for medical advice. This page is informational only.',
        },
      },
    ],
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: 'Watch-Outs', item: URL },
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
            <li aria-current="page" className="text-white/80">Watch-Outs</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold mb-4" style={{ color: '#e05a2b' }}>
          The Lifting Lab · Red Flags · {YEAR}
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Supplement <span style={{ color: '#e05a2b' }}>Watch-Outs</span> UK {YEAR}
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          The other side of the scoreboard. These are the lowest-scoring products in each
          category — underdosed formulas, proprietary blends and poor value versus the
          evidence-based reference. Every one is paired with a higher-scoring pick to buy instead.
        </p>
        <p className="text-lab-muted leading-relaxed mb-8">
          {totalFlagged > 0
            ? `We currently flag ${totalFlagged} products across ${watchOuts.length} categories. A product only appears here when it scores below our 50 pass bar and a clearly better option exists.`
            : 'Scores are being tallied. Check back shortly.'}
        </p>

        {/* disclaimer — keeps the framing honest and defensible */}
        <div
          className="rounded-2xl p-5 mb-10 text-sm leading-relaxed"
          style={{ background: 'rgba(224,90,43,0.06)', border: '1px solid rgba(224,90,43,0.35)' }}
        >
          <p className="text-white/85">
            <strong className="uppercase tracking-wide text-xs" style={{ color: '#e05a2b' }}>
              How to read this
            </strong>
            <br />
            A watch-out is a product that misses our evidence-based dosing bar and is beaten by a
            better option — not a claim that it is unsafe or defective. Scores reflect The Lifting
            Lab Effectiveness Match methodology (label doses vs reference ranges) and are our
            editorial opinion. Always check the current product label; this page is informational
            only and not medical advice.
          </p>
        </div>

        {watchOuts.length === 0 ? (
          <div className="text-center py-16 text-lab-muted">
            <p className="text-4xl mb-3">🚩</p>
            <p className="text-sm">No watch-outs to show right now. Check back shortly.</p>
          </div>
        ) : (
          <>
            {sections.map(({ group, items }) => (
              <section key={group.slug} className="mb-14">
                <h2 className="text-lg font-black uppercase tracking-wide mb-1">{group.label}</h2>
                <p className="text-lab-muted text-xs uppercase tracking-widest mb-5">
                  {group.tagline}
                </p>

                {items.map((w) => {
                  const slug = w.category
                  const hasGuide = GUIDE_SLUGS.includes(slug)
                  const best = w.best
                  return (
                    <div key={slug} className="mb-8">
                      <h3 className="text-sm font-black uppercase tracking-widest text-white/80 mb-3">
                        {categoryLabel(slug)}
                      </h3>

                      {/* flagged products */}
                      <div className="space-y-3">
                        {w.flagged.map(({ product: p, reasons }) => (
                          <div
                            key={p.id}
                            className="bg-lab-panel border rounded-xl p-4"
                            style={{ borderColor: 'rgba(224,90,43,0.3)' }}
                          >
                            <div className="flex items-center gap-4">
                              <ScoreBadge score={p.score} />
                              <div className="min-w-0 flex-1">
                                <span
                                  className="inline-block text-[9px] uppercase tracking-widest font-black px-2 py-0.5 rounded mb-1"
                                  style={{ background: 'rgba(224,90,43,0.15)', color: '#e05a2b' }}
                                >
                                  🚩 Watch-out
                                </span>
                                <Link
                                  href={`/products/${p.id}`}
                                  className="block hover:text-lab-lime transition-colors"
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
                            <ul className="mt-3 space-y-1.5">
                              {reasons.map((r, i) => (
                                <li key={i} className="flex gap-2 text-xs text-white/70 leading-snug">
                                  <span aria-hidden style={{ color: '#e05a2b' }}>•</span>
                                  <span>{r}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>

                      {/* buy-instead card — the funnel */}
                      <div
                        className="mt-3 bg-lab-panel border rounded-xl p-4"
                        style={{
                          borderColor: 'rgba(166,226,46,0.4)',
                          boxShadow: '0 0 18px rgba(166,226,46,0.08)',
                        }}
                      >
                        <div className="flex items-center gap-4">
                          <ScoreBadge score={best.score} />
                          <div className="min-w-0 flex-1">
                            <span className="inline-block text-[9px] uppercase tracking-widest font-black text-lab-lime mb-1">
                              ✅ Buy instead — Best {categoryLabel(slug)}
                            </span>
                            <Link
                              href={`/products/${best.id}`}
                              className="block hover:text-lab-lime transition-colors"
                            >
                              <p className="text-white text-sm font-black leading-tight truncate">
                                {best.brand}
                              </p>
                            </Link>
                            <p className="text-lab-muted text-xs truncate">{best.name}</p>
                            {best.cost_per_serving != null && (
                              <p className="text-[11px] text-white/60 mt-1">
                                {fmt(best.cost_per_serving)} per serving
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-3">
                          <Link
                            href={`/products/${best.id}`}
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
                            href={buyLink(best.brand, best.name, best.buy_url)}
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
                    </div>
                  )
                })}
              </section>
            ))}

            {/* methodology + funnel */}
            <section className="mt-4 bg-lab-panel border border-lab-border rounded-2xl p-6">
              <h2 className="text-lg font-black uppercase tracking-wide mb-3">
                How watch-outs are decided
              </h2>
              <p className="text-lab-muted text-sm leading-relaxed mb-3">
                Every product earns an Effectiveness Match score (0–100) measuring how closely its
                active doses match the evidence-based clinical reference for its category. A product
                is flagged here only when it scores below our 50 pass bar and a clearly
                higher-scoring option exists in the same category.{' '}
                <Link href="/methodology" className="text-lab-lime hover:underline">
                  See the full methodology →
                </Link>{' '}
                <Link href="/glossary" className="text-lab-lime hover:underline">
                  Decode the label jargon →
                </Link>
              </p>
              <p className="text-lab-muted/70 text-xs leading-relaxed mb-5">
                Informational only — not medical advice. Buy links are affiliate links; we may earn
                a commission at no extra cost to you. This never affects scoring.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/best"
                  className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
                >
                  See the winners →
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
