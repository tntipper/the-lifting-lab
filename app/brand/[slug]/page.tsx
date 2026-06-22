import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import ScoreBadge from '@/components/ScoreBadge'
import { categoryLabel } from '@/lib/categories'
import { GUIDE_SLUGS } from '@/lib/guides'
import { buyLink } from '@/lib/affiliate'
import { createPublicClient } from '@/lib/supabase-public'
import { PRODUCT_COLUMNS, withScore, sortScored, type Product, type ScoredProduct } from '@/lib/products'
import { brandSlug } from '@/lib/brands'

// SSG for known brands at build time, with on-demand rendering for any brand
// added later (dynamicParams) and a daily refresh. DB-failure safe throughout.
export const revalidate = 86400
export const dynamicParams = true

const SITE = 'https://theliftinglab.co.uk'
const YEAR = 2026

type BrandData = {
  brand: string
  products: ScoredProduct[]
  categories: string[]
  avgScore: number | null
  bestScore: number | null
}

// One query, then resolve the requested slug by matching slugified brand names
// over the live product set — no reverse-lookup table that could drift.
async function getBrand(slug: string): Promise<BrandData | null> {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('status', 'active')
    if (error || !data) return null
    const matches = (data as Product[])
      .filter((p) => p.brand && brandSlug(p.brand) === slug)
      .map(withScore)
    if (matches.length === 0) return null

    const products = sortScored(matches, 'score')
    const scores = products.map((p) => p.score).filter((s): s is number => s != null)
    return {
      brand: products[0].brand,
      products,
      categories: Array.from(new Set(products.map((p) => p.category))),
      avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      bestScore: scores.length ? Math.max(...scores) : null,
    }
  } catch {
    return null
  }
}

