import type { Metadata } from 'next'
import { Suspense } from 'react'
import TopNav from '@/components/TopNav'
import ProductGrid from './ProductGrid'
import { categoryLabel } from '@/lib/categories'
import { createPublicClient } from '@/lib/supabase-public'
import { PRODUCT_COLUMNS, withScore, sortScored, type Product } from '@/lib/products'

// Refresh daily so newly added/rescored products flow into the structured data.
export const revalidate = 86400

const SITE = 'https://www.theliftinglab.co.uk'

export const metadata: Metadata = {
  title: 'Browse Supplements — The Lifting Lab',
  description:
    'Browse 200+ UK supplements ranked by Effectiveness Match scoring. Filter by category, sort by rating, and compare effective dosing and true value.',
  alternates: { canonical: `${SITE}/products` },
}

// The interactive catalogue (ProductGrid) is a client component, so the server
// HTML for this — the core commercial page — previously had no <h1> and no
// JSON-LD (a crawler with JS disabled saw only the "Loading…" fallback). Fetch
// the catalogue server-side to emit a real ItemList + a crawlable <h1> in the
// initial response. Mirrors the /best fetch pattern and is DB-failure safe: an
// empty result just omits the schema, never a 500.
async function catalogue() {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('status', 'active')
    if (error || !data) return []
    return sortScored((data as Product[]).map(withScore), 'score')
  } catch {
    return []
  }
}

export default async function ProductsPage() {
  const products = await catalogue()

  const itemListJsonLd = products.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'UK Supplements Ranked by Effectiveness Match',
    description:
      'Every supplement The Lifting Lab tracks, scored against evidence-based reference doses and ranked by Effectiveness Match.',
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    numberOfItems: products.length,
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
  } : null

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: 'Browse Supplements', item: `${SITE}/products` },
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
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="sr-only">Browse Supplements — Scored &amp; Compared by Effectiveness Match</h1>
        <Suspense fallback={<div className="text-lab-muted text-sm py-8 text-center">Loading…</div>}>
          <ProductGrid />
        </Suspense>
      </div>
    </div>
  )
}
