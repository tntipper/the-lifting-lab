'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import { analyseStack, normaliseNutrientName, NUTRIENT_LIMITS, type StackItem } from '@/lib/nutrient-limits'
import { rniFor, type Sex } from '@/lib/nutrient-rda'
import ProductAssessment from '@/components/ProductAssessment'
import { catalogueAssessment, summariseStackAssessments, assessmentText, stackResearchText } from '@/lib/stack-assessment'
import { scoreFor } from '@/lib/scores'
import { resolveProductListing } from '@/lib/affiliate'
import ProductOfferLink from '@/components/ProductOfferLink'
import { StagingCartAdd } from '@/components/StagingCartActions'
import { analysisServings, validStackServings } from '@/lib/stack-sync'
import { useLocalStack } from '@/components/LocalStackContext'
import CombinedDosePanel from '@/components/CombinedDosePanel'
import { useBrowserSnapshot } from '@/lib/browser-snapshot'

function readStoredSex(): Sex {
  try { return window.localStorage.getItem('tll-rda-sex') === 'female' ? 'female' : 'male' }
  catch { return 'male' }
}

// Batch product shape returned by /api/products/batch
type BatchProduct = {
  id: string
  name: string
  brand: string
  category: string
  serving_size: number
  serving_unit: string
  servings_per_container?: number | null
  retail_price?: number | null
  buy_url: string | null
  product_nutrients: { nutrient_name: string; amount: number; unit: string }[]
}

function toStackItem(p: BatchProduct): StackItem {
  return {
    id: p.id, // in local mode the product id doubles as the row id
    servings_per_day: 1,
    products: {
      id: p.id,
      name: p.name,
      brand: p.brand,
      category: p.category,
      serving_size: p.serving_size,
      serving_unit: p.serving_unit,
      buy_url: p.buy_url,
      product_nutrients: p.product_nutrients || [],
      retail_price: p.retail_price,
      servings_per_container: p.servings_per_container,
    } as StackItem['products'] & { retail_price?: number | null; servings_per_container?: number | null },
  }
}

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