export async function generateStaticParams() {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb.from('products').select('brand').eq('status', 'active')
    if (error || !data) return []
    const slugs = new Set<string>()
    for (const row of data as { brand: string | null }[]) {
      if (row.brand && row.brand.trim()) slugs.add(brandSlug(row.brand))
    }
    return Array.from(slugs).map((slug) => ({ slug }))
  } catch {
    return []
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const data = await getBrand(slug)
  if (!data) return { title: 'Brand not found — The Lifting Lab' }
  const url = `${SITE}/brand/${slug}`
  const title = `${data.brand} Supplements — Reviews & Scores UK ${YEAR} | The Lifting Lab`
  const description = `${data.brand} supplements scored against evidence-based dosing. We track ${data.products.length} ${data.brand} ${data.products.length === 1 ? 'product' : 'products'}${data.avgScore != null ? `, averaging ${data.avgScore}/100` : ''}. See every product ranked by effectiveness.`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website', siteName: 'The Lifting Lab' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

function fmt(n: number) {
  return n < 10 ? `£${n.toFixed(2)}` : `£${Math.round(n)}`
}

export default async function BrandPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const data = await getBrand(slug)
  if (!data) notFound()

  const url = `${SITE}/brand/${slug}`
  const top = data.products[0]

  // Brand entity — the canonical node for "[brand] supplements" searches, with
  // its product range as a nested ItemList so Google can cluster the brand and
  // surface a ranked product list. Backed 1:1 by the visible product list.
  const brandJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Brand',
    name: data.brand,
    url,
    description: `${data.brand} sports nutrition and supplements, independently scored by The Lifting Lab against evidence-based clinical dosing.`,
  }

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${data.brand} products ranked`,
    description: `${data.brand} supplements ranked by The Lifting Lab Effectiveness Match score.`,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    numberOfItems: data.products.length,
    itemListElement: data.products.map((p, i) => ({
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

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: 'Brands', item: `${SITE}/brand` },
      { name: data.brand, item: url },
    ].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  }

  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(brandJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <main className="max-w-3xl mx-auto px-6 py-12">
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-lab-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/" className="hover:text-white">Home</Link></li>
            <li aria-hidden className="text-lab-border">/</li>
            <li><Link href="/brand" className="hover:text-white">Brands</Link></li>
            <li aria-hidden className="text-lab-border">/</li>
            <li aria-current="page" className="text-white/80">{data.brand}</li>
          </ol>
        </nav>

        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Brand Review · {YEAR}
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          {data.brand} <span className="text-lab-lime">Supplements</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          We score {data.products.length} {data.brand}{' '}
          {data.products.length === 1 ? 'product' : 'products'} across{' '}
          {data.categories.length}{' '}
          {data.categories.length === 1 ? 'category' : 'categories'}, rating each on how closely its
          active doses match the evidence-based clinical reference for its category — never on brand
          reputation or marketing.
        </p>
        {top && (
          <p className="text-lab-muted leading-relaxed mb-8">
            Their strongest pick on our scoring is{' '}
            <Link href={`/products/${top.id}`} className="text-white/90 hover:text-lab-lime underline underline-offset-2">
              {top.name}
            </Link>{' '}
            ({categoryLabel(top.category)}
            {top.score != null ? `, scoring ${top.score}/100` : ''}).
          </p>
        )}

        {/* stat strip */}
        <div className="grid grid-cols-3 gap-3 mb-10">
          {[
            { label: 'Products', value: String(data.products.length) },
            { label: 'Avg score', value: data.avgScore != null ? String(data.avgScore) : '–' },
            { label: 'Best score', value: data.bestScore != null ? String(data.bestScore) : '–' },
          ].map((s) => (
            <div key={s.label} className="bg-lab-panel border border-lab-border rounded-xl p-4 text-center">
              <p className="text-2xl font-black text-lab-lime leading-none">{s.value}</p>
              <p className="text-[10px] uppercase tracking-widest text-lab-muted mt-2">{s.label}</p>
            </div>
          ))}
        </div>

        {/* full product list, ranked */}
        <section>
          <h2 className="text-xl font-black uppercase tracking-wide mb-1">
            All {data.brand} <span className="text-lab-lime">products</span>
          </h2>
          <p className="text-lab-muted text-sm mb-5">
            Ranked by The Lifting Lab Effectiveness Match score.
          </p>
          <div className="space-y-3">
            {data.products.map((p) => {
              const hasGuide = GUIDE_SLUGS.includes(p.category)
              return (
                <div key={p.id} className="bg-lab-panel border border-lab-border rounded-xl p-4">
                  <div className="flex items-center gap-4">
                    <ScoreBadge score={p.score} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase tracking-widest text-lab-lime mb-0.5">
                        {categoryLabel(p.category)}
                      </p>
                      <Link href={`/products/${p.id}`} className="hover:text-lab-lime transition-colors">
                        <p className="text-white text-sm font-black leading-tight truncate">{p.name}</p>
                      </Link>
                      {p.cost_per_serving != null && (
                        <p className="text-[11px] text-white/60 mt-1">{fmt(p.cost_per_serving)} per serving</p>
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
                        href={`/guide/${p.category}`}
                        className="text-center text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl border border-lab-border text-lab-muted hover:text-white transition-colors"
                      >
                        Guide
                      </Link>
                    ) : (
                      <Link
                        href={`/products?category=${p.category}`}
                        className="text-center text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl border border-lab-border text-lab-muted hover:text-white transition-colors"
                      >
                        Category
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

        <section className="mt-14 bg-lab-panel border border-lab-border rounded-2xl p-6">
          <h2 className="text-lg font-black uppercase tracking-wide mb-3">
            How {data.brand} is scored
          </h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-3">
            Each product earns an Effectiveness Match score (0–100) measuring how closely its active
            ingredient doses match the evidence-based clinical reference for its category.
            Proprietary blends and amino-spiked formulas are penalised because they hide the real
            dose. We are independent — scores are never influenced by brands or affiliate deals.
          </p>
          <p className="text-lab-muted/70 text-xs leading-relaxed mb-5">
            Informational only — not medical advice. Buy links are affiliate links; we may earn a
            commission at no extra cost to you. This never affects scoring.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/brand"
              className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
            >
              All brands →
            </Link>
            <Link
              href="/products"
              className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
            >
              Browse all products
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}
