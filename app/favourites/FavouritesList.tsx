'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import ScoreBadge from '@/components/ScoreBadge'
import FavouriteButton from '@/components/FavouriteButton'
import { categoryLabel } from '@/lib/categories'
import { track } from '@/lib/gtag'
import { amazonSearch } from '@/lib/affiliate'
import type { ScoredProduct } from '@/lib/products'

export default function FavouritesList() {
  const [products, setProducts] = useState<ScoredProduct[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/favourites')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return
        setProducts(data && Array.isArray(data.products) ? data.products : [])
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setProducts([])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function removeFav(id: string) {
    setProducts((prev) => prev.filter((p) => p.id !== id))
  }

  if (loading) {
    return (
      <p className="text-lab-muted text-xs uppercase tracking-widest font-bold">Loading…</p>
    )
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-4xl mb-3">🤍</p>
        <p className="text-sm text-lab-muted">No favourites yet.</p>
        <Link
          href="/products"
          className="inline-block mt-5 text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-4 py-2 rounded-lg hover:opacity-90"
        >
          Browse products →
        </Link>
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {products.map((p) => (
        <div
          key={p.id}
          className="flex items-center gap-4 bg-lab-panel border border-lab-border rounded-xl p-4"
        >
          <ScoreBadge score={p.score} />
          <div className="min-w-0 flex-1">
            <p className="text-white text-sm font-bold truncate">{p.brand}</p>
            <p className="text-lab-muted text-xs truncate">{p.name}</p>
            <span className="inline-block mt-1.5 text-[10px] uppercase tracking-widest font-bold bg-lab-panel-2 text-lab-muted px-2 py-0.5 rounded-full">
              {categoryLabel(p.category)}
            </span>
          </div>
          <FavouriteButton
            productId={p.id}
            favourited={true}
            signedIn={true}
            onChange={(fav) => {
              if (!fav) removeFav(p.id)
            }}
          />
          <a
            href={amazonSearch(p.brand, p.name)}
            target="_blank"
            rel="noopener noreferrer nofollow"
            onClick={() => track('buy_click', { item_brand: p.brand, item_name: p.name })}
            className="shrink-0 text-[10px] uppercase tracking-widest font-bold bg-lab-lime text-black px-3 py-1.5 rounded-lg hover:opacity-90"
          >
            Buy
          </a>
        </div>
      ))}
    </div>
  )
}
