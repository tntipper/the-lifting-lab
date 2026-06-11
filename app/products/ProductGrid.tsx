'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import ScoreBadge from '@/components/ScoreBadge'
import { CATEGORIES, categoryLabel } from '@/lib/categories'
import { sortScored, type ScoredProduct, type SortKey } from '@/lib/products'
import { track } from '@/lib/gtag'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'score', label: 'Best Rating' },
  { key: 'name', label: 'Name (A–Z)' },
  { key: 'brand', label: 'Brand (A–Z)' },
]

function amazonSearch(brand: string, name: string) {
  const q = encodeURIComponent(`${brand} ${name}`)
  return `https://www.amazon.co.uk/s?k=${q}`
}

export default function ProductGrid() {
  const [all, setAll] = useState<ScoredProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState<SortKey>('score')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/products?sort=score')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        setAll(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setAll([])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // categories that actually have products, in canonical order
  const activeCategories = useMemo(() => {
    const present = new Set(all.map((p) => p.category))
    return CATEGORIES.filter((c) => present.has(c.slug))
  }, [all])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = all
    if (category !== 'all') list = list.filter((p) => p.category === category)
    if (q) list = list.filter((p) => `${p.brand} ${p.name}`.toLowerCase().includes(q))
    return sortScored(list, sort)
  }, [all, category, sort, query])

  function handleSearch(value: string) {
    setQuery(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (value.trim()) {
      searchTimer.current = setTimeout(() => track('search_query', { search_term: value.trim() }), 600)
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 3) return prev
      return [...prev, id]
    })
  }

  return (
    <div className="space-y-6 pb-28">
      {/* search */}
      <input
        type="text"
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="Search by product or brand…"
        className="w-full bg-lab-panel text-white border border-lab-border rounded-xl px-4 py-3 focus:outline-none focus:border-lab-lime transition-colors"
      />

      {/* category chips */}
      <div className="flex gap-2 overflow-x-auto hide-scroll -mx-1 px-1">
        <CategoryChip label="All" active={category === 'all'} onClick={() => setCategory('all')} />
        {activeCategories.map((c) => (
          <CategoryChip
            key={c.slug}
            label={c.label}
            active={category === c.slug}
            onClick={() => setCategory(c.slug)}
          />
        ))}
      </div>

      {/* sort + count */}
      <div className="flex items-center justify-between">
        <span className="text-lab-muted text-xs uppercase tracking-widest font-bold">
          {loading ? 'Loading…' : `${visible.length} product${visible.length === 1 ? '' : 's'}`}
        </span>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="bg-lab-panel text-white text-sm border border-lab-border rounded-lg px-3 py-1.5 focus:outline-none focus:border-lab-lime"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* grid */}
      {!loading && visible.length === 0 && (
        <div className="text-center py-12 text-gray-600">
          <p className="text-4xl mb-3">🗂️</p>
          <p className="text-sm">No products match your filters.</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {visible.map((p) => {
          const isSel = selected.includes(p.id)
          return (
            <div
              key={p.id}
              className={`flex items-center gap-4 bg-lab-panel border rounded-xl p-4 transition-colors ${
                isSel ? 'border-lab-lime' : 'border-lab-border'
              }`}
            >
              <ScoreBadge score={p.score} />
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-bold truncate">{p.brand}</p>
                <p className="text-lab-muted text-xs truncate">{p.name}</p>
                <span className="inline-block mt-1.5 text-[10px] uppercase tracking-widest font-bold bg-lab-panel-2 text-lab-muted px-2 py-0.5 rounded-full">
                  {categoryLabel(p.category)}
                </span>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <a
                  href={amazonSearch(p.brand, p.name)}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  onClick={() => track('buy_click', { item_brand: p.brand, item_name: p.name })}
                  className="text-[10px] uppercase tracking-widest font-bold bg-lab-lime text-black px-3 py-1.5 rounded-lg hover:opacity-90"
                >
                  Buy
                </a>
                <button
                  onClick={() => toggleSelect(p.id)}
                  disabled={!isSel && selected.length >= 3}
                  className={`text-[10px] uppercase tracking-widest font-bold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-30 ${
                    isSel
                      ? 'border-lab-lime text-lab-lime'
                      : 'border-lab-border text-lab-muted hover:text-white'
                  }`}
                >
                  {isSel ? 'Added' : 'Compare'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* sticky compare bar */}
      {selected.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-lab-panel-2 border-t border-lab-border">
          <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
            <span className="text-sm text-white font-bold">
              {selected.length} selected{' '}
              <span className="text-lab-muted font-normal">(up to 3)</span>
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelected([])}
                className="text-xs text-lab-muted hover:text-white uppercase tracking-widest font-bold"
              >
                Clear
              </button>
              <Link
                href={`/compare?ids=${selected.join(',')}`}
                onClick={() => track('compare_start', { count: selected.length })}
                className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-4 py-2 rounded-lg hover:opacity-90"
              >
                Compare →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap text-xs uppercase tracking-widest font-bold px-3.5 py-2 rounded-full border transition-colors ${
        active
          ? 'border-lab-lime text-lab-lime bg-lab-lime/10'
          : 'border-lab-border text-lab-muted hover:text-white'
      }`}
    >
      {label}
    </button>
  )
}
