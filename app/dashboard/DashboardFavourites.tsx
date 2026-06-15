'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import FavouriteCard from '@/components/FavouriteCard'
import type { ScoredProduct } from '@/lib/products'

const PREVIEW = 4

// Dashboard "My Favourites" section: renders the user's saved products as the
// SAME cards used on the /favourites page (F13c) instead of a bare count tile.
// Reuses /api/favourites (full scored products) and the shared FavouriteCard.
export default function DashboardFavourites() {
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

  const shown = products.slice(0, PREVIEW)

  return (
    <div className="bg-lab-panel border border-lab-border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] uppercase tracking-widest font-bold text-lab-muted">
          My Favourites{!loading && products.length > 0 ? ` · ${products.length}` : ''}
        </p>
        {products.length > PREVIEW && (
          <Link href="/favourites" className="text-[11px] uppercase tracking-widest font-bold text-lab-lime hover:underline">
            View all →
          </Link>
        )}
      </div>

      {loading ? (
        <p className="text-lab-muted text-xs uppercase tracking-widest font-bold">Loading…</p>
      ) : products.length === 0 ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-lab-muted">
            <span className="mr-1">🤍</span> No favourites yet — tap the heart on any product.
          </p>
          <Link
            href="/products"
            className="shrink-0 text-[10px] uppercase tracking-widest font-bold bg-lab-lime text-black px-3 py-1.5 rounded-lg hover:opacity-90"
          >
            Browse →
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {shown.map((p) => (
            <FavouriteCard key={p.id} product={p} onRemove={removeFav} />
          ))}
        </div>
      )}
    </div>
  )
}
