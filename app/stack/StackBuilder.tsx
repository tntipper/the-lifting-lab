'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { analyseStack, normaliseNutrientName, NUTRIENT_LIMITS, type StackItem, type SafetyFlag } from '@/lib/nutrient-limits'
import { rniFor, type Sex } from '@/lib/nutrient-rda'
import ScoreBadge, { scoreColor } from '@/components/ScoreBadge'
import { scoreFor } from '@/lib/scores'
import { buyLink } from '@/lib/affiliate'

type DailyTotal = {
  name: string
  amount: number
  unit: string
  ulPercent: number | null
  rdaPercent: number | null
  sources: string[]
}

function getDailyTotals(stackItems: StackItem[], sex: Sex): DailyTotal[] {
  const totals: Record<string, { amount: number; unit: string; sources: string[] }> = {}

  for (const item of stackItems) {
    const product = item.products
    if (!product) continue
    const multiplier = item.servings_per_day || 1
    for (const nutrient of product.product_nutrients || []) {
      const key = normaliseNutrientName(nutrient.nutrient_name)
      if (!totals[key]) totals[key] = { amount: 0, unit: nutrient.unit, sources: [] }
      totals[key].amount += nutrient.amount * multiplier
      const label = `${product.brand} ${product.name}`
      if (!totals[key].sources.includes(label)) totals[key].sources.push(label)
    }
  }

  return Object.entries(totals)
    .map(([name, d]) => {
      const rni = rniFor(name, sex)
      return {
        name,
        amount: Math.round(d.amount * 10) / 10,
        unit: d.unit,
        ulPercent: NUTRIENT_LIMITS[name]?.ul
          ? Math.round((d.amount / NUTRIENT_LIMITS[name].ul!) * 100)
          : null,
        rdaPercent: rni ? Math.round((d.amount / rni.value) * 100) : null,
        sources: d.sources,
      }
    })
    .sort((a, b) => {
      if (b.ulPercent != null && a.ulPercent != null) return b.ulPercent - a.ulPercent
      if (b.ulPercent != null) return 1
      if (a.ulPercent != null) return -1
      return a.name.localeCompare(b.name)
    })
}