function buildEmailLink(items: StackItem[], listedCount: number): string {
  const summary = summariseStackAssessments(items.flatMap(item => item.products ? [item.products] : []), listedCount)
  const subject = 'My Supplement Research Stack | The Lifting Lab'
  const lines = [
    `MY SUPPLEMENT STACK`,
    summary.text,
    ``,
    `Products:`,
    ...items
      .filter((i) => i.products)
      .map((i) => {
        const p = i.products!
        const assessment = assessmentText(catalogueAssessment(p))
        const listing = resolveProductListing(p.buy_url)
        const destination = listing.state === 'listing' && listing.url
          ? `Retailer listing at ${listing.retailer} (check product, pack and price${listing.relationship === 'affiliate' ? '; affiliate link' : '; external link'}): ${listing.url}`
          : 'No verified offer.'
        return `• ${p.brand} ${p.name} — ${assessment}\n  ${destination}`
      }),
    ``,
    `Research records at theliftinglab.co.uk`,
    `Not medical advice.`,
  ]
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`
}

function buildShareUrl(items: StackItem[]): string {
  const ids = items.flatMap(item => item.products ? [item.products.id] : [])
  return `/api/stack/sharecard?${new URLSearchParams({ ids: ids.join(',') })}`
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

const STACK_GOALS = ['Strength', 'Muscle', 'Endurance', 'Recovery', 'General health'] as const
type StackGoal = typeof STACK_GOALS[number]

function readStoredGoal(): StackGoal {
  try {
    const stored = window.localStorage.getItem('tll-stack-goal')
    return STACK_GOALS.includes(stored as StackGoal) ? stored as StackGoal : 'Strength'
  } catch { return 'Strength' }
}

function timingFor(category: string): 'Any time' | 'Pre-training' | 'Post-training' | 'Evening' {
  if (['pre-workout', 'intra-workout', 'hydration'].includes(category)) return 'Pre-training'
  if (['post-workout', 'whey', 'whey-isolate', 'eaas'].includes(category)) return 'Post-training'
  if (['casein', 'zma'].includes(category)) return 'Evening'
  return 'Any time'
}

export default function StackBuilder() {
  const { stack, state, add, remove, retry } = useLocalStack()
  const [stackItems, setStackItems] = useState<StackItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [searching, setSearching] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(true)
  const [detailAttempt, setDetailAttempt] = useState(0)
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const loading = state.loading || detailsLoading
  const unresolved = (state.snapshot?.items || []).filter(item => !validStackServings(item.servings_per_day))
  const flags = analyseStack(stackItems)
  const [showTotals, setShowTotals] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const storedSex = useBrowserSnapshot(readStoredSex, 'male' as Sex)
  const [chosenSex, setSex] = useState<Sex | null>(null)
  const sex = chosenSex ?? storedSex
  const storedGoal = useBrowserSnapshot(readStoredGoal, 'Strength' as StackGoal)
  const [chosenGoal, setGoal] = useState<StackGoal | null>(null)
  const goal = chosenGoal ?? storedGoal
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchInput = useRef<HTMLInputElement>(null)

  function changeGoal(next: StackGoal) {
    setGoal(next)
    try { window.localStorage.setItem('tll-stack-goal', next) } catch { /* optional preference */ }
  }

  function changeSex(next: Sex) {
    setSex(next)
    try {
      window.localStorage.setItem('tll-rda-sex', next)
    } catch {
      /* ignore storage failures (private mode etc.) */
    }
  }

  // Both the main page and floating panel use the provider's membership. Only
  // product detail hydration lives here, and late responses cannot replace it.
  const idsKey = stack.map(item => item.id).sort().join(',')
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    if (!idsKey) { setStackItems([]); setDetailsError(null); setDetailsLoading(false); return }
    setDetailsLoading(true)
    setDetailsError(null)
    setStackItems([])
    // The existing public batch route caps requests at 50 products.
    const ids = idsKey.split(',')
    const batches = Array.from({ length: Math.ceil(ids.length / 50) }, (_, i) => ids.slice(i * 50, i * 50 + 50))
    void Promise.all(batches.map(async batch => {
      const response = await fetch(`/api/products/batch?ids=${encodeURIComponent(batch.join(','))}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      if (!response.ok) throw new Error('Product details unavailable')
      const data: unknown = await response.json()
      if (!Array.isArray(data)) throw new Error('Product details unavailable')
      return data as BatchProduct[]
    }))
      .then(results => {
        const data = results.flat()
        if (cancelled) return
        setStackItems(data.flatMap((p: BatchProduct) => {
          const servings = analysisServings(state.snapshot, p.id)
          return servings === null ? [] : [{ ...toStackItem(p), servings_per_day: servings }]
        }))
        setDetailsError(data.length < idsKey.split(',').length ? 'Some saved products are unavailable for analysis. They remain in your stack and can be managed in the floating panel.' : null)
      }).catch(() => { if (!cancelled) setDetailsError('Product details could not be loaded. Your saved stack is kept; retry when connected.') })
      .finally(() => { if (!cancelled) setDetailsLoading(false) })
    return () => { cancelled = true; controller.abort() }
  }, [idsKey, state.snapshot, detailAttempt])

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

  function addProduct(product: Product) {
    setSearchQuery('')
    setSearchResults([])
    add({ id: product.id, name: product.name, brand: product.brand, category: product.category, score: scoreFor(product.brand, product.name) })
  }

  function removeItem(item: StackItem) {
    if (item.products) remove(item.products.id)
  }

  const stackProductIds = new Set(stack.map(item => item.id))

  // Catalogue identities are hydrated separately from saved membership. A
  // stored score, unresolved serving or unavailable record cannot affect this
  // historical average; it is not a combined-stack assessment.
  const assessmentProducts = stackItems.flatMap(item => item.products ? [item.products] : [])
  const assessmentSummary = summariseStackAssessments(assessmentProducts, stack.length)

  const dailyTotals = getDailyTotals(stackItems, sex)
  const stackCosts = stackItems.map(item => {
    const product = item.products as (StackItem['products'] & { retail_price?: number | null; servings_per_container?: number | null })
    return product?.retail_price && product.servings_per_container
      ? product.retail_price / product.servings_per_container * item.servings_per_day
      : null
  })
  const stackDailyCost = stackItems.length === stack.length && stackCosts.every((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)
    ? stackCosts.reduce((sum, value) => sum + value, 0)
    : null
  const shareUrl = buildShareUrl(stackItems)
  const emailUrl = buildEmailLink(stackItems, stack.length)

  // Explicit listings only. A research stack does not create a cart or order.
  const retailerGroups = useMemo(() => {
    const groups: Record<string, { label: string; products: NonNullable<StackItem['products']>[] }> = {}
    for (const it of stackItems) {
      const p = it.products
      if (!p) continue
      const listing = resolveProductListing(p.buy_url)
      if (listing.state !== 'listing' || !listing.url || !listing.retailer) continue
      const label = listing.retailer
      if (!groups[label]) groups[label] = { label, products: [] }
      groups[label].products.push(p)
    }
    return Object.values(groups).sort((a, b) => b.products.length - a.products.length)
  }, [stackItems])

  // Social share text for the whole stack.
  const siteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://www.theliftinglab.co.uk'
  const shareText = stackResearchText(assessmentProducts, stack.length)
  const xShare = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(siteUrl)}`
  const fbShare = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(siteUrl)}&quote=${encodeURIComponent(shareText)}`
  const waShare = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${siteUrl}`)}`

  async function nativeShare() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'My Lifting Lab Stack', text: shareText, url: siteUrl })
      } catch {
        /* user cancelled */
      }
    }
  }

  return (
    <div>
      <section className="mb-7">
        <p className="tll-eyebrow text-[#4f7415]">Stack builder</p>
        <h1 className="tll-display mt-2 text-5xl uppercase leading-[.92] text-[#14140f] sm:text-7xl">What are you training for?</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#62645c] sm:text-base">Choose a goal to organise your stack. Your products stay under your control: nothing is added, removed or presented as recommended when you change goals.</p>
        <div className="mt-5 flex flex-wrap gap-2" aria-label="Training goal">
          {STACK_GOALS.map(option => <button key={option} type="button" aria-pressed={goal === option} onClick={() => changeGoal(option)}
            className={`min-h-11 rounded-full border px-5 text-sm font-black transition-colors ${goal === option ? 'tll-on-dark border-[#14140f] bg-[#14140f]' : 'border-[#a8aaa0] bg-white text-[#14140f] hover:border-[#14140f]'}`}>{option}</button>)}
        </div>
      </section>

      <div role="status" aria-live="polite" className="space-y-2 text-sm text-lab-muted lg:col-span-2">
        {state.busy && <p>Saving stack…</p>}
        {state.identity && state.guest.length > 0 && <p>{state.guest.length} browser item(s) awaiting confirmation in your account. <button type="button" className="underline" disabled={state.busy || state.loading} onClick={retry}>Save browser items</button></p>}
        {Boolean(state.snapshot?.recoveryConflicts) && <p>Earlier saved stacks contain differing serving amounts. Original entries are preserved for support review; conflicting amounts have not been added together.</p>}
        {state.error && <p className="text-amber-300">{state.error} {state.retryable && <button type="button" className="underline" disabled={state.busy} onClick={retry}>Retry sync</button>}</p>}
        {detailsError && <p className="text-amber-300">{detailsError} <button type="button" className="underline" onClick={() => setDetailAttempt(n => n + 1)}>Retry details</button></p>}
      </div>
      {unresolved.length > 0 && <div className="space-y-2 rounded-xl border border-amber-400/40 p-4 text-sm text-amber-800 lg:col-span-2">
        <p>Serving amounts need review. These saved items are excluded from totals and stack analysis until corrected; no default dose has been substituted.</p>
        {unresolved.map(item => <div key={item.product_id} className="flex justify-between gap-3"><span>{item.products?.brand} {item.products?.name || 'Unavailable saved product'} — amount unresolved</span><button type="button" className="underline" disabled={state.busy} onClick={() => remove(item.product_id)}>Remove</button></div>)}
      </div>}
      {/* Safety flags */}
      {flags.length > 0 && (
        <div className="my-5 space-y-2">
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
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,1fr)] lg:items-start">
      <div className="space-y-4">
      <div className="relative">
        <div className="mb-4 flex items-end justify-between gap-3 border-b border-lab-border pb-3">
          <div><p className="tll-eyebrow">Your {goal.toLowerCase()} stack</p><h2 className="tll-display mt-1 text-3xl uppercase">Your products</h2></div>
          <span className="text-sm text-lab-muted">{stack.length} product{stack.length === 1 ? '' : 's'}</span>
        </div>
        <label htmlFor="stack-product-search" className="mb-2 block text-xs font-bold uppercase tracking-widest text-lab-muted">Add a product</label>
        <input
          id="stack-product-search"
          ref={searchInput}
          type="search"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search the catalogue…"
          className="w-full rounded-lg border border-[#a8aaa0] bg-white px-4 py-3 text-[#14140f] transition-colors focus:border-black focus:outline-none"
        />
        {(searchResults.length > 0 || searching) && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-[#a8aaa0] bg-white text-[#14140f] shadow-xl">
            {searching && <div className="px-4 py-3 text-lab-muted text-sm">Searching…</div>}
            {searchResults.map((product) => {
              const alreadyAdded = stackProductIds.has(product.id)
              const assessedProduct = catalogueAssessment(product)
              return (
                <button
                  key={product.id}
                  onClick={() => !alreadyAdded && addProduct(product)}
                  disabled={alreadyAdded}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-lab-panel-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-b border-lab-border last:border-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ProductAssessment product={assessedProduct} size="sm" />
                    <div className="min-w-0">
                      <p className="text-[#14140f] text-sm font-medium truncate">{product.brand}</p>
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
      ) : stack.length === 0 && !state.error && !detailsError ? (
        <div className="rounded-xl border border-dashed border-[#a8aaa0] bg-white px-6 py-14 text-center text-[#14140f]">
          <p className="tll-display text-3xl uppercase">Start with one product</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-lab-muted">Search above to add products. Your saved stack stays connected to your account.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {stackItems.map((item, itemIndex) => {
            const product = item.products
            if (!product) return null
            const assessedProduct = catalogueAssessment(product)
            const nutrientFlags = flags.filter((f) =>
              f.products.includes(product.brand + ' ' + product.name)
            )
            return (
              <div
                key={item.id}
                className="rounded-xl border border-[#d7d8cf] bg-white p-5 text-[#14140f]"
              >
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#66685f]">{CATEGORY_LABELS[product.category] || product.category}</p>
                      <p className="mt-1 truncate text-base font-black">{product.name}</p>
                      <p className="text-xs text-[#66685f]">{product.brand} · {product.serving_size}{product.serving_unit} · {timingFor(product.category)}</p>
                      <p className="mt-1 text-xs text-[#66685f]">
                        {product.serving_size}
                        {product.serving_unit} × {item.servings_per_day}/day
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-sm font-black">{typeof stackCosts[itemIndex] === 'number' ? `£${stackCosts[itemIndex]!.toFixed(2)}` : '—'}</p>
                      <p className="text-[10px] text-[#66685f]">a day</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <ProductAssessment product={assessedProduct} size="sm" />
                    {nutrientFlags.length > 0 && <span className="text-xs text-amber-700">⚠ {nutrientFlags.length} safety notice{nutrientFlags.length === 1 ? '' : 's'}</span>}
                    {(product.product_nutrients || []).slice(0, 4).map(n => <span key={n.nutrient_name} className="text-xs font-bold text-[#4f514a]">{n.nutrient_name} {n.amount}{n.unit}</span>)}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Link href={`/products?category=${encodeURIComponent(product.category)}`} className="inline-flex min-h-11 items-center rounded-lg border border-[#87897f] px-4 text-xs font-black">Swap · view options</Link>
                    <button onClick={() => removeItem(item)} className="min-h-11 px-2 text-xs font-bold text-[#66685f] underline">Remove</button>
                    <div className="ml-auto">
                      <StagingCartAdd productId={product.id} />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <button type="button" onClick={() => { searchInput.current?.focus(); searchInput.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }} className="flex min-h-12 w-full items-center justify-center rounded-xl border border-dashed border-[#8f9187] bg-white text-sm font-black text-[#14140f]">+ Add an ingredient</button>

      {!loading && stackItems.length > 0 && <section className="pt-2 text-[#14140f]">
        <h2 className="tll-display text-3xl uppercase">Your day</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(['Any time', 'Pre-training', 'Post-training', 'Evening'] as const).map(period => {
            const products = stackItems.filter(item => item.products && timingFor(item.products.category) === period)
            return <div key={period} className="min-h-28 rounded-lg border border-[#d7d8cf] border-t-2 border-t-lab-lime bg-white p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#66685f]">{period}</p>
              {products.length ? products.map(item => <p key={item.id} className="mt-2 text-xs font-bold">{item.products?.name}</p>) : <p className="mt-2 text-xs text-[#77796f]">Nothing here</p>}
            </div>
          })}
        </div>
        <p className="mt-2 text-[10px] text-[#77796f]">Timing groups are for planning only. Follow the product label and ingredient guidance.</p>
      </section>}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-8">
        {!loading && stackItems.length > 0 && <section className="tll-on-dark rounded-xl bg-[#11120f] p-5 sm:p-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div><p className="text-[10px] font-bold uppercase text-[#9da094]">Per day</p><p className="tll-display mt-1 text-3xl">{stackDailyCost === null ? '—' : `£${stackDailyCost.toFixed(2)}`}</p></div>
            <div><p className="text-[10px] font-bold uppercase text-[#9da094]">Per month</p><p className="tll-display mt-1 text-3xl">{stackDailyCost === null ? '—' : `£${(stackDailyCost * 30).toFixed(2)}`}</p></div>
            <div className="col-span-2 sm:col-span-1"><p className="text-[10px] font-bold uppercase text-[#9da094]">Products</p><p className="tll-display mt-1 text-3xl text-lab-lime">{stack.length}</p></div>
          </div>
          <p className="mt-4 border-t border-[#34362f] pt-3 text-[10px] leading-relaxed text-[#9da094]">Costs use recorded catalogue prices. Missing prices remain unavailable and are never counted as free.</p>
          <p className="mt-3 text-xs leading-relaxed text-[#c8cabf]">{assessmentSummary.text}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <button type="button" onClick={() => setShowShare(v => !v)} className="min-h-11 rounded-lg border border-[#5b5e54] text-xs font-black text-white">Share Stack</button>
            <button type="button" onClick={() => setShowTotals(v => !v)} className="min-h-11 rounded-lg border border-[#5b5e54] text-xs font-black text-white">Daily totals</button>
            <a href={emailUrl} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#5b5e54] text-xs font-black text-white">Email stack</a>
          </div>
        </section>}

        {showShare && !loading && stackItems.length > 0 && <section className="rounded-xl border border-[#d7d8cf] bg-white p-5 text-[#14140f]">
          <p className="text-xs font-black uppercase tracking-widest">Share your stack</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a href={xShare} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-[#a8aaa0] px-3 py-3 text-center text-xs font-bold">X / Twitter</a>
            <a href={fbShare} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-[#a8aaa0] px-3 py-3 text-center text-xs font-bold">Facebook</a>
            <a href={waShare} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-[#a8aaa0] px-3 py-3 text-center text-xs font-bold">WhatsApp</a>
            <button type="button" onClick={nativeShare} className="rounded-lg border border-[#a8aaa0] px-3 py-3 text-center text-xs font-bold">More…</button>
          </div>
          <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block rounded-lg bg-[#14140f] px-3 py-3 text-center text-xs font-black text-lab-lime">Open share card image</a>
        </section>}

        <CombinedDosePanel totals={dailyTotals} />

        {showTotals && dailyTotals.length > 0 && <section className="overflow-hidden rounded-xl border border-[#d7d8cf] bg-white text-[#14140f]">
          <div className="flex items-start justify-between gap-3 border-b border-[#d7d8cf] px-4 py-3">
            <div><h2 className="text-xs font-black uppercase tracking-widest">Daily Intake Totals</h2><p className="mt-1 text-[10px] text-[#66685f]">Recorded label amounts across all products and servings per day.</p></div>
            <div className="flex overflow-hidden rounded-lg border border-[#a8aaa0]">
              {(['male', 'female'] as Sex[]).map(option => <button key={option} type="button" onClick={() => changeSex(option)} className={`min-h-9 px-2 text-[10px] font-black uppercase ${sex === option ? 'bg-lab-lime text-black' : 'bg-white text-[#66685f]'}`}>{option}</button>)}
            </div>
          </div>
          <div className="divide-y divide-[#e1e2db]">
            {dailyTotals.map(row => <div key={`${row.name}-${row.unit}`} className="flex items-center gap-2 px-4 py-3 text-xs">
              <span className="min-w-0 flex-1 truncate font-bold">{row.name}</span>
              <span className="font-mono font-black">{row.amount}{row.unit}</span>
              <span className="w-14 text-right text-[10px] font-bold text-[#66685f]">{row.rdaPercent == null ? '—' : `${row.rdaPercent}% RDA`}</span>
              <span className="w-12 text-right text-[10px] font-bold" style={{ color: row.ulPercent != null && row.ulPercent >= 100 ? '#ff5c5c' : row.ulPercent != null && row.ulPercent >= 80 ? '#f5b342' : '#77796f' }}>{row.ulPercent == null ? 'No UL' : `${row.ulPercent}% UL`}</span>
            </div>)}
          </div>
          <p className="border-t border-[#d7d8cf] px-4 py-3 text-[10px] leading-relaxed text-[#66685f]">RDA compares recorded totals with the UK adult reference intake ({sex}). UL is the EFSA upper limit. These totals do not establish an effective or recommended dose.</p>
        </section>}
      </aside>
      </div>

      {!loading && retailerGroups.length > 0 && <section className="mt-6 rounded-xl border border-[#d7d8cf] bg-white p-5 text-[#14140f]">
        <h2 className="tll-display text-2xl uppercase">Retailer listings</h2>
        <p className="mt-1 text-xs text-[#66685f]">Open each listing to check the exact product, pack, price and stock. The stack does not invent a single-retailer basket.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {retailerGroups.map(group => <div key={group.label} className="rounded-xl border border-[#d7d8cf] p-4">
            <p className="text-sm font-black">{group.label}</p>
            {group.products.map((product, index) => <div key={`${product.id}-${index}`} className="mt-3 flex items-center justify-between gap-3 border-t border-[#e1e2db] pt-3">
              <span className="text-xs text-[#66685f]">{product.brand} {product.name}</span>
              <ProductOfferLink product={{ id: product.id, brand: product.brand, name: product.name, buy_url: product.buy_url ?? null }} className="rounded-lg border border-[#a8aaa0] py-2 text-xs font-bold" />
            </div>)}
          </div>)}
        </div>
      </section>}
    </div>
  )
}
