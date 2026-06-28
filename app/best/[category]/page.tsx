import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import ScoreBadge from '@/components/ScoreBadge'
import { CATEGORIES, categoryLabel } from '@/lib/categories'
import { GUIDE_SLUGS, GUIDES } from '@/lib/guides'
import { buyLink } from '@/lib/affiliate'
import type { ScoredProduct } from '@/lib/products'
import {
  MIN_RANKED,
  TOP_N,
  deriveAwards,
  rankedCategorySlugs,
  rankedProducts,
} from '@/lib/best-categories'

// SSG with a daily refresh so newly added/rescored products reorder the ranking
// without a redeploy. Mirrors /best, /guide and /stacks.
export const revalidate = 86400
// Categories added/grown later still render on demand; the page itself guards on
// MIN_RANKED so a thin category never publishes a ranking.
export const dynamicParams = true

const SITE = 'https://www.theliftinglab.co.uk'
const YEAR = 2026

export async function generateStaticParams() {
  const slugs = await rankedCategorySlugs()
  return slugs.map((category) => ({ category }))
}

const isKnown = (slug: string) => CATEGORIES.some((c) => c.slug === slug)

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>
}): Promise<Metadata> {
  const { category } = await params
  if (!isKnown(category)) return { title: 'Ranking not found — The Lifting Lab' }
  const label = categoryLabel(category)
  const url = `${SITE}/best/${category}`
  const title = `Best ${label} UK ${YEAR} — Ranked & Tested | The Lifting Lab`
  const description = `The best ${label.toLowerCase()} you can buy in the UK for ${YEAR}, ranked by Effectiveness Match against the evidence-based reference dose — plus our best value and best budget picks.`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'article', siteName: 'The Lifting Lab' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

function fmt(n: number) {
  return n < 10 ? `£${n.toFixed(2)}` : `£${Math.round(n)}`
}

// Honest, data-only one-line verdict for a ranked product.
function verdict(p: ScoredProduct): string {
  const parts: string[] = []
  const s = p.score ?? 0
  if (s >= 70) parts.push('Matches the evidence-based reference dose closely')
  else if (s >= 50) parts.push('Solid actives, but under the ideal dose in places')
  else parts.push('Falls short of the reference dose on key actives')
  if (p.amino_spiked) parts.push('amino-spiked, so it scores zero on protein purity')
  else if (p.proprietary_blend) parts.push('doses are hidden inside a proprietary blend')
  if (p.cost_per_serving != null) parts.push(`${fmt(p.cost_per_serving)} per serving`)
  return parts.join(' · ')
}

export default async function BestCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>
}) {
  const { category } = await params
  if (!isKnown(category)) notFound()

  const ranked = await rankedProducts(category)
  // Guard: a category without a credible field of scored products gets no
  // ranking page (404), so we never publish thin/doorway content.
  if (ranked.length < MIN_RANKED) notFound()

  const label = categoryLabel(category)
  const url = `${SITE}/best/${category}`
  const top = ranked.slice(0, TOP_N)
  const { bestOverall, bestValue, bestBudget } = deriveAwards(ranked)
  const guide = GUIDES.find((g) => g.slug === category)
  const hasGuide = GUIDE_SLUGS.includes(category)

  const lead =
    guide?.intro ??
    `We scored every ${label.toLowerCase()} in our UK database against the evidence-based clinical reference dose for the category. Below are the highest-scoring picks for ${YEAR}, ranked by Effectiveness Match — not brand reputation or ad spend.`

  // Award cards, only those backed by real data.
  const awards: { label: string; tag: string; p: ScoredProduct }[] = []
  if (bestOverall) awards.push({ label: 'Best Overall', tag: 'Top Effectiveness Match', p: bestOverall })
  if (bestValue && bestValue.id !== bestOverall?.id)
    awards.push({ label: 'Best Value', tag: 'Most score per £ per serving', p: bestValue })
  if (bestBudget && bestBudget.id !== bestOverall?.id && bestBudget.id !== bestValue?.id)
    awards.push({ label: 'Best Budget', tag: 'Cheapest per serving (score 50+)', p: bestBudget })

  // ItemList — the ranking as an ordered product list, backed 1:1 by the visible
  // list below; each entry resolves to a schema-rich product page so Google can
  // build a ranked carousel.
  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Best ${label} UK ${YEAR}`,
    description: `The top ${top.length} ${label.toLowerCase()} products of ${YEAR}, ranked by The Lifting Lab Effectiveness Match score.`,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    numberOfItems: top.length,
    itemListElement: top.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: p.name,
        brand: { '@type': 'Brand', name: p.brand },
        category: label,
        url: `${SITE}/products/${p.id}`,
      },
    })),
  }

  const faqs = [
    {
      q: `What is the best ${label.toLowerCase()} in the UK for ${YEAR}?`,
      a: bestOverall
        ? `${bestOverall.brand} ${bestOverall.name} tops our ${label.toLowerCase()} ranking with an Effectiveness Match score of ${bestOverall.score}, measured against the evidence-based reference dose for the category.`
        : `Our ranking is updated as the catalogue changes, so the current top pick is shown at the top of this page.`,
    },
    {
      q: 'How is this ranking decided?',
      a: 'Each product earns an Effectiveness Match score (0 to 100) for how closely its active doses match the evidence-based clinical reference for the category. The ranking is by score alone. Price is shown for context and drives our separate Best Value and Best Budget picks, but never the main order.',
    },
    {
      q: 'Is the top-scoring pick the right one for me?',
      a: 'Usually, but not always. The highest score is the most clinically complete product. If budget matters more, our Best Value and Best Budget picks deliver most of the benefit for less. Informational only — not medical advice.',
    },
  ]
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: `Best Supplements ${YEAR}`, item: `${SITE}/best` },
      { name: `Best ${label}`, item: url },
    ].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  }

  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <article className="max-w-3xl mx-auto px-6 py-12">
        {/* breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-lab-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/" className="hover:text-white">Home</Link></li>
            <li aria-hidden className="text-lab-border">/</li>
            <li><Link href="/best" className="hover:text-white">Best Supplements {YEAR}</Link></li>
            <li aria-hidden className="text-lab-border">/</li>
            <li aria-current="page" className="text-white/80">{label}</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          The Lifting Lab Awards · {YEAR}
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Best {label} <span className="text-lab-lime">UK {YEAR}</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">{lead}</p>
        <p className="text-lab-muted leading-relaxed mb-10">
          We scored {ranked.length} {label.toLowerCase()} product{ranked.length === 1 ? '' : 's'} and
          ranked the top {top.length} below by Effectiveness Match. Scores update as the catalogue
          changes, so this page always reflects the current pick.
        </p>

        {/* award picks */}
        {awards.length > 0 && (
          <section className="mb-12">
            <h2 className="text-xl font-black uppercase tracking-wide mb-5">
              The <span className="text-lab-lime">Picks</span>
            </h2>
            <div className="grid sm:grid-cols-3 gap-3">
              {awards.map(({ label: aLabel, tag, p }) => (
                <div key={aLabel} className="bg-lab-panel border border-lab-border rounded-xl p-4 flex flex-col">
                  <p className="text-[10px] uppercase tracking-widest text-lab-lime font-bold mb-3">{aLabel}</p>
                  <div className="flex items-center gap-3 mb-3">
                    <ScoreBadge score={p.score} size="sm" />
                    <div className="min-w-0">
                      <p className="text-white text-xs font-black leading-tight truncate">{p.brand}</p>
                      <p className="text-lab-muted text-[11px] truncate">{p.name}</p>
                    </div>
                  </div>
                  <p className="text-[10px] uppercase tracking-widest text-lab-muted mb-3">{tag}</p>
                  {p.cost_per_serving != null && (
                    <p className="text-[11px] text-white/60 mb-3">{fmt(p.cost_per_serving)} per serving</p>
                  )}
                  <a
                    href={buyLink(p.brand, p.name, p.buy_url)}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="mt-auto text-center text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl"
                    style={{ background: 'rgba(166,226,46,0.12)', color: '#a6e22e', border: '1px solid rgba(166,226,46,0.5)' }}
                  >
                    Buy
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* the ranking */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-black uppercase tracking-wide">
              The <span className="text-lab-lime">Ranking</span>
            </h2>
            <span className="text-[11px] uppercase tracking-widest text-lab-muted">
              Top {top.length}
            </span>
          </div>
          <ol className="space-y-3">
            {top.map((p, i) => (
              <li key={p.id} className="bg-lab-panel border border-lab-border rounded-xl p-4">
                <div className="flex items-center gap-4">
                  <span className="text-lg font-black text-lab-muted w-6 text-center shrink-0">
                    {i + 1}
                  </span>
                  <ScoreBadge score={p.score} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/products/${p.id}`} className="hover:text-lab-lime transition-colors">
                      <p className="text-white text-sm font-black leading-tight truncate">{p.brand}</p>
                    </Link>
                    <p className="text-lab-muted text-xs truncate">{p.name}</p>
                    <p className="text-[11px] text-white/55 mt-1 leading-snug">{verdict(p)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <Link
                    href={`/products/${p.id}`}
                    className="text-center text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl border border-lab-border text-lab-muted hover:text-white transition-colors"
                  >
                    Details
                  </Link>
                  <Link
                    href="/compare"
                    className="text-center text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl border border-lab-border text-lab-muted hover:text-white transition-colors"
                  >
                    Compare
                  </Link>
                  <a
                    href={buyLink(p.brand, p.name, p.buy_url)}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-center text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl"
                    style={{ background: 'rgba(166,226,46,0.12)', color: '#a6e22e', border: '1px solid rgba(166,226,46,0.5)' }}
                  >
                    Buy
                  </a>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* how we rank + funnel */}
        <section className="mb-12 bg-lab-panel border border-lab-border rounded-2xl p-6">
          <h2 className="text-lg font-black uppercase tracking-wide mb-3">How we rank</h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-3">
            Every product earns an Effectiveness Match score (0 to 100) measuring how closely its
            active ingredient doses match the evidence-based clinical reference for {label.toLowerCase()}.
            The ranking is by score alone. Cost per serving is shown for context and decides our
            separate Best Value and Best Budget picks, never the main order.
          </p>
          <p className="text-lab-muted/70 text-xs leading-relaxed mb-5">
            Informational only — not medical advice. Buy links are affiliate links; we may earn a
            commission at no extra cost to you. This never affects scoring.
          </p>
          <div className="flex flex-wrap gap-2">
            {hasGuide && (
              <Link
                href={`/guide/${category}`}
                className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
              >
                {label} buyer&apos;s guide →
              </Link>
            )}
            <Link
              href={`/products?category=${category}`}
              className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
            >
              Browse all {label.toLowerCase()}
            </Link>
            <Link
              href="/value"
              className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
            >
              Best by value
            </Link>
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-12">
          <h2 className="text-xl font-black uppercase tracking-wide mb-5">Frequently asked</h2>
          <div className="space-y-4">
            {faqs.map((f) => (
              <div key={f.q} className="bg-lab-panel border border-lab-border rounded-xl p-5">
                <h3 className="text-white text-sm font-bold mb-2">{f.q}</h3>
                <p className="text-lab-muted text-sm leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-12 pt-8 border-t border-lab-border">
          <Link href="/best" className="text-xs uppercase tracking-widest font-bold text-lab-muted hover:text-white">
            ← All category winners
          </Link>
        </div>
      </article>
    </div>
  )
}
