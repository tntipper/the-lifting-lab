import { formatListedServingPrice } from '@/lib/products'
import { hasApprovedAssessment } from '@/lib/assessment-display'
import { serializeJsonForHtml } from '@/lib/json-for-html'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import ProductAssessment from '@/components/ProductAssessment'
import { categoryLabel } from '@/lib/categories'
import { GUIDE_SLUGS } from '@/lib/guides'
import { researchCategorySlugs } from '@/lib/best-categories'
import ProductOfferLink from '@/components/ProductOfferLink'
import { createPublicClient } from '@/lib/supabase-public'
import { PRODUCT_COLUMNS, withScore, type Product, type ScoredProduct } from '@/lib/products'
import { productSlug, matchupSlug } from '@/lib/matchups'
import {
  alternativesFor,
  curatedAlternativeTargets,
  resolveAlternativeTarget,
  valueRatio,
  MAX_SHOWN,
} from '@/lib/alternatives'

// Pre-render the curated set (top products per category), daily refresh.
// dynamicParams stays true (like /vs and the brand hub) so any product with
// enough same-category alternatives renders on demand, while the MIN_ALTERNATIVES
// guard 404s thin/unknown slugs rather than shipping doorway content.
export const revalidate = 86400
export const dynamicParams = true

const SITE = 'https://www.theliftinglab.co.uk'
const YEAR = 2026

type Data = { target: ScoredProduct; alternatives: ScoredProduct[] }

async function getData(slug: string): Promise<Data | null> {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb.from('products').select(PRODUCT_COLUMNS).eq('status', 'active')
    if (error || !data) return null
    const scored = (data as Product[]).map(withScore)
    const target = resolveAlternativeTarget(slug, scored)
    if (!target) return null
    const alternatives = alternativesFor(target, scored)
    return { target, alternatives }
  } catch {
    return null
  }
}

export async function generateStaticParams() {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb.from('products').select(PRODUCT_COLUMNS).eq('status', 'active')
    if (error || !data) return []
    const scored = (data as Product[]).map(withScore)
    return curatedAlternativeTargets(scored).map((t) => ({
      product: productSlug(t.brand, t.name),
    }))
  } catch {
    return []
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ product: string }>
}): Promise<Metadata> {
  const { product } = await params
  const data = await getData(product)
  if (!data) return { title: 'Alternatives not found — The Lifting Lab' }
  const { target } = data
  const url = `${SITE}/alternatives/${product}`
  const t = `${target.brand} ${target.name} Same-category Research — ${categoryLabel(
    target.category,
  )} (UK ${YEAR}) | The Lifting Lab`
  const description = 'No approved effectiveness assessment is available. Historical percentages are unverified and do not establish dosing, product quality or a recommendation. Labels and listed prices remain available for research. Listed prices are not confirmed offers; formulations and serving sizes differ.'
  return {
    title: t,
    description,
    alternates: { canonical: url },
    openGraph: { title: t, description, url, type: 'website', siteName: 'The Lifting Lab' },
    twitter: { card: 'summary_large_image', title: t, description },
  }
}

function costLine(p: ScoredProduct): string {
  return p.cost_per_serving != null ? `${formatListedServingPrice(p.cost_per_serving)}/serving` : 'price TBC'
}

function AltCard({
  p,
  target,
  tag,
}: {
  p: ScoredProduct
  target: ScoredProduct
  tag?: string
}) {
  const delta =
    hasApprovedAssessment(target) && hasApprovedAssessment(p) ? p.score - target.score : null
  return (
    <div className="flex items-center gap-3 bg-lab-panel border border-lab-border rounded-xl px-4 py-3.5">
      <ProductAssessment product={p} size="sm" />
      <div className="min-w-0 flex-1">
        <Link href={`/products/${p.id}`} className="hover:text-lab-lime transition-colors">
          <p className="text-sm font-bold leading-tight text-white truncate">{p.brand} {p.name}</p>
        </Link>
        <p className="text-[11px] text-lab-muted mt-0.5">
          {costLine(p)}
          {delta != null && delta > 0 && (
            <span className="text-lab-lime font-bold"> · +{delta} vs {target.name}</span>
          )}
          {tag && <span className="text-white/70"> · {tag}</span>}
        </p>
      </div>
      <ProductOfferLink
        product={p}
        className="shrink-0 text-[11px] uppercase tracking-widest font-black bg-lab-lime text-black px-3 py-2 rounded-lg hover:brightness-110 transition"
      />
    </div>
  )
}

