'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import ProductAssessment from '@/components/ProductAssessment'
import ProductImage from '@/components/ProductImage'
import ProductOfferLink from '@/components/ProductOfferLink'
import { categoryLabel } from '@/lib/categories'
import { track } from '@/lib/gtag'
import { formatListedServingPrice, trueCostReason, type ComparedProduct } from '@/lib/products'

function finitePositive(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export default function CompareView({ products }: { products: ComparedProduct[] }) {
  useEffect(() => {
    if (products.length) track('compare_view', { count: products.length })
  }, [products])

  if (!products.length) {
    return (
      <div className="rounded-xl border border-lab-border bg-lab-panel px-5 py-16 text-center">
        <h2 className="text-xl font-semibold text-white">Your comparison is empty</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-lab-muted">Choose up to three products in the shop. They will appear in three fixed slots before you open this side-by-side view.</p>
        <Link href="/products" className="tll-primary-button mt-6">Browse products</Link>
      </div>
    )
  }

  const nutrientNames: string[] = []
  for (const product of products) {
    for (const nutrient of product.nutrients) {
      if (!nutrientNames.includes(nutrient.nutrient_name)) nutrientNames.push(nutrient.nutrient_name)
    }
  }

  const costs = products.map((product) => product.cost_per_serving).filter(finitePositive)
  const prices = products.map((product) => product.retail_price).filter(finitePositive)
  const servings = products.map((product) => product.servings_per_container).filter(finitePositive)
  const lowestCost = costs.length ? Math.min(...costs) : null
  const lowestPrice = prices.length ? Math.min(...prices) : null
  const highestServings = servings.length ? Math.max(...servings) : null
  const anyInformedSport = products.some((product) => product.informed_sport)
  const anyFlags = products.some((product) => product.proprietary_blend || product.amino_spiked || product.protein_yield != null)

  function amountFor(product: ComparedProduct, name: string) {
    const nutrient = product.nutrients.find((item) => item.nutrient_name === name)
    return nutrient ? `${nutrient.amount}${nutrient.unit}` : 'Not listed'
  }

  function remainingHref(id: string) {
    const remaining = products.filter((product) => product.id !== id).map((product) => product.id)
    return remaining.length ? `/compare?ids=${remaining.join(',')}` : '/products'
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-white">Side by side</h2>
          <p className="mt-1 text-sm text-lab-muted">The same product facts, aligned row by row.</p>
        </div>
        <Link href="/products" className="min-h-11 py-3 text-sm font-semibold text-lab-lime underline underline-offset-4">Change products</Link>
      </div>

      <p className="rounded-lg bg-[#fbf0d9] px-3 py-2 text-sm leading-5 text-[#8a5a00]">
        No approved effectiveness assessment is available. Price and serving tags describe the recorded numbers only; they are not product recommendations.
      </p>

      <p id="comparison-scroll-hint" className="text-xs text-lab-muted md:hidden">
        Swipe or scroll sideways if needed to see all products →
        <span className="sr-only"> Keyboard users can focus the comparison and use the arrow keys.</span>
      </p>

      <div
        role="region"
        aria-label="Product comparison"
        aria-describedby="comparison-scroll-hint"
        tabIndex={0}
        className="overflow-x-auto rounded-xl border border-lab-border bg-lab-panel focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lab-lime"
      >
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-44 min-w-44 border-b border-lab-border bg-lab-panel p-4 text-left text-xs font-semibold uppercase tracking-[.08em] text-lab-muted">Compare</th>
              {products.map((product) => (
                <th key={product.id} className="min-w-[180px] border-b border-lab-border p-4 text-left align-top">
                  <div className="grid gap-3">
                    <div className="grid h-28 place-items-center rounded-lg bg-lab-panel-2">
                      <ProductImage src={product.image_url} alt={`${product.brand} ${product.name}`} size={88} />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-lab-muted">{product.brand}</p>
                      <p className="mt-0.5 text-base font-semibold leading-5 text-white">{product.name}</p>
                      <p className="mt-1 text-xs font-normal text-lab-muted">{categoryLabel(product.category)}</p>
                    </div>
                    <ProductAssessment product={product} size="sm" />
                    <Link href={remainingHref(product.id)} className="min-h-9 justify-self-start py-2 text-xs font-semibold text-lab-lime underline underline-offset-4">
                      Remove
                    </Link>
                  </div>
                </th>
              ))}
              {Array.from({ length: Math.max(0, 3 - products.length) }).map((_, index) => (
                <th key={`empty-${index}`} className="min-w-[180px] border-b border-lab-border p-4 align-top">
                  <Link href="/products" className="grid min-h-44 place-items-center rounded-lg border border-dashed border-[#7c7e72] px-3 text-center text-sm font-medium text-lab-muted">
                    Add another product
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <GroupRow label="Price and pack" columns={3} />
            <CompareRow label="Listed price per serving" products={products} render={(product) => (
              product.cost_per_serving != null ? <Metric value={formatListedServingPrice(product.cost_per_serving)} tag={product.cost_per_serving === lowestCost ? 'Lowest' : undefined} />
                : <span title={trueCostReason(product) ?? undefined}>Not listed</span>
            )} />
            <CompareRow label="Pack price" products={products} render={(product) => (
              product.retail_price != null ? <Metric value={`£${product.retail_price.toFixed(2)}`} tag={product.retail_price === lowestPrice ? 'Lowest' : undefined} /> : 'Not listed'
            )} />
            <CompareRow label="Servings" products={products} render={(product) => (
              product.servings_per_container != null ? <Metric value={String(product.servings_per_container)} tag={product.servings_per_container === highestServings ? 'Highest' : undefined} /> : 'Not listed'
            )} />
            <CompareRow label="Serving size" products={products} render={(product) => (
              product.serving_size != null ? `${product.serving_size}${product.serving_unit ?? ''}` : 'Not listed'
            )} />

            {nutrientNames.length > 0 && <GroupRow label="Ingredients per serving" columns={3} />}
            {nutrientNames.map((name) => (
              <CompareRow key={name} label={name} products={products} render={(product) => amountFor(product, name)} />
            ))}

            {(anyInformedSport || anyFlags) && <GroupRow label="Recorded product details" columns={3} />}
            {anyInformedSport && <CompareRow label="Informed Sport" products={products} render={(product) => product.informed_sport ? 'Certified' : 'Not listed'} />}
            {anyFlags && (
              <>
                <CompareRow label="Protein yield" products={products} render={(product) => product.protein_yield != null ? `${product.protein_yield}%` : 'Not listed'} />
                <CompareRow label="Proprietary blend" products={products} render={(product) => product.proprietary_blend ? 'Yes' : 'No'} />
                <CompareRow label="Amino spiking flag" products={products} render={(product) => product.amino_spiked ? 'Yes' : 'No'} />
              </>
            )}

            <GroupRow label="Next step" columns={3} />
            <tr>
              <th className="sticky left-0 z-10 border-b border-lab-border bg-lab-panel p-3 text-left text-xs font-semibold uppercase tracking-[.08em] text-lab-muted">Retailer listing</th>
              {products.map((product) => (
                <td key={product.id} className="border-b border-lab-border p-3 align-top">
                  <ProductOfferLink product={product} className="w-full rounded-md bg-[#14140f] py-3 text-sm font-semibold uppercase tracking-wide text-[#a6e22e]" />
                </td>
              ))}
              {Array.from({ length: Math.max(0, 3 - products.length) }).map((_, index) => <td key={`empty-offer-${index}`} className="border-b border-lab-border p-3" />)}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap justify-between gap-3">
        <Link href="/products" className="tll-secondary-button">← Back to shop</Link>
        <Link href="/stack" className="tll-primary-button">Review My Stack →</Link>
      </div>
    </div>
  )
}

function Metric({ value, tag }: { value: string; tag?: string }) {
  return <span className="inline-flex flex-wrap items-center gap-2"><span>{value}</span>{tag && <span className="rounded bg-[#e6eef8] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#1f4f8a]">{tag}</span>}</span>
}

function GroupRow({ label, columns }: { label: string; columns: number }) {
  return (
    <tr>
      <th className="sticky left-0 z-10 bg-lab-panel-2 p-3 text-left text-[11px] font-semibold uppercase tracking-[.08em] text-lab-muted">{label}</th>
      {Array.from({ length: columns }).map((_, index) => <td key={index} className="bg-lab-panel-2 p-3" />)}
    </tr>
  )
}

function CompareRow({ label, products, render }: {
  label: string
  products: ComparedProduct[]
  render: (product: ComparedProduct) => React.ReactNode
}) {
  return (
    <tr>
      <th className="sticky left-0 z-10 border-b border-lab-border bg-lab-panel p-3 text-left font-medium text-lab-muted">{label}</th>
      {products.map((product) => <td key={product.id} className="border-b border-lab-border p-3 font-mono text-white">{render(product)}</td>)}
      {Array.from({ length: Math.max(0, 3 - products.length) }).map((_, index) => <td key={index} className="border-b border-lab-border p-3" />)}
    </tr>
  )
}
