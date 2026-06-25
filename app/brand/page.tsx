import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import { createPublicClient } from '@/lib/supabase-public'
import { PRODUCT_COLUMNS, withScore, type Product, type ScoredProduct } from '@/lib/products'
import { brandSlug, type BrandSummary } from '@/lib/brands'

// SSG with a daily refresh so newly added brands/products flow in without a
// redeploy. Mirrors the /best + guide fetch pattern (DB-failure safe: an empty
// result renders the graceful empty state, never a 500).
export const revalidate = 86400

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/brand`

export const metadata: Metadata = {
  title: 'Supplement Brands A–Z — Reviews & Scores UK 2026 | The Lifting Lab',
  description:
    'Every supplement brand we score, A to Z. See how each brand rates on average against evidence-based dosing, how many of their products we track, and their top performers.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'Supplement Brands A–Z — Reviews & Scores UK 2026',
    description:
      'Every supplement brand we score, ranked by average Effectiveness Match against evidence-based dosing.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Supplement Brands A–Z — The Lifting Lab',
    description: 'Every supplement brand we score, rated against evidence-based dosing.',
  },
}

async function brandSummaries(): Promise<BrandSummary[]> {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('status', 'active')
    if (error || !data) return []
    const scored: ScoredProduct[] = (data as Product[]).map(withScore)

    const groups = new Map<string, ScoredProduct[]>()
    for (const p of scored) {
      if (!p.brand || !p.brand.trim()) continue
      const slug = brandSlug(p.brand)
      if (!slug) continue
      const arr = groups.get(slug)
      if (arr) arr.push(p)
      else groups.set(slug, [p])
    }

    const summaries: BrandSummary[] = []
    for (const [slug, items] of groups) {
      const scores = items.map((p) => p.score).filter((s): s is number => s != null)
      const categories = Array.from(new Set(items.map((p) => p.category)))
      summaries.push({
        brand: items[0].brand,
        slug,
        count: items.length,
        categories,
        avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
        bestScore: scores.length ? Math.max(...scores) : null,
      })
    }
    return summaries.sort((a, b) => a.brand.localeCompare(b.brand))
  } catch {
    return []
  }
}

function scoreTint(score: number | null): string {
  if (score == null) return '#4b5563'
  if (score >= 70) return '#a6e22e'
  if (score >= 50) return '#e8a020'
  return '#e05a2b'
}

export default async function BrandIndexPage() {
  const brands = await brandSummaries()
  const totalProducts = brands.reduce((n, b) => n + b.count, 0)

  // CollectionPage + ItemList — signals this is a directory of brand entities.
  const itemListJsonLd = brands.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Supplement Brands A–Z',
    description: 'Supplement brands scored by The Lifting Lab against evidence-based dosing.',
    numberOfItems: brands.length,
    itemListElement: brands.map((b, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: { '@type': 'Brand', name: b.brand, url: `${SITE}/brand/${b.slug}` },
    })),
  } : null

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: 'Brands', item: URL },
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
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-lab-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/" className="hover:text-white">Home</Link></li>
            <li aria-hidden className="text-lab-border">/</li>
            <li aria-current="page" className="text-white/80">Brands</li>
          </ol>
        </nav>

        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Brand Directory
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Supplement Brands <span className="text-lab-lime">A–Z</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          Every brand we score, in one place. Each brand is rated by how closely its products&apos;
          active doses match the evidence-based clinical reference for their category — not by
          marketing spend or reputation.
        </p>
        {brands.length > 0 && (
          <p className="text-lab-muted leading-relaxed mb-10">
            Currently tracking {totalProducts} products across {brands.length} brands. Scores update
            as the catalogue changes.
          </p>
        )}

        {brands.length === 0 ? (
          <div className="text-center py-16 text-lab-muted">
            <p className="text-4xl mb-3">🏷️</p>
            <p className="text-sm">Brand directory is loading. Check back shortly.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {brands.map((b) => (
              <Link
                key={b.slug}
                href={`/brand/${b.slug}`}
                className="group flex items-center justify-between gap-3 bg-lab-panel border border-lab-border rounded-xl p-4 hover:border-lab-lime/40 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-white text-sm font-black truncate group-hover:text-lab-lime transition-colors">
                    {b.brand}
                  </p>
                  <p className="text-lab-muted text-xs mt-0.5">
                    {b.count} {b.count === 1 ? 'product' : 'products'} · {b.categories.length}{' '}
                    {b.categories.length === 1 ? 'category' : 'categories'}
                  </p>
                </div>
                {b.avgScore != null && (
                  <div className="text-right shrink-0">
                    <p
                      className="text-lg font-black leading-none"
                      style={{ color: scoreTint(b.avgScore) }}
                    >
                      {b.avgScore}
                    </p>
                    <p className="text-[9px] uppercase tracking-widest text-lab-muted mt-1">
                      avg score
                    </p>
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}

        <section className="mt-14 bg-lab-panel border border-lab-border rounded-2xl p-6">
          <h2 className="text-lg font-black uppercase tracking-wide mb-3">
            How brands are rated
          </h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-5">
            A brand&apos;s average score is the mean Effectiveness Match (0–100) of all its products
            we track. A high average means the brand consistently doses its actives to clinical
            standards across its range. Individual products can score higher or lower — open a brand
            to see every product ranked.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/best"
              className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
            >
              Best of 2026 →
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
