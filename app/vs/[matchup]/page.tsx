import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import ScoreBadge from '@/components/ScoreBadge'
import { categoryLabel } from '@/lib/categories'
import { GUIDE_SLUGS } from '@/lib/guides'
import { buyLink } from '@/lib/affiliate'
import { createPublicClient } from '@/lib/supabase-public'
import {
  PRODUCT_COLUMNS,
  hasVerifiedCost,
  withScore,
  type Product,
  type Nutrient,
  type ComparedProduct,
} from '@/lib/products'
import { curatedMatchups, resolveMatchup } from '@/lib/matchups'

// Static-generate the curated matchup set at build, daily refresh. dynamicParams
// stays true (like the brand hub) so the route is resilient if a build misses the
// DB: any valid product pair renders on demand, while resolveMatchup 404s unknown
// or malformed slugs. Only curated pairs are listed in the sitemap/hub, so this
// adds resilience without inviting thin/duplicate indexed pages.
export const revalidate = 86400
export const dynamicParams = true

const SITE = 'https://www.theliftinglab.co.uk'
const YEAR = 2026

type NutrientRow = Nutrient & { product_id: string }

async function getMatchup(matchup: string): Promise<[ComparedProduct, ComparedProduct] | null> {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('status', 'active')
    if (error || !data) return null

    const pair = resolveMatchup(matchup, data as Product[])
    if (!pair) return null
    const [a, b] = pair

    const { data: nutrients } = await sb
      .from('product_nutrients')
      .select('product_id, nutrient_name, amount, unit')
      .in('product_id', [a.id, b.id])
    const rows = (nutrients as NutrientRow[] | null) || []

    const build = (p: Product): ComparedProduct => ({
      ...withScore(p),
      nutrients: rows
        .filter((n) => n.product_id === p.id)
        .map(({ nutrient_name, amount, unit }) => ({ nutrient_name, amount, unit })),
    })
    return [build(a), build(b)]
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
    const scored = (data as Product[]).map((p) => {
      const s = withScore(p)
      return { id: p.id, name: p.name, brand: p.brand, category: p.category, score: s.score }
    })
    return curatedMatchups(scored).map((m) => ({ matchup: m.slug }))
  } catch {
    return []
  }
}

function title(a: ComparedProduct, b: ComparedProduct) {
  return `${a.brand} ${a.name} vs ${b.brand} ${b.name}`
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ matchup: string }>
}): Promise<Metadata> {
  const { matchup } = await params
  const pair = await getMatchup(matchup)
  if (!pair) return { title: 'Comparison not found — The Lifting Lab' }
  const [a, b] = pair
  const url = `${SITE}/vs/${matchup}`
  const t = `${title(a, b)} — Which Is Better? (UK ${YEAR}) | The Lifting Lab`
  const description = `${a.brand} ${a.name} vs ${b.brand} ${b.name}: side-by-side dosing, Effectiveness Match scores${
    a.score != null && b.score != null ? ` (${a.score} vs ${b.score})` : ''
  } and true cost per serving, scored against evidence-based standards.`
  return {
    title: t,
    description,
    alternates: { canonical: url },
    openGraph: { title: t, description, url, type: 'website', siteName: 'The Lifting Lab' },
    twitter: { card: 'summary_large_image', title: t, description },
  }
}

