'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import ScoreBadge from '@/components/ScoreBadge'
import { scoreFor } from '@/lib/scores'

type Product = {
  id: string
  name: string
  brand: string
  category: string
  serving_size: number | null
  serving_unit: string | null
}

const CATEGORY_LABELS: Record<string, string> = {
  whey: 'Whey',
  'whey-isolate': 'Whey Isolate',
  casein: 'Casein',
  'pre-workout': 'Pre-Workout',
  creatine: 'Creatine',
  eaas: 'EAAs',
  'intra-workout': 'Intra-Workout',
  'post-workout': 'Post-Workout',
  hydration: 'Hydration',
  'cycle-support': 'Cycle Support',
  'protein-bar': 'Protein Bar',
  'meal-replacement': 'Meal Replacement',
  vitamin: 'Vitamins',
  'hormone-support': 'Hormone Support',
  'gut-digestion': 'Gut & Digestion',
}

export default function ProductBrowser() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [touched, setTouched] = useState(false)
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runSearch = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(Array.isArray(data) ? data : [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
      setTouched(true)
    }
  }, [])

  // load an initial sample (empty query returns active products)
  useEffect(() => {
    let cancelled = false
    fetch('/api/products/search?q=')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        setResults(Array.isArray(data) ? data : [])
        setLoading(false)
        setTouched(true)
      })
      .catch(() => {
        if (cancelled) return
        setResults([])
        setLoading(false)
        setTouched(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function handleChange(value: string) {
    setQuery(value)
    if (timeout.current) clearTimeout(timeout.current)
    timeout.current = setTimeout(() => runSearch(value), 300)
  }

  const sorted = [...results].sort((a, b) => {
    const sa = scoreFor(a.brand, a.name) ?? -1
    const sb = scoreFor(b.brand, b.name) ?? -1
    return sb - sa
  })

  return (
    <div className="space-y-5">
      <input
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Search by product or brand…"
        className="w-full bg-lab-panel text-white border border-lab-border rounded-xl px-4 py-3 focus:outline-none focus:border-lab-lime transition-colors"
      />

      {loading && <p className="text-lab-muted text-sm">Searching…</p>}

      {!loading && touched && sorted.length === 0 && (
        <div className="text-center py-12 text-gray-600">
          <p className="text-4xl mb-3">🗂️</p>
          <p className="text-sm">No products found. The catalogue may not be seeded yet.</p>
        </div>
      )}

      <div className="space-y-3">
        {sorted.map((p) => {
          const score = scoreFor(p.brand, p.name)
          return (
            <div
              key={p.id}
              className="flex items-center gap-4 bg-lab-panel border border-lab-border rounded-xl p-4"
            >
              <ScoreBadge score={score} />
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-bold truncate">{p.brand}</p>
                <p className="text-lab-muted text-xs truncate">{p.name}</p>
              </div>
              <span className="text-[10px] uppercase tracking-widest font-bold bg-lab-panel-2 text-lab-muted px-2.5 py-1 rounded-full shrink-0">
                {CATEGORY_LABELS[p.category] || p.category}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
