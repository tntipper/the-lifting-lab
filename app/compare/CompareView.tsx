'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import ScoreBadge from '@/components/ScoreBadge'
import ProductImage from '@/components/ProductImage'
import { categoryLabel } from '@/lib/categories'
import { buyLink } from '@/lib/affiliate'
import { track } from '@/lib/gtag'
import { hasVerifiedCost, trueCostReason, type ComparedProduct } from '@/lib/products'

// Products arrive fully resolved (with nutrients) from the server component in
// page.tsx, so the comparison table is in the initial HTML — no client fetch,
// no spinner. Only analytics + affiliate click handlers hydrate.
export default function CompareView({ products }: { products: ComparedProduct[] }) {
  useEffect(() => {
    if (products.length) track('compare_view', { count: products.length })
  }, [products])

  if (!products.length) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-4xl mb-4">⚖️</p>
        <p className="text-sm mb-6">Select up to 3 products from the browser to compare them side by side.</p>
        <Link
          href="/products"
          className="inline-block text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
        >
          Browse products →
        </Link>
      </div>
    )
  }

  // union of nutrient names, preserving first-seen order
  const nutrientNames: string[] = []
  for (const p of products) {
    for (const n of p.nutrients) {
      if (!nutrientNames.includes(n.nutrient_name)) nutrientNames.push(n.nutrient_name)
    }
  }

  function amountFor(p: ComparedProduct, name: string): string {
    const n = p.nutrients.find((x) => x.nutrient_name === name)
    if (!n) return '—'
    return `${n.amount}${n.unit}`
  }

  // verdict: best by score (rating)
  const scored = products.filter((p) => p.score != null) as (ComparedProduct & { score: number })[]
  const bestRated = scored.length
    ? scored.reduce((a, b) => (b.score > a.score ? b : a))
    : null

  // best value: highest score per £/serving among products that have both
  const valued = products.filter(
    (p) => p.score != null && hasVerifiedCost(p), // unverified/£0 cost never competes (TLL-P0-3)
  ) as (ComparedProduct & { score: number; cost_per_serving: number })[]
  const bestValue = valued.length
    ? valued.reduce((a, b) => (b.score / b.cost_per_serving > a.score / a.cost_per_serving ? b : a))
    : null

  const priced = products.filter((p) => p.retail_price != null)
  const anyInformedSport = products.some((p) => p.informed_sport)
  const anyFlag = products.some((p) => p.proprietary_blend || p.amino_spiked || p.protein_yield != null)

  return (
    <div className="space-y-8">
      {/* verdict */}
      {bestRated && (
        <div className="bg-lab-panel border border-lab-lime/40 rounded-2xl p-5 lab-glow">
          <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">Verdict</p>
          <p className="text-white text-sm">
            <span className="font-black">{bestRated.brand} {bestRated.name}</span> wins on Effectiveness Match
            rating with a score of <span className="text-lab-lime font-black">{bestRated.score}</span>.
          </p>
          {bestValue ? (
            <p className="text-lab-muted text-xs mt-1">
              Best value per serving:{' '}
              <span className="text-white font-bold">{bestValue.brand} {bestValue.name}</span> at{' '}
              <span className="text-lab-lime font-bold">£{bestValue.cost_per_serving.toFixed(2)}/serving</span>{' '}
              (score {bestValue.score}).
            </p>
          ) : priced.length ? (
            <p className="text-lab-muted text-xs mt-1">
              Add servings-per-container data to rank value per serving.
            </p>
          ) : (
            <p className="text-lab-muted text-xs mt-1">
              No retail price on these products yet — value-per-serving ranking unavailable.
            </p>
          )}
        </div>
      )}

      {/* product headers */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `minmax(120px,1.2fr) repeat(${products.length}, minmax(0,1fr))` }}
      >
        <div />
        {products.map((p) => (
          <div key={p.id} className="bg-lab-panel border border-lab-border rounded-xl p-4 text-center">
            <div className="flex justify-center items-center gap-3 mb-2">
              <ProductImage src={p.image_url} alt={`${p.brand} ${p.name}`} size={56} />
              <ScoreBadge score={p.score} />
            </div>
            <p className="text-white text-xs font-bold leading-tight">{p.brand}</p>
            <p className="text-lab-muted text-[11px] leading-tight mt-0.5">{p.name}</p>
            <span className="inline-block mt-2 text-[9px] uppercase tracking-widest font-bold bg-lab-panel-2 text-lab-muted px-2 py-0.5 rounded-full">
              {categoryLabel(p.category)}
            </span>
            {bestRated?.id === p.id && (
              <p className="mt-2 text-[9px] uppercase tracking-widest font-black text-lab-lime">★ Best rated</p>
            )}
          </div>
        ))}

        {/* serving row */}
        <Cell head>Serving</Cell>
        {products.map((p) => (
          <Cell key={p.id}>
            <span>
              {p.serving_size ? `${p.serving_size}${p.serving_unit || ''}` : '—'}
              {p.servings_per_container != null && (
                <span className="block text-[10px] text-lab-muted font-normal">{p.servings_per_container} servings</span>
              )}
            </span>
          </Cell>
        ))}

        {/* retail price */}
        <Cell head>Retail</Cell>
        {products.map((p) => (
          <Cell key={p.id}>{p.retail_price != null ? `£${p.retail_price.toFixed(2)}` : '—'}</Cell>
        ))}

        {/* true cost per serving */}
        <Cell head>True Cost / serving</Cell>
        {products.map((p) => (
          <Cell key={p.id}>
            {p.cost_per_serving != null ? (
              <span className={bestValue?.id === p.id ? 'text-lab-lime font-black' : ''}>
                £{p.cost_per_serving.toFixed(2)}
              </span>
            ) : (
              <span title={trueCostReason(p) ?? undefined}>
                — <span className="block text-[10px] text-lab-muted font-normal">{trueCostReason(p)}</span>
              </span>
            )}
          </Cell>
        ))}

        {/* nutrient rows */}
        {nutrientNames.map((name) => (
          <Row key={name} name={name} products={products} amountFor={amountFor} />
        ))}

        {/* informed sport */}
        {anyInformedSport && (
          <>
            <Cell head>Informed Sport</Cell>
            {products.map((p) => (
              <Cell key={p.id}>{p.informed_sport ? '🛡️ Certified' : '—'}</Cell>
            ))}
          </>
        )}

        {/* key flags */}
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

        {/* buy row */}
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
                  onClick={() => track('buy_click', { item_brand: p.brand, item_name: p.name, from: 'compare' })}
                  className="w-full text-center text-[10px] font-black uppercase tracking-widest py-2 rounded-lg bg-lab-lime text-black hover:opacity-90 transition-opacity"
                >
                  Buy →
                </a>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-[9px] text-lab-muted/40 text-right -mt-4">affiliate links · open in a new tab</p>

      <div className="text-center pt-2">
        <Link
          href="/products"
          className="text-xs uppercase tracking-widest font-bold text-lab-muted hover:text-white"
        >
          ← Back to browse
        </Link>
      </div>
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
