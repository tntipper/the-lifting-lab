import { serializeJsonForHtml } from '@/lib/json-for-html'
import type { Metadata } from 'next'
import TopNav from '@/components/TopNav'
import ProductGrid from './ProductGrid'
import { categoryLabel } from '@/lib/categories'
import { fetchCatalogue } from '@/lib/product-data'

// Refresh daily so newly added/rescored products flow into the page + schema.
export const revalidate = 86400

const SITE = 'https://www.theliftinglab.co.uk'

export const metadata: Metadata = {
  "title": "Supplement research catalogue",
  "description": "All tracked product records, including historical, unassessed and under-review entries. No approved effectiveness recommendations; compare labels and listed prices.",
  "alternates": {
    "canonical": "https://www.theliftinglab.co.uk/products"
  },
  "openGraph": {
    "title": "Supplement research catalogue",
    "description": "All tracked product records, including historical, unassessed and under-review entries. No approved effectiveness recommendations; compare labels and listed prices.",
    "url": "https://www.theliftinglab.co.uk/products",
    "type": "website"
  },
  "twitter": {
    "card": "summary_large_image",
    "title": "Supplement research catalogue",
    "description": "All tracked product records, including historical, unassessed and under-review entries. No approved effectiveness recommendations; compare labels and listed prices."
  }
}

// The catalogue is fetched server-side and passed into ProductGrid as its
// initial state, so the first HTML response already contains every product
// card (name, brand, score, true cost, buy link, image) plus the ItemList
// schema and a crawlable <h1>. ProductGrid layers filtering / sorting /
// favourites on top after hydration. DB-failure safe: an empty result renders
// the grid's own empty state, never a 500.
export default async function ProductsPage() {
  const products = await fetchCatalogue()

  const itemListJsonLd = products.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'UK Supplement Research Records',
    description:
      'Active supplement research records. Historical values are unverified and do not grant an effectiveness ranking.',
    itemListOrder: 'https://schema.org/ItemListUnordered',
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
          dangerouslySetInnerHTML={{ __html: serializeJsonForHtml(itemListJsonLd) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonForHtml(breadcrumbJsonLd) }}
      />
      <section className="tll-on-dark tll-dark-section border-b border-[#2a2c26]">
        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6 sm:py-10">
          <p className="text-xs font-semibold uppercase tracking-[.08em] text-[#a9ac9f]">
            {products.length} products · label and price records
          </p>
          <h1 className="tll-display mt-2 text-4xl leading-none text-white sm:text-5xl">
            Browse supplement research records &amp; listed prices
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#a9ac9f]">
            Choose up to three products, compare them side by side, then add the products you want to My Stack.
          </p>
        </div>
      </section>
      <main className="mx-auto max-w-7xl px-5 py-6 sm:px-6 sm:py-8">
        <ProductGrid initialProducts={products} />
      </main>
    </div>
  )
}
