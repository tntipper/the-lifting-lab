'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import ScoreBadge from '@/components/ScoreBadge'
import { categoryLabel } from '@/lib/categories'
import { track } from '@/lib/gtag'
import type { ComparedProduct } from '@/lib/products'

export default function CompareView() {
  const params = useSearchParams()
  const idsParam = params.get('ids') || ''
  const [products, setProducts] = useState<ComparedProduct[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!idsParam) {
        setProducts([])
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const r = await fetch(`/api/products/compare?ids=${encodeURIComponent(idsParam)}`)
        const data = (await r.json()) as ComparedProduct[]
        if (cancelled) return
        const list = Array.isArray(data) ? data : []
        setProducts(list)
        setLoading(false)
        if (list.length) track('compare_view', { count: list.length })
      } catch {
        if (cancelled) return
        setProducts([])
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [idsParam])

  if (loading) return <p className="text-lab-muted text-sm">Loading comparison…</p>

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

  return (
    <div className="space-y-8">
      {/* verdict */}
      {bestRated && (
        <div className="bg-lab-panel border border-lab-lime/40 rounded-2xl p-5 lab-glow">
          <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">Verdict</p>
          <p className="text-white text-sm">
            <span className="font-black">{bestRated.brand} {bestRated.name}</span> wins on clinical
            rating with a score of <span className="text-lab-lime font-black">{bestRated.score}</span>.
          </p>
          <p className="text-lab-muted text-xs mt-1">
            Value-per-serving ranking needs price data, which is not yet in the catalogue.
          </p>
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
            <div className="flex justify-center mb-2">
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
            {p.serving_size ? `${p.serving_size}${p.serving_unit || ''}` : '—'}
          </Cell>
        ))}

        {/* nutrient rows */}
        {nutrientNames.map((name) => (
          <Row key={name} name={name} products={products} amountFor={amountFor} />
        ))}
      </div>

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
      className={`px-3 py-2.5 text-sm border-b border-lab-border ${
        head
          ? 'text-lab-muted text-xs uppercase tracking-widest font-bold'
          : 'text-white text-center font-medium'
      }`}
    >
      {children}
    </div>
  )
}
