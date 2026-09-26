import { formatListedServingPrice } from '@/lib/products'
import { serializeJsonForHtml } from '@/lib/json-for-html'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import ProductAssessment from '@/components/ProductAssessment'
import ProductOfferLink from '@/components/ProductOfferLink'
import { CATEGORIES, categoryLabel } from '@/lib/categories'
import { categoryResearchProducts } from '@/lib/best-categories'

export const revalidate = 86400
export const dynamicParams = true
const SITE = 'https://www.theliftinglab.co.uk'
const known = (slug: string) => CATEGORIES.some(category => category.slug === slug)
export async function generateStaticParams() { return CATEGORIES.map(({ slug }) => ({ category: slug })) }
export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params
  if (!known(category)) return { title: 'Category not found — The Lifting Lab' }
  const title = `${categoryLabel(category)} research — ranking unavailable | The Lifting Lab`
  const description = 'Browse product records and listed prices. No approved effectiveness assessment is available, so no best-product or dosing recommendation is made. Historical scores are unverified.'
  const url = `${SITE}/best/${category}`
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, type: 'website' }, twitter: { card: 'summary_large_image', title, description } }
}
export default async function BestCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params
  if (!known(category)) notFound()
  const products = await categoryResearchProducts(category), label = categoryLabel(category)
  const list = { '@context': 'https://schema.org', '@type': 'ItemList', name: `${label} research records`, itemListOrder: 'https://schema.org/ItemListUnordered', numberOfItems: products.length,
    itemListElement: products.map(p => ({ '@type': 'Product', name: `${p.brand} ${p.name}`, url: `${SITE}/products/${p.id}` })) }
  return <div className="min-h-screen bg-lab-bg text-white"><TopNav />
    {products.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonForHtml(list) }} />}
    <main className="max-w-5xl mx-auto px-4 py-10 space-y-6">
      <h1 className="text-3xl font-black">{label} research</h1>
      <div className="rounded-xl border border-lab-border bg-lab-panel p-5 space-y-2">
        <h2 className="text-lg font-bold">Effectiveness ranking unavailable</h2>
        <p>No approved product assessment is available. Historical percentages do not establish effectiveness, an appropriate dose or a best buy.</p>
        <p>Records remain available below in alphabetical order. Listed prices and serving counts are research data; check the current product, pack, price and stock with the retailer.</p>
      </div>
      <div className="flex flex-wrap gap-4"><Link className="underline" href={`/products?category=${category}`}>Browse all {label} records</Link><Link className="underline" href="/cheapest">Compare listed prices only</Link><Link className="underline" href="/stack">Build a manual research stack</Link></div>
      {products.length === 0 ? <p>No catalogue records are available here at present. The research browser remains available.</p> : <div className="grid gap-4 md:grid-cols-2">
        {products.map(p => <article key={p.id} className="rounded-xl border border-lab-border bg-lab-panel p-4 space-y-3">
          <div className="flex items-start gap-4"><ProductAssessment product={p} size="sm" /><div className="min-w-0"><h2 className="font-bold break-words"><Link href={`/products/${p.id}`}>{p.brand} {p.name}</Link></h2><p className="text-sm text-lab-muted">{p.cost_per_serving !== null && p.cost_per_serving > 0 ? `${formatListedServingPrice(p.cost_per_serving)} listed price per serving` : 'Listed price per serving unavailable'}</p></div></div>
          <div className="flex flex-wrap gap-4"><Link className="underline" href={`/products/${p.id}`}>Label and research record</Link><ProductOfferLink product={p} /></div>
        </article>)}
      </div>}
    </main></div>
}