export default async function AlternativesPage({
  params,
}: {
  params: Promise<{ product: string }>
}) {
  const { product } = await params
  const data = await getData(product)
  if (!data) notFound()
  const { target, alternatives } = data
  const url = `${SITE}/alternatives/${product}`
  const label = categoryLabel(target.category)
  const labelLower = label.toLowerCase()

  // Only link to /best/[category] when that ranking actually publishes — a thin
  // category (below MIN_RANKED scored products) 404s there, so the link would be dead.
  const hasBestRanking = (await researchCategorySlugs()).includes(target.category)

  // Better-rated: higher Effectiveness Match. alternatives is already score-desc.
  const betterRated =
    hasApprovedAssessment(target)
      ? alternatives.filter((p) => p.score != null && p.score > target.score!).slice(0, MAX_SHOWN)
      : []

  // Better-value: higher score-per-£ than the target (or, if the target is
  // unpriced, any priced alternative), best value first.
  const targetRatio = valueRatio(target)
  const betterValue = alternatives
    .map((p) => ({ p, r: valueRatio(p) }))
    .filter((x) => x.r != null && (targetRatio == null || x.r > targetRatio))
    .sort((a, b) => (b.r as number) - (a.r as number))
    .map((x) => x.p)
    .slice(0, MAX_SHOWN)

  // Fallback list when the target already leads its category on score: show the
  // closest competitors so the page is never empty.
  const topPicks = alternatives.slice(0, MAX_SHOWN)

  const topRated = betterRated[0] ?? null
  const topValue = betterValue[0] ?? null

  const verdict = topRated
    ? `${topRated.brand} ${topRated.name} is our top-rated alternative to ${target.brand} ${target.name}, scoring ${topRated.score}/100 on Effectiveness Match versus ${target.score}.`
    : hasApprovedAssessment(target)
    ? `${target.brand} ${target.name} is among the best-scoring ${labelLower} we've tested (${target.score}/100), so there's no better-rated swap — but the picks below match or undercut it on price.`
    : `No approved effectiveness or replacement recommendation is available. The ${labelLower} records below are shown alphabetically for research alongside ${target.brand} ${target.name}.`

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: 'Alternatives', item: `${SITE}/alternatives` },
      { name: `${target.brand} ${target.name}`, item: url },
    ].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  }
  const shown = (betterRated.length ? betterRated : topPicks)
    .concat(betterValue)
    .filter((p, i, arr) => arr.findIndex((q) => q.id === p.id) === i)
  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Alternatives to ${target.brand} ${target.name}`,
    numberOfItems: shown.length,
    itemListElement: shown.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: `${p.brand} ${p.name}`,
        brand: { '@type': 'Brand', name: p.brand },
        category: label,
        url: `${SITE}/products/${p.id}`,
      },
    })),
  }
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `What is the best alternative to ${target.brand} ${target.name}?`,
        acceptedAnswer: { '@type': 'Answer', text: verdict },
      },
      ...(topValue
        ? [
            {
              '@type': 'Question',
              name: `What is a cheaper alternative to ${target.brand} ${target.name}?`,
              acceptedAnswer: {
                '@type': 'Answer',
                text: `${topValue.brand} ${topValue.name} offers strong value at ${costLine(
                  topValue,
                )} (Effectiveness Match ${topValue.score}/100), among the best score-per-pound ${labelLower} we rank.`,
              },
            },
          ]
        : []),
    ],
  }

  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonForHtml(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonForHtml(itemListJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonForHtml(faqJsonLd) }} />

      <main className="max-w-3xl mx-auto px-6 py-12">
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-lab-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/" className="hover:text-white">Home</Link></li>
            <li aria-hidden className="text-lab-border">/</li>
            <li><Link href="/alternatives" className="hover:text-white">Alternatives</Link></li>
            <li aria-hidden className="text-lab-border">/</li>
            <li aria-current="page" className="text-white/80">{target.name}</li>
          </ol>
        </nav>

        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Same-category research · {YEAR}
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Alternatives to <span className="text-lab-lime">{target.brand} {target.name}</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-8">
          These are same-category research records. No effectiveness recommendation or replacement endorsement is available. Compare the recorded labels and listed prices; different formulas and serving sizes may not be equivalent.
        </p>

        {/* current product + verdict */}
        <div className="bg-lab-panel border border-lab-lime/40 rounded-2xl p-5 lab-glow mb-10">
          <div className="flex items-center gap-4 mb-3">
            <ProductAssessment product={target} />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">
                You&apos;re looking at
              </p>
              <Link href={`/products/${target.id}`} className="hover:text-lab-lime transition-colors">
                <p className="text-white text-sm font-bold leading-tight">{target.brand} {target.name}</p>
              </Link>
              <p className="text-lab-muted text-[11px] mt-0.5">
                {label} · {costLine(target)}
              </p>
            </div>
          </div>
          <p className="text-white text-sm">{verdict}</p>
        </div>

        {/* better-rated */}
        <section className="mb-10">
          <h2 className="text-xl font-black uppercase tracking-wide mb-1">
            {betterRated.length ? (
              <>Better-<span className="text-lab-lime">rated</span> swaps</>
            ) : (
              <>{label} <span className="text-lab-lime">research records</span></>
            )}
          </h2>
          <p className="text-xs text-lab-muted mb-4">No approved effectiveness assessment is available. Historical percentages are unverified and do not establish dosing, product quality or a recommendation. Labels and listed prices remain available for research.</p>
          <div className="space-y-2.5">
            {(betterRated.length ? betterRated : topPicks).map((p) => (
              <AltCard key={p.id} p={p} target={target} />
            ))}
          </div>
        </section>

        {/* better-value */}
        {betterValue.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-black uppercase tracking-wide mb-1">
              Better-<span className="text-lab-lime">value</span> swaps
            </h2>
            <p className="text-xs text-lab-muted mb-4">No approved effectiveness assessment is available. Historical percentages are unverified and do not establish dosing, product quality or a recommendation. Labels and listed prices remain available for research.</p>
            <div className="space-y-2.5">
              {betterValue.map((p) => (
                <AltCard key={p.id} p={p} target={target} tag="value pick" />
              ))}
            </div>
          </section>
        )}

        {/* cross-links */}
        <section className="border-t border-lab-border pt-6 text-sm text-lab-muted space-y-2">
          {topRated && (
            <p>
              Straight face-off:{' '}
              <Link
                href={`/vs/${matchupSlug(target.brand, target.name, topRated.brand, topRated.name)}`}
                className="text-lab-lime hover:underline underline-offset-2"
              >
                {target.name} vs {topRated.name} →
              </Link>
            </p>
          )}
          {hasBestRanking ? (
            <p>
              Browse the category records:{' '}
              <Link href={`/best/${target.category}`} className="text-lab-lime hover:underline underline-offset-2">
                {label} research →
              </Link>
            </p>
          ) : (
            <p>
              Browse the category:{' '}
              <Link href={`/products?category=${target.category}`} className="text-lab-lime hover:underline underline-offset-2">
                All {labelLower} →
              </Link>
            </p>
          )}
          {GUIDE_SLUGS.includes(target.category) && (
            <p>
              How to choose:{' '}
              <Link href={`/guide/${target.category}`} className="text-lab-lime hover:underline underline-offset-2">
                {label} buyer&apos;s guide →
              </Link>
            </p>
          )}
        </section>

        <p className="text-[11px] text-lab-muted mt-10 leading-relaxed">No approved effectiveness assessment is available. Historical percentages are unverified and do not establish dosing, product quality or a recommendation. Labels and listed prices remain available for research.</p>
      </main>
    </div>
  )
}
