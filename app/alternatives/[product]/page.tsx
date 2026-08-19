import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import ScoreBadge from '@/components/ScoreBadge'
import { categoryLabel } from '@/lib/categories'
import { GUIDE_SLUGS } from '@/lib/guides'
import { rankedCategorySlugs } from '@/lib/best-categories'
import { buyLink } from '@/lib/affiliate'
import { createPublicClient } from '@/lib/supabase-public'
import { PRODUCT_COLUMNS, withScore, type Product, type ScoredProduct } from '@/lib/products'
import { productSlug, matchupSlug } from '@/lib/matchups'
import {
  alternativesFor,
  curatedAlternativeTargets,
  resolveAlternativeTarget,
  valueRatio,
  MIN_ALTERNATIVES,
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
    if (alternatives.length < MIN_ALTERNATIVES) return null
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
  const label = categoryLabel(target.category).toLowerCase()
  const t = `${target.brand} ${target.name} Alternatives — Better-Rated & Cheaper ${categoryLabel(
    target.category,
  )} (UK ${YEAR}) | The Lifting Lab`
  const description = `Looking for an alternative to ${target.brand} ${target.name}? See better-rated and better-value ${label} swaps, scored against evidence-based dosing and true cost per serving.`
  return {
    title: t,
    description,
    alternates: { canonical: url },
    openGraph: { title: t, description, url, type: 'website', siteName: 'The Lifting Lab' },
    twitter: { card: 'summary_large_image', title: t, description },
  }
}

function costLine(p: ScoredProduct): string {
  return p.cost_per_serving != null ? `£${p.cost_per_serving.toFixed(2)}/serving` : 'price TBC'
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
    target.score != null && p.score != null ? p.score - target.score : null
  return (
    <div className="flex items-center gap-3 bg-lab-panel border border-lab-border rounded-xl px-4 py-3.5">
      <ScoreBadge score={p.score} size="sm" />
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
      <a
        href={buyLink(p.brand, p.name, p.buy_url)}
        target="_blank"
        rel="sponsored nofollow noopener"
        className="shrink-0 text-[11px] uppercase tracking-widest font-black bg-lab-lime text-black px-3 py-2 rounded-lg hover:brightness-110 transition"
      >
        Buy
      </a>
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
  const hasBestRanking = (await rankedCategorySlugs()).includes(target.category)

  // Better-rated: higher Effectiveness Match. alternatives is already score-desc.
  const betterRated =
    target.score != null
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
    : target.score != null
    ? `${target.brand} ${target.name} is among the best-scoring ${labelLower} we've tested (${target.score}/100), so there's no better-rated swap — but the picks below match or undercut it on price.`
    : `We surface the top-scoring ${labelLower} below as alternatives to ${target.brand} ${target.name}.`

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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

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
          Better Swaps · {YEAR}
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Alternatives to <span className="text-lab-lime">{target.brand} {target.name}</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-8">
          We score every {labelLower} against the same evidence-based clinical reference, so these swaps beat{' '}
          {target.brand} {target.name} on Effectiveness Match, true cost per serving, or both — never on brand
          reputation or marketing.
        </p>

        {/* current product + verdict */}
        <div className="bg-lab-panel border border-lab-lime/40 rounded-2xl p-5 lab-glow mb-10">
          <div className="flex items-center gap-4 mb-3">
            <ScoreBadge score={target.score} />
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
              <>Top {label} <span className="text-lab-lime">picks</span></>
            )}
          </h2>
          <p className="text-xs text-lab-muted mb-4">
            {betterRated.length
              ? `Higher Effectiveness Match than ${target.name} on our reference spec.`
              : `${target.name} already ranks near the top, so here are the strongest ${labelLower} alongside it.`}
          </p>
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
            <p className="text-xs text-lab-muted mb-4">
              More Effectiveness Match per pound{targetRatio != null ? ` than ${target.name}` : ''} — true cost per full
              effective serving.
            </p>
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
              See the full ranking:{' '}
              <Link href={`/best/${target.category}`} className="text-lab-lime hover:underline underline-offset-2">
                Best {label} UK {YEAR} →
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

        <p className="text-[11px] text-lab-muted mt-10 leading-relaxed">
          Effectiveness Match scores active doses against evidence-based standards. Informational only — not medical
          advice. Some links are affiliate links; we may earn a commission at no cost to you.
        </p>
      </main>
    </div>
  )
}