export default async function MatchupPage({
  params,
}: {
  params: Promise<{ matchup: string }>
}) {
  const { matchup } = await params
  const pair = await getMatchup(matchup)
  if (!pair) notFound()
  const [a, b] = pair
  const url = `${SITE}/vs/${matchup}`
  const products: ComparedProduct[] = [a, b]

  // winner on Effectiveness Match score
  const scored = products.filter((p): p is ComparedProduct & { score: number } => p.score != null)
  const bestRated = scored.length
    ? scored.reduce((x, y) => (y.score > x.score ? y : x))
    : null
  const tie = scored.length === 2 && scored[0].score === scored[1].score

  // best value: highest score per £/serving
  const valued = products.filter(
    (p): p is ComparedProduct & { score: number; cost_per_serving: number } =>
      p.score != null && hasVerifiedCost(p), // unverified cost never competes (TLL-P0-3)
  )
  const bestValue = valued.length
    ? valued.reduce((x, y) => (y.score / y.cost_per_serving > x.score / x.cost_per_serving ? y : x))
    : null

  // union of nutrient names, first-seen order
  const nutrientNames: string[] = []
  for (const p of products) {
    for (const n of p.nutrients) {
      if (!nutrientNames.includes(n.nutrient_name)) nutrientNames.push(n.nutrient_name)
    }
  }
  const amountFor = (p: ComparedProduct, name: string) => {
    const n = p.nutrients.find((x) => x.nutrient_name === name)
    return n ? `${n.amount}${n.unit}` : '—'
  }

  const anyInformedSport = products.some((p) => p.informed_sport)
  const anyFlag = products.some(
    (p) => p.proprietary_blend || p.amino_spiked || p.protein_yield != null,
  )
  const sameCategory = a.category === b.category
  const guideSlug = sameCategory && GUIDE_SLUGS.includes(a.category) ? a.category : null

  const verdictText = tie
    ? `${a.brand} ${a.name} and ${b.brand} ${b.name} are level on Effectiveness Match (${a.score} each).`
    : bestRated
    ? `${bestRated.brand} ${bestRated.name} wins on Effectiveness Match with ${bestRated.score}/100.`
    : `Neither product is scored yet on Effectiveness Match.`

  // BreadcrumbList + ItemList + FAQPage — all backed 1:1 by visible content.
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: 'Compare', item: `${SITE}/vs` },
      { name: `${a.name} vs ${b.name}`, item: url },
    ].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  }
  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title(a, b),
    numberOfItems: 2,
    itemListElement: products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: `${p.brand} ${p.name}`,
        brand: { '@type': 'Brand', name: p.brand },
        category: categoryLabel(p.category),
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
        name: `Which is better, ${a.brand} ${a.name} or ${b.brand} ${b.name}?`,
        acceptedAnswer: { '@type': 'Answer', text: verdictText },
      },
      ...(bestValue
        ? [
            {
              '@type': 'Question',
              name: `Which is better value, ${a.name} or ${b.name}?`,
              acceptedAnswer: {
                '@type': 'Answer',
                text: `${bestValue.brand} ${bestValue.name} offers the best value at £${bestValue.cost_per_serving.toFixed(
                  2,
                )} per effective serving (score ${bestValue.score}/100).`,
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
            <li><Link href="/vs" className="hover:text-white">Compare</Link></li>
            <li aria-hidden className="text-lab-border">/</li>
            <li aria-current="page" className="text-white/80">{a.name} vs {b.name}</li>
          </ol>
        </nav>

        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Head-to-Head · {YEAR}
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          {a.brand} {a.name} <span className="text-lab-lime">vs</span> {b.brand} {b.name}
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-8">
          We score both{sameCategory ? ` ${categoryLabel(a.category).toLowerCase()} products` : ' products'} against the
          same evidence-based clinical reference, so you can see exactly how their active doses, true cost per serving
          and Effectiveness Match scores stack up — never brand reputation or marketing.
        </p>

        {/* verdict */}
        <div className="bg-lab-panel border border-lab-lime/40 rounded-2xl p-5 lab-glow mb-10">
          <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">Verdict</p>
          <p className="text-white text-sm">{verdictText}</p>
          {bestValue && (
            <p className="text-lab-muted text-xs mt-1">
              Best value per serving:{' '}
              <span className="text-white font-bold">{bestValue.brand} {bestValue.name}</span> at{' '}
              <span className="text-lab-lime font-bold">£{bestValue.cost_per_serving.toFixed(2)}/serving</span>{' '}
              (score {bestValue.score}).
            </p>
          )}
        </div>

        {/* comparison table */}
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `minmax(120px,1.2fr) repeat(2, minmax(0,1fr))` }}
        >
          <div />
          {products.map((p) => (
            <div key={p.id} className="bg-lab-panel border border-lab-border rounded-xl p-4 text-center">
              <div className="flex justify-center mb-2">
                <ScoreBadge score={p.score} />
              </div>
              <Link href={`/products/${p.id}`} className="hover:text-lab-lime transition-colors">
                <p className="text-white text-xs font-bold leading-tight">{p.brand}</p>
                <p className="text-lab-muted text-[11px] leading-tight mt-0.5">{p.name}</p>
              </Link>
              <span className="inline-block mt-2 text-[9px] uppercase tracking-widest font-bold bg-lab-panel-2 text-lab-muted px-2 py-0.5 rounded-full">
                {categoryLabel(p.category)}
              </span>
              {!tie && bestRated?.id === p.id && (
                <p className="mt-2 text-[9px] uppercase tracking-widest font-black text-lab-lime">★ Winner</p>
              )}
            </div>
          ))}

          <Cell head>Serving</Cell>
          {products.map((p) => (
            <Cell key={p.id}>{p.serving_size ? `${p.serving_size}${p.serving_unit || ''}` : '—'}</Cell>
          ))}

          <Cell head>Retail</Cell>
          {products.map((p) => (
            <Cell key={p.id}>{p.retail_price != null ? `£${p.retail_price.toFixed(2)}` : '—'}</Cell>
          ))}

          <Cell head>True Cost / serving</Cell>
          {products.map((p) => (
            <Cell key={p.id}>
              {p.cost_per_serving != null ? (
                <span className={bestValue?.id === p.id ? 'text-lab-lime font-black' : ''}>
                  £{p.cost_per_serving.toFixed(2)}
                </span>
              ) : '—'}
            </Cell>
          ))}

          {nutrientNames.map((name) => (
            <Row key={name} name={name} products={products} amountFor={amountFor} />
          ))}

          {anyInformedSport && (
            <>
              <Cell head>Informed Sport</Cell>
              {products.map((p) => (
                <Cell key={p.id}>{p.informed_sport ? '🛡️ Certified' : '—'}</Cell>
              ))}
            </>
          )}

          {anyFlag && (
            <>
              <Cell head>Protein Yield</Cell>
              {products.map((p) => (
                <Cell key={p.id}>{p.protein_yield != null ? `${p.protein_yield}%` : '—'}</Cell>
              ))}
              <Cell head>Proprietary Blend</Cell>
              {products.map((p) => (
                <Cell key={p.id}>{p.proprietary_blend ? '⚠️ Yes' : 'No'}</Cell>
              ))}
              <Cell head>Amino Spiked</Cell>
              {products.map((p) => (
                <Cell key={p.id}>{p.amino_spiked ? '⚠️ Yes' : 'No'}</Cell>
              ))}
            </>
          )}

          <div />
          {products.map((p) => {
            const href = buyLink(p.brand, p.name, p.buy_url)
            return (
              <div key={p.id} className="px-2 py-3 border-b border-lab-border flex justify-center">
                {href && (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="w-full text-center text-[10px] font-black uppercase tracking-widest py-2 rounded-lg bg-lab-lime text-black hover:opacity-90 transition-opacity"
                  >
                    Buy →
                  </a>
                )}
              </div>
            )
          })}
        </div>
        <p className="text-[9px] text-lab-muted/40 text-right mt-1">affiliate links · open in a new tab</p>

        {/* cross-links */}
        <div className="mt-10 flex flex-wrap gap-2">
          <Link
            href={`/products/${a.id}`}
            className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-4 py-2.5 rounded-lg transition-colors"
          >
            {a.name} review →
          </Link>
          <Link
            href={`/products/${b.id}`}
            className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-4 py-2.5 rounded-lg transition-colors"
          >
            {b.name} review →
          </Link>
          {guideSlug && (
            <Link
              href={`/guide/${guideSlug}`}
              className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-4 py-2.5 rounded-lg hover:opacity-90"
            >
              {categoryLabel(guideSlug)} buyer&apos;s guide →
            </Link>
          )}
          <Link
            href="/vs"
            className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-4 py-2.5 rounded-lg transition-colors"
          >
            More comparisons →
          </Link>
        </div>

        <section className="mt-14 bg-lab-panel border border-lab-border rounded-2xl p-6">
          <h2 className="text-lg font-black uppercase tracking-wide mb-3">How we score</h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-3">
            Each product earns an Effectiveness Match score (0–100) measuring how closely its active ingredient doses
            match the evidence-based clinical reference for its category. Proprietary blends and amino-spiked formulas
            are penalised because they hide the real dose. We are independent — scores are never influenced by brands or
            affiliate deals.
          </p>
          <p className="text-lab-muted/70 text-xs leading-relaxed">
            Informational only — not medical advice. Buy links are affiliate links; we may earn a commission at no extra
            cost to you. This never affects scoring.
          </p>
        </section>
      </main>
    </div>
  )
}

function Row({
  name,
  products,
  amountFor,
}: {
  name: string
  products: ComparedProduct[]
  amountFor: (p: ComparedProduct, name: string) => string
}) {
  return (
    <>
      <Cell head>{name}</Cell>
      {products.map((p) => (
        <Cell key={p.id}>{amountFor(p, name)}</Cell>
      ))}
    </>
  )
}

function Cell({ children, head }: { children: React.ReactNode; head?: boolean }) {
  return (
    <div
      className={`px-3 py-2.5 text-sm border-b border-lab-border flex items-center ${
        head
          ? 'text-lab-muted text-xs uppercase tracking-widest font-bold'
          : 'text-white text-center font-medium justify-center'
      }`}
    >
      {children}
    </div>
  )
}