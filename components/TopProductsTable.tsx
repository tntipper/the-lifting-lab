import Link from 'next/link'
import ProductAssessment from './ProductAssessment'
import { formatListedServingPrice, type ScoredProduct } from '@/lib/products'

export default function TopProductsTable({ products }: { products: ScoredProduct[] }) {
  const rows = [...products]
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 5)

  return <section aria-labelledby="top-products-heading" className="mx-auto max-w-[1920px] px-5 py-14 sm:px-8 sm:py-20">
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 sm:mb-12">
      <h2 id="top-products-heading" className="text-3xl font-black tracking-tight sm:text-4xl">Product research this month</h2>
      <Link href="/products" className="text-lg font-black text-[#4a6e0b] underline decoration-2 underline-offset-4">See all {products.length} products</Link>
    </div>
    <div className="overflow-hidden rounded-2xl border border-lab-border bg-white">
      {rows.length === 0 ? <p className="px-6 py-14 text-center text-lab-muted">Product records are unavailable in this visual preview.</p> : rows.map((product, index) => <article key={product.id}
        className="grid min-h-[126px] items-center gap-5 border-b border-lab-border px-5 py-5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:px-7">
        <div className="grid min-w-0 grid-cols-[2.5rem_1fr] gap-3">
          <span className="font-mono text-lg font-black text-lab-muted">{String(index + 1).padStart(2, '0')}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black uppercase tracking-[.06em] text-lab-muted">{product.brand}</p>
            <h3 className="mt-1 text-xl font-black leading-tight sm:text-2xl">{product.name}</h3>
          </div>
        </div>
        <div className="justify-self-start rounded-lg bg-[#e6eef8] px-4 py-3 sm:justify-self-end">
          <ProductAssessment product={product} size="lg" />
        </div>
        <div className="flex items-center justify-between gap-5 sm:justify-end">
          <div className="text-right">
            <p className="text-xs font-black uppercase tracking-[.05em] text-lab-muted">Listed cost</p>
            <p className="font-mono text-2xl font-black">{product.cost_per_serving ? formatListedServingPrice(product.cost_per_serving) : '—'}</p>
          </div>
          <Link href={`/products/${product.id}`} className="inline-flex min-h-14 items-center rounded-xl border border-[#7c7e72] px-7 text-base font-black">View</Link>
        </div>
      </article>)}
    </div>
  </section>
}
