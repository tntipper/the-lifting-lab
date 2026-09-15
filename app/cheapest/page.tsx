import { formatListedServingPrice } from '@/lib/products'
import { serializeJsonForHtml } from '@/lib/json-for-html'
import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import ProductAssessment from '@/components/ProductAssessment'
import ProductOfferLink from '@/components/ProductOfferLink'
import { categoryLabel } from '@/lib/categories'
import { fetchCheapest } from '@/lib/cheapest'
export const revalidate = 86400
const SITE = 'https://www.theliftinglab.co.uk'
export const metadata: Metadata = { title: 'Listed supplement prices per serving | The Lifting Lab', description: 'Compare listed prices divided by known servings. Price order is not an effectiveness recommendation, a comparison of equivalent doses or a confirmed retailer offer.', alternates: { canonical: `${SITE}/cheapest` } }
export default async function CheapestPage() {
  const rows = await fetchCheapest()
  const list = { '@context': 'https://schema.org', '@type': 'ItemList', name: 'Listed price per serving, low to high', description: 'Price-only order using recorded prices and known serving counts; no effectiveness or offer approval.', itemListOrder: 'https://schema.org/ItemListOrderAscending', numberOfItems: rows.length,
    itemListElement: rows.map((p, index) => ({ '@type': 'ListItem', position: index + 1, item: { '@type': 'Product', name: `${p.brand} ${p.name}`, url: `${SITE}/products/${p.id}` } })) }
  return <div className="min-h-screen bg-lab-bg text-white"><TopNav />
    {rows.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonForHtml(list) }} />}
    <main className="max-w-4xl mx-auto px-4 py-10 space-y-6"><h1 className="text-3xl font-black">Listed price per serving</h1>
      <div className="rounded-xl border border-lab-border bg-lab-panel p-5 space-y-2"><h2 className="font-bold">Price comparison only</h2><p>Listed retail price divided by the known number of servings in the pack, lowest first using the unrounded ratio. Displayed pounds are rounded; values below a penny are marked explicitly. Missing, nonfinite or nonpositive price/serving inputs are excluded.</p><p>Serving sizes, formulas and categories differ. A lower price does not establish an equivalent dose, effectiveness, suitability or a best buy. Historical scores are unverified and do not decide this order.</p><p>These recorded prices exclude delivery and checkout adjustments and are not approved purchase offers. Check the exact product, pack, current price and stock with the retailer.</p></div>
      <Link href="/products" className="underline">Browse all research records, including products without a known price</Link>
      {rows.length === 0 ? <p>No usable listed-price comparisons are available.</p> : <div className="space-y-3">{rows.map((p, index) => <article key={p.id} className="rounded-xl border border-lab-border bg-lab-panel p-4 space-y-3">
        <div className="flex items-start gap-3"><span className="text-lab-muted text-sm">#{index + 1}</span><ProductAssessment product={p} size="sm" /><div className="min-w-0 flex-1"><h2 className="font-bold break-words"><Link href={`/products/${p.id}`}>{p.brand} {p.name}</Link></h2><p className="text-lab-muted text-xs">{categoryLabel(p.category)}</p><p className="font-bold">{formatListedServingPrice(p.cost_per_serving)} listed price per serving</p></div></div>
        <div className="flex flex-wrap gap-4"><Link className="underline" href={`/products/${p.id}`}>Label and research record</Link><ProductOfferLink product={p} /></div>
      </article>)}</div>}
    </main></div>
}
