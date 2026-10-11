import Link from 'next/link'
import ProductImage from './ProductImage'
import { formatListedServingPrice, type ScoredProduct } from '@/lib/products'

function formatPackPrice(price: number | null) {
  return typeof price === 'number' && Number.isFinite(price) && price > 0 ? `£${price.toFixed(2)}` : 'Unavailable'
}

export default function TopProductsTable({ products }: { products: ScoredProduct[] }) {
  const rows = [...products]
    .sort((a, b) => {
      const completeA = Number(Boolean(a.image_url)) + Number(a.retail_price !== null) + Number(a.cost_per_serving !== null)
      const completeB = Number(Boolean(b.image_url)) + Number(b.retail_price !== null) + Number(b.cost_per_serving !== null)
      return completeB - completeA || a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name)
    })
    .slice(0, 6)

  return <section aria-labelledby="top-products-heading" className="mx-auto max-w-[1920px] px-5 py-10 sm:px-8 sm:py-14 lg:px-11">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
      <h2 id="top-products-heading" className="text-3xl font-black tracking-tight sm:text-4xl">Our top picks this month</h2>
      <Link href="/products" className="text-base font-black text-[#4a6e0b] underline decoration-2 underline-offset-4 sm:text-lg">See all {products.length} products</Link>
    </div>

    {rows.length === 0 ? (
      <div className="rounded-2xl border border-[#ddddd3] bg-white px-6 py-14 text-center text-[#62645a]">Product records are unavailable in this visual preview.</div>
    ) : (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {rows.map((product) => (
          <Link key={product.id} href={`/products/${product.id}`} className="group overflow-hidden rounded-xl border border-[#ddddd3] bg-white text-[#12120f] transition-colors hover:border-[#77786d]">
            <div className="aspect-square overflow-hidden border-b border-[#e2e2d9] bg-[#ecece4] p-3 sm:p-4">
              <ProductImage src={product.image_url} alt={`${product.brand} ${product.name}`} size={260} fill className="transition-transform duration-200 group-hover:scale-[1.02]" />
            </div>
            <div className="p-3.5 sm:p-4">
              <h3 className="tll-display text-[22px] leading-none sm:text-[25px]">{product.brand}</h3>
              <p className="mt-1.5 min-h-10 text-sm font-normal leading-5 text-[#55574f]">{product.name}</p>
              <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-[#e2e2d9] pt-3">
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-[.05em] text-[#6d6f65]">Total cost</dt>
                  <dd className="mt-1 font-mono text-sm font-black">{formatPackPrice(product.retail_price)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-[.05em] text-[#6d6f65]">Per serving</dt>
                  <dd className="mt-1 font-mono text-sm font-black">{product.cost_per_serving !== null ? formatListedServingPrice(product.cost_per_serving) : 'Unavailable'}</dd>
                </div>
              </dl>
            </div>
          </Link>
        ))}
      </div>
    )}

    <p className="mt-4 text-xs leading-5 text-[#686a61]">Current catalogue selection based on complete product records. This is not an effectiveness ranking.</p>
  </section>
}
