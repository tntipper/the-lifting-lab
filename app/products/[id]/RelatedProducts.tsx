'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import ScoreBadge from '@/components/ScoreBadge'
import { categoryLabel } from '@/lib/categories'
import { productSlug } from '@/lib/matchups'
import { track } from '@/lib/gtag'
import type { ScoredProduct } from '@/lib/products'

// Cross-sell / internal-link module shown on a product detail page. Pulls the
// same category (score-sorted from the public API), drops the current product,
// and surfaces better-rated alternatives — driving affiliate clicks and giving
// crawlers product-to-product internal links (pages were previously islands).
export default function RelatedProducts({
  productId,
  category,
  score,
  brand,
  name,
}: {
  productId: string
  category: string
  score: number | null
  brand: string
  name: string
}) {
  const [items, setItems] = useState<ScoredProduct[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/products?category=${encodeURIComponent(category)}&sort=score`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ScoredProduct[]) => {
        if (cancelled) return
        const list = Array.isArray(data) ? data : []
        setItems(list.filter((p) => p.id !== productId))
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
    return () => {
      cancelled = true
    }
  }, [productId, category])

  if (!items || items.length === 0) return null

  // Prefer genuinely higher-scoring options; if this product already tops the
  // category, fall back to the next-best picks so the slot is never empty.
  const better = score != null ? items.filter((p) => p.score != null && p.score > score) : []
  const isUpgrade = better.length > 0
  // API already returns score-desc, so the slice is the top of the list.
  const picks = (isUpgrade ? better : items).slice(0, 3)
  if (picks.length === 0) return null

  const label = categoryLabel(category)

  return (
    <div className="bg-lab-panel border border-lab-border rounded-2xl p-5">
      <p className="text-[11px] uppercase tracking-widest font-bold text-lab-muted mb-1">
        {isUpgrade ? 'Rated Higher' : `Top ${label}`}
      </p>
      <p className="text-xs text-gray-500 mb-4">
        {isUpgrade
          ? `Better-scoring ${label.toLowerCase()} on our reference spec.`
          : `Other strong ${label.toLowerCase()} picks worth a look.`}
      </p>
      <div className="space-y-2">
        {picks.map((p) => {
          const delta = isUpgrade && score != null && p.score != null ? p.score - score : null
          return (
            <Link
              key={p.id}
              href={`/products/${p.id}`}
              onClick={() =>
                track('related_click', {
                  item_brand: p.brand,
                  item_name: p.name,
                  from_product: productId,
                })
              }
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-lab-border hover:border-lab-lime/50 hover:bg-lab-lime/5 transition-colors"
            >
              <ScoreBadge score={p.score} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-white text-xs font-bold truncate">{p.brand}</p>
                <p className="text-lab-muted text-xs truncate">{p.name}</p>
              </div>
              {p.cost_per_serving != null && (
                <span className="text-[10px] text-lab-muted shrink-0">
                  £{p.cost_per_serving.toFixed(2)}/srv
                </span>
              )}
              {delta != null && delta > 0 && (
                <span className="text-[10px] font-black text-lab-lime shrink-0">+{delta}</span>
              )}
            </Link>
          )
        })}
      </div>
      {items.length >= 3 && (
        <Link
          href={`/alternatives/${productSlug(brand, name)}`}
          onClick={() => track('alternatives_click', { from_product: productId })}
          className="mt-4 inline-block text-xs font-bold text-lab-lime hover:underline underline-offset-2"
        >
          See all alternatives to {name} →
        </Link>
      )}
    </div>
  )
}