function buildEmailLink(score: number | null, items: StackItem[]): string {
  const subject = `My Supplement Stack — Score ${score ?? '?'}/100 | The Lifting Lab`
  const lines = [
    `MY SUPPLEMENT STACK`,
    `Stack Score: ${score ?? '—'}/100`,
    ``,
    `Products:`,
    ...items
      .filter((i) => i.products)
      .map((i) => {
        const p = i.products!
        const sc = scoreFor(p.brand, p.name)
        const link = buyLink(p.brand, p.name)
        return `• ${p.brand} ${p.name}${sc != null ? ` (${sc}/100)` : ''}\n  Buy: ${link}`
      }),
    ``,
    `Analysed at theliftinglab.co.uk`,
    `Not medical advice.`,
  ]
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`
}

function buildShareUrl(score: number | null, items: StackItem[]): string {
  const data = {
    score,
    items: items
      .filter((i) => i.products)
      .map((i) => ({
        brand: i.products!.brand,
        name: i.products!.name,
        score: scoreFor(i.products!.brand, i.products!.name),
        category: i.products!.category,
      })),
  }
  return `/api/stack/sharecard?data=${encodeURIComponent(JSON.stringify(data))}`
}

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
  'whey-isolate': 'Whey Isolate',
  casein: 'Casein',
  'pre-workout': 'Pre-Workout',
  multivitamin: 'Multi',
  vitamin: 'Vitamins',
  'vitamin-d': 'Vitamin D',
  zma: 'ZMA',
  creatine: 'Creatine',
  eaas: 'EAAs',
  'intra-workout': 'Intra-Workout',
  'post-workout': 'Post-Workout',
  hydration: 'Hydration',
  'cycle-support': 'Cycle Support',
  'protein-bar': 'Protein Bar',
  'meal-replacement': 'Meal Replacement',
  'hormone-support': 'Hormone Support',
  'gut-digestion': 'Gut & Digestion',
  omega: 'Omega',
}

export default function StackBuilder() {
  const [stackItems, setStackItems] = useState<StackItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(true)
  const [flags, setFlags] = useState<SafetyFlag[]>([])
  const [showTotals, setShowTotals] = useState(false)
  const [sex, setSex] = useState<Sex>('male')

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Persist the RDA baseline (gender toggle) so it survives reloads.
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('tll-rda-sex') : null
    if (stored === 'male' || stored === 'female') setSex(stored)
  }, [])

  function changeSex(next: Sex) {
    setSex(next)
    try {
      window.localStorage.setItem('tll-rda-sex', next)
    } catch {
      /* ignore storage failures (private mode etc.) */
    }
  }

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
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        const items = data.items || []
        setStackItems(items)
        setFlags(analyseStack(items))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
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
      setSearchResults(Array.isArray(data) ? data : [])
      setSearching(false)
    }, 300)
  }

  async function addProduct(productId: string) {
    await fetch('/api/stack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId }),
    })
    setSearchQuery('')
    setSearchResults([])
    loadStack()
  }

  async function removeItem(stackProductId: string) {
    await fetch('/api/stack', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stackProductId }),
    })
    loadStack()
  }

  const stackProductIds = new Set(stackItems.map((i) => i.products?.id))

  // ---- clinical scoring (Path A scores, looked up by brand + name) ----
  const scoredItems = stackItems
    .map((i) => (i.products ? scoreFor(i.products.brand, i.products.name) : null))
    .filter((s): s is number => s != null)
  const avgScore =
    scoredItems.length > 0
      ? Math.round(scoredItems.reduce((a, b) => a + b, 0) / scoredItems.length)
      : null

  const dailyTotals = getDailyTotals(stackItems, sex)
  const shareUrl = buildShareUrl(avgScore, stackItems)
  const emailUrl = buildEmailLink(avgScore, stackItems)

  // RDA coverage summary: nutrients hitting 100% RNI without exceeding the UL.
  const rdaTracked = dailyTotals.filter((t) => t.rdaPercent != null)
  const rdaMet = rdaTracked.filter((t) => t.rdaPercent! >= 100 && (t.ulPercent == null || t.ulPercent < 100))

  return (
    <div className="space-y-6">
      {/* Stack score summary */}
      {!loading && stackItems.length > 0 && (
        <div className="flex items-center gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5">
          <ScoreBadge score={avgScore} size="lg" />
          <div>
            <p className="text-xs uppercase tracking-widest font-bold text-lab-muted">Stack Score</p>
            <p className="text-white text-sm mt-1">
              {avgScore != null ? (
                <>
                  Average clinical score across{' '}
                  <span className="font-bold" style={{ color: scoreColor(avgScore) }}>
                    {scoredItems.length}
                  </span>{' '}
                  scored product{scoredItems.length === 1 ? '' : 's'}.
                </>
              ) : (
                'No clinical scores available for these products yet.'
              )}
            </p>
          </div>
        </div>
      )}

      {/* Safety flags */}
      {flags.length > 0 && (
        <div className="space-y-2">
          {flags.map((flag) => (
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
                    {flag.percentage >= 100 ? '🚨 Critical' : '⚠️ Caution'} — {flag.nutrientName}
                  </span>{' '}
                  — {flag.totalAmount}
                  {flag.unit} total ({flag.percentage}% of EFSA UL)
                  <p className="text-xs mt-0.5 opacity-70">{flag.note}</p>
                </div>
                <span className="text-xs shrink-0 mt-0.5">{flag.products.length} products</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action row: share + daily totals toggle */}
      {!loading && stackItems.length > 0 && (
        <div className="flex gap-2">
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-lab-lime text-lab-lime text-xs font-black uppercase tracking-widest hover:bg-lab-lime/10 transition-colors"
          >
            <span>📤</span>
            <span>Share Stack</span>
          </a>
          <button
            onClick={() => setShowTotals((v) => !v)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-xs font-black uppercase tracking-widest transition-colors ${
              showTotals
                ? 'border-lab-lime text-lab-lime bg-lab-lime/10'
                : 'border-lab-border text-lab-muted hover:text-white'
            }`}
          >
            <span>📊</span>
            <span>Daily Totals</span>
          </button>
          <a
            href={emailUrl}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-lab-border text-lab-muted text-xs font-black uppercase tracking-widest hover:text-white transition-colors"
          >
            <span>📧</span>
            <span>Email Stack</span>
          </a>
        </div>
      )}

      {/* Daily totals table */}
      {showTotals && dailyTotals.length > 0 && (
        <div className="bg-lab-panel border border-lab-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-lab-border flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-widest font-bold text-lab-muted">Daily Intake Totals</p>
              <p className="text-[10px] text-gray-600 mt-0.5">Sum across all stack products × servings per day</p>
            </div>
            {/* Gender toggle — adjusts the RDA baseline (UK RNI) */}
            <div className="flex rounded-lg border border-lab-border overflow-hidden shrink-0">
              {(['male', 'female'] as Sex[]).map((s) => (
                <button
                  key={s}
                  onClick={() => changeSex(s)}
                  className={`text-[10px] uppercase tracking-widest font-black px-2.5 py-1.5 transition-colors ${
                    sex === s ? 'bg-lab-lime text-black' : 'text-lab-muted hover:text-white'
                  }`}
                >
                  {s === 'male' ? 'Male' : 'Female'}
                </button>
              ))}
            </div>
          </div>

          {/* RDA coverage summary */}
          {rdaTracked.length > 0 && (
            <div className="px-4 py-2.5 border-b border-lab-border flex items-center gap-2">
              <span className="text-sm" aria-hidden>🎯</span>
              <span className="text-xs text-white/90">
                Hitting 100% RDA on{' '}
                <span className="font-black text-lab-lime">{rdaMet.length}</span>
                <span className="text-lab-muted"> / {rdaTracked.length}</span> tracked nutrient{rdaTracked.length === 1 ? '' : 's'}
                <span className="text-gray-600"> ({sex === 'male' ? 'adult male' : 'adult female'} baseline)</span>
              </span>
            </div>
          )}

          <div className="divide-y divide-lab-border">
            {dailyTotals.map((row) => {
              const ul = row.ulPercent
              const rda = row.rdaPercent
              // Combined RAG: toxicity takes priority, then RDA achievement.
              const dotColor =
                ul != null && ul >= 100 ? '#ff5c5c'
                : ul != null && ul >= 80 ? '#f5b342'
                : rda != null && rda >= 100 ? '#a6e22e'
                : rda != null ? '#2E8FE0'
                : '#6b7280'
              return (
                <div key={row.name} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
                  <span className="text-white text-xs font-medium flex-1 min-w-0 truncate">{row.name}</span>
                  <span className="text-white text-xs font-black shrink-0">
                    {row.amount}{row.unit}
                  </span>
                  {/* RDA % of UK RNI */}
                  {rda != null ? (
                    <span
                      className="text-[10px] font-bold shrink-0 w-14 text-right"
                      style={{ color: rda >= 100 ? '#a6e22e' : '#2E8FE0' }}
                    >
                      {rda}% RDA
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-700 shrink-0 w-14 text-right">—</span>
                  )}
                  {/* UL % of EFSA upper limit */}
                  {ul != null ? (
                    <span
                      className="text-[10px] font-bold shrink-0 w-12 text-right"
                      style={{ color: ul >= 100 ? '#ff5c5c' : ul >= 80 ? '#f5b342' : '#6b7280' }}
                    >
                      {ul}% UL
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-700 shrink-0 w-12 text-right">No UL</span>
                  )}
                </div>
              )
            })}
          </div>
          <div className="px-4 py-2 border-t border-lab-border">
            <p className="text-[10px] text-gray-600">
              RDA = % of UK Reference Nutrient Intake (adult {sex}). <span style={{ color: '#a6e22e' }}>●</span> 100%+ RDA met.
              UL = EFSA Tolerable Upper Intake Level. <span style={{ color: '#f5b342' }}>●</span> ≥80% caution · <span style={{ color: '#ff5c5c' }}>●</span> ≥100% critical.
            </p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search products to add to your stack…"
          className="w-full bg-lab-panel text-white border border-lab-border rounded-xl px-4 py-3 focus:outline-none focus:border-lab-lime transition-colors"
        />
        {(searchResults.length > 0 || searching) && (
          <div className="absolute top-full mt-1 left-0 right-0 bg-lab-panel border border-lab-border rounded-xl overflow-hidden z-10">
            {searching && <div className="px-4 py-3 text-lab-muted text-sm">Searching…</div>}
            {searchResults.map((product) => {
              const alreadyAdded = stackProductIds.has(product.id)
              const score = scoreFor(product.brand, product.name)
              return (
                <button
                  key={product.id}
                  onClick={() => !alreadyAdded && addProduct(product.id)}
                  disabled={alreadyAdded}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-lab-panel-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-b border-lab-border last:border-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {score != null && (
                      <span
                        className="text-xs font-black shrink-0 w-7 text-center"
                        style={{ color: scoreColor(score) }}
                      >
                        {score}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium truncate">{product.brand}</p>
                      <p className="text-lab-muted text-xs truncate">{product.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] uppercase tracking-widest font-bold bg-lab-panel-2 text-lab-muted px-2 py-0.5 rounded-full">
                      {CATEGORY_LABELS[product.category] || product.category}
                    </span>
                    {alreadyAdded ? (
                      <span className="text-xs text-lab-lime">In stack</span>
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
        <p className="text-lab-muted text-sm">Loading your stack…</p>
      ) : stackItems.length === 0 ? (
        <div className="text-center py-12 text-gray-600">
          <p className="text-4xl mb-3">🧪</p>
          <p className="text-sm">Your stack is empty. Search above to add products.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {stackItems.map((item) => {
            const product = item.products
            if (!product) return null
            const score = scoreFor(product.brand, product.name)
            const nutrientFlags = flags.filter((f) =>
              f.products.includes(product.brand + ' ' + product.name)
            )
            return (
              <div
                key={item.id}
                className="flex gap-4 bg-lab-panel border border-lab-border rounded-xl p-4"
              >
                <ScoreBadge score={score} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-white font-medium text-sm truncate">{product.brand}</p>
                      <p className="text-lab-muted text-xs mt-0.5 truncate">{product.name}</p>
                      <p className="text-gray-600 text-xs mt-1">
                        {product.serving_size}
                        {product.serving_unit} × {item.servings_per_day}/day
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {nutrientFlags.length > 0 && (
                        <span className="text-xs text-yellow-400">⚠️ {nutrientFlags.length}</span>
                      )}
                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-gray-600 hover:text-lab-red text-xs transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(product.product_nutrients || []).slice(0, 4).map((n) => (
                      <span
                        key={n.nutrient_name}
                        className="text-xs bg-lab-panel-2 text-lab-muted px-2 py-0.5 rounded-full"
                      >
                        {n.nutrient_name} {n.amount}
                        {n.unit}
                      </span>
                    ))}
                    {(product.product_nutrients || []).length > 4 && (
                      <span className="text-xs text-gray-600">
                        +{product.product_nutrients.length - 4} more
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
