'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { analyseStack, type StackItem, type SafetyFlag } from '@/lib/nutrient-limits'

type Product = {
  id: string
  name: string
  brand: string
  category: string
  serving_size: number
  serving_unit: string
}

const CATEGORY_LABELS: Record<string, string> = {
  whey: 'Whey',
  'pre-workout': 'Pre-Workout',
  multivitamin: 'Multi',
  'vitamin-d': 'Vitamin D',
  zma: 'ZMA',
  creatine: 'Creatine',
  omega: 'Omega',
}

export default function StackBuilder() {
  const [stackItems, setStackItems] = useState<StackItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(true)
  const [flags, setFlags] = useState<SafetyFlag[]>([])

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadStack = useCallback(async () => {
    const res = await fetch('/api/stack')
    const data = await res.json()
    const items = data.items || []
    setStackItems(items)
    setFlags(analyseStack(items))
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/stack')
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        const items = data.items || []
        setStackItems(items)
        setFlags(analyseStack(items))
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  function handleSearchChange(value: string) {
    setSearchQuery(value)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (!value.trim()) {
      setSearchResults([])
      return
    }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(value)}`)
      const data = await res.json()
      setSearchResults(data || [])
      setSearching(false)
    }, 300)
  }

  async function addProduct(productId: string) {
    await fetch('/api/stack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId })
    })
    setSearchQuery('')
    setSearchResults([])
    loadStack()
  }

  async function removeItem(stackProductId: string) {
    await fetch('/api/stack', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stackProductId })
    })
    loadStack()
  }

  const stackProductIds = new Set(stackItems.map(i => i.products?.id))

  return (
    <div className="space-y-6">

      {/* Safety flags */}
      {flags.length > 0 && (
        <div className="space-y-2">
          {flags.map(flag => (
            <div
              key={flag.nutrientName}
              className={`rounded-xl px-4 py-3 text-sm border ${
                flag.percentage >= 100
                  ? 'bg-red-950/40 border-red-800 text-red-200'
                  : 'bg-yellow-950/40 border-yellow-800 text-yellow-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-semibold">
                    {flag.percentage >= 100 ? '🚨' : '⚠️'} {flag.nutrientName}
                  </span>
                  {' '}— {flag.totalAmount}{flag.unit} total ({flag.percentage}% of EFSA UL)
                  <p className="text-xs mt-0.5 opacity-70">{flag.note}</p>
                </div>
                <span className="text-xs shrink-0 mt-0.5">{flag.products.length} products</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={e => handleSearchChange(e.target.value)}
          placeholder="Search products to add to your stack…"
          className="w-full bg-gray-900 text-white border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-white transition-colors"
        />
        {(searchResults.length > 0 || searching) && (
          <div className="absolute top-full mt-1 left-0 right-0 bg-gray-900 border border-gray-700 rounded-xl overflow-hidden z-10">
            {searching && (
              <div className="px-4 py-3 text-gray-400 text-sm">Searching…</div>
            )}
            {searchResults.map(product => {
              const alreadyAdded = stackProductIds.has(product.id)
              return (
                <button
                  key={product.id}
                  onClick={() => !alreadyAdded && addProduct(product.id)}
                  disabled={alreadyAdded}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-b border-gray-800 last:border-0"
                >
                  <div>
                    <p className="text-white text-sm font-medium">{product.brand}</p>
                    <p className="text-gray-400 text-xs">{product.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                      {CATEGORY_LABELS[product.category] || product.category}
                    </span>
                    {alreadyAdded ? (
                      <span className="text-xs text-green-400">In stack</span>
                    ) : (
                      <span className="text-xs text-gray-500">+ Add</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Stack items */}
      {loading ? (
        <p className="text-gray-500 text-sm">Loading your stack…</p>
      ) : stackItems.length === 0 ? (
        <div className="text-center py-12 text-gray-600">
          <p className="text-4xl mb-3">🧪</p>
          <p className="text-sm">Your stack is empty. Search above to add products.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {stackItems.map(item => {
            const product = item.products
            if (!product) return null
            const nutrientFlags = flags.filter(f => f.products.includes(product.brand + ' ' + product.name))
            return (
              <div key={item.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-white font-medium text-sm">{product.brand}</p>
                    <p className="text-gray-400 text-xs mt-0.5">{product.name}</p>
                    <p className="text-gray-600 text-xs mt-1">
                      {product.serving_size}{product.serving_unit} × {item.servings_per_day}/day
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {nutrientFlags.length > 0 && (
                      <span className="text-xs text-yellow-400">⚠️ {nutrientFlags.length}</span>
                    )}
                    <button
                      onClick={() => removeItem(item.id)}
                      className="text-gray-600 hover:text-red-400 text-xs transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {(product.product_nutrients || []).slice(0, 4).map(n => (
                    <span key={n.nutrient_name} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                      {n.nutrient_name} {n.amount}{n.unit}
                    </span>
                  ))}
                  {(product.product_nutrients || []).length > 4 && (
                    <span className="text-xs text-gray-600">+{product.product_nutrients.length - 4} more</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
