'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { NUTRIENT_LIMITS, type StackItem } from '@/lib/nutrient-limits'
import { rniFor, type Sex } from '@/lib/nutrient-rda'
import ProductAssessment from '@/components/ProductAssessment'
import { catalogueAssessment, summariseStackAssessments, assessmentText, stackResearchText } from '@/lib/stack-assessment'
import { scoreFor } from '@/lib/scores'
import { DEFAULT_STORE_BUY_LINK_MODE, resolveProductOffer } from '@/lib/affiliate'
import type { StoreLinkMapping } from '@/lib/commerce/product-mapping'
import BuyMyStack from '@/components/BuyMyStack'
import SharedStack from '@/components/SharedStack'
import { shareStackPath } from '@/lib/commerce/stack-share'
import { stackCartEnabled, type StackCartItem } from '@/lib/commerce/stack-cart'
import ProductOfferLink from '@/components/ProductOfferLink'
import { StagingCartAdd } from '@/components/StagingCartActions'
import { analysisServings, validStackServings } from '@/lib/stack-sync'
import { useLocalStack } from '@/components/LocalStackContext'
import CombinedDosePanel from '@/components/CombinedDosePanel'
import { useBrowserSnapshot } from '@/lib/browser-snapshot'
import { dailyCost, stackDoseTotals } from '@/lib/stack-builder'
import { convertAmount } from '@/lib/stack-reference-ranges'

function readStoredSex(): Sex {
  try { return window.localStorage.getItem('tll-rda-sex') === 'female' ? 'female' : 'male' }
  catch { return 'male' }
}

// Batch product shape returned by /api/products/batch
type BatchProduct = Pick<StackCartItem, 'cataloguePresentation' | 'storePrice' | 'storeVariants'> & {
  id: string
  name: string
  brand: string
  category: string
  serving_size: number
  serving_unit: string
  servings_per_container?: number | null
  retail_price?: number | null
  buy_url: string | null
  storeLinkMapping?: StoreLinkMapping | null
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
      storeLinkMapping: p.storeLinkMapping,
      storeVariants: p.storeVariants,
      product_nutrients: p.product_nutrients || [],
      retail_price: p.retail_price,
      servings_per_container: p.servings_per_container,
    } as StackItem['products'] & { retail_price?: number | null; servings_per_container?: number | null },
  }
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
        const listing = resolveProductOffer({ ...p, buy_url: p.buy_url ?? null }, DEFAULT_STORE_BUY_LINK_MODE, 'stack')
        const destination = listing.state === 'listing' && listing.url
          ? listing.reason === 'approved_store_mapping' ? `Buy at TLL Store (check pack, price and stock): ${listing.url}`
            : `Retailer listing at ${listing.retailer} (check product, pack and price${listing.relationship === 'affiliate' ? '; affiliate link' : '; external link'}): ${listing.url}`
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

function readStackQuery() { return window.location.search }
export default function StackBuilder() {
  const query = useBrowserSnapshot(readStackQuery, '')
  return <div>
    {new URLSearchParams(query).has('items') ? <SharedStack query={query} /> : <SavedStackBuilder />}
  </div>
}

function SavedStackBuilder() {
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
  const [showTotals, setShowTotals] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const shareButton = useRef<HTMLButtonElement>(null)
  const shareHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (!showShare) return
    shareHeading.current?.focus({ preventScroll: true })
    shareHeading.current?.scrollIntoView({ block: 'center' })
  }, [showShare])
  const storedSex = useBrowserSnapshot(readStoredSex, 'male' as Sex)
  const [chosenSex, setSex] = useState<Sex | null>(null)
  const sex = chosenSex ?? storedSex
  const storedGoal = useBrowserSnapshot(readStoredGoal, 'Strength' as StackGoal)
  const [chosenGoal, setGoal] = useState<StackGoal | null>(null)
  const goal = chosenGoal ?? storedGoal
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchInput = useRef<HTMLInputElement>(null)

  const [cartProducts, setCartProducts] = useState<BatchProduct[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [swap, setSwap] = useState<string | null>(null)
  const [catalogue, setCatalogue] = useState<BatchProduct[]>([])
  const [catalogueLoading, setCatalogueLoading] = useState(false)
  const [catalogueError, setCatalogueError] = useState('')
  const [savedSignature, setSavedSignature] = useState<string | null>(null)
  const [saveError, setSaveError] = useState('')
  const [cheaper, setCheaper] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')
  const [pendingSwap, setPendingSwap] = useState<{ previous: string; next: string } | null>(null)
  const restored = useRef(false)
  const bookmarkChecked = useRef(false)
  const searchRequest = useRef(0)
  const signature = JSON.stringify({ goal, stack: stack.map(product => product.id), servings: state.snapshot?.items.map(item => [item.product_id, item.servings_per_day]) })
  const saved = savedSignature === signature

  // Keep the old product until the provider confirms the replacement. A failed
  // account addition must not remove an existing saved item.
  useEffect(() => {
    if (!pendingSwap || state.busy || !stack.some(product => product.id === pendingSwap.next)) return
    remove(pendingSwap.previous)
    setPendingSwap(null)
  }, [pendingSwap, state.busy, stack, remove])

  // Restore only into an empty guest stack. The existing provider owns account
  // membership and serving amounts; this bookmark must never overwrite those.
  useEffect(() => {
    if (state.loading || state.identity === undefined || restored.current) return
    restored.current = true
    if (state.identity || stack.length) return
    try {
      const bookmark = JSON.parse(localStorage.getItem('tll-stack-v1') || 'null')
      if (!bookmark || !STACK_GOALS.includes(bookmark.goal) || !Array.isArray(bookmark.stack)) return
      setGoal(bookmark.goal)
      for (const product of bookmark.stack.slice(0, 100)) {
        if (product && typeof product.id === 'string' && typeof product.name === 'string' && typeof product.brand === 'string' && typeof product.category === 'string') add(product)
      }
    } catch { /* The canonical provider still preserves the current stack. */ }
  }, [state.loading, state.identity, stack, add])

  useEffect(() => {
    if (loading || state.busy || bookmarkChecked.current) return
    try {
      const bookmark = JSON.parse(localStorage.getItem('tll-stack-v1') || 'null')
      if (!stack.length && bookmark?.stack?.length && state.identity === null) return
      bookmarkChecked.current = true
      if (bookmark?.goal === goal && Array.isArray(bookmark.stack) && JSON.stringify(bookmark.stack.map((product: Product) => product.id)) === JSON.stringify(stack.map(product => product.id))) setSavedSignature(signature)
    } catch { /* An unreadable bookmark does not affect the provider. */ }
  }, [loading, state.busy, state.identity, goal, stack, signature])

  function saveStack() {
    try {
      localStorage.setItem('tll-stack-v1', JSON.stringify({ goal, stack }))
      setSavedSignature(signature)
      setSaveError('')
    } catch { setSaveError('Browser storage is unavailable. Your stack bookmark could not be saved.') }
  }

  // Reuse the public active catalogue with its existing price/assessment rules.
  useEffect(() => {
    if ((!addOpen && !swap) || catalogue.length) return
    const controller = new AbortController()
    setCatalogueLoading(true)
    setCatalogueError('')
    fetch('/api/products?sort=name', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then(async response => {
        if (!response.ok) throw new Error('Catalogue unavailable')
        const rows = await response.json()
        if (!Array.isArray(rows)) throw new Error('Catalogue unavailable')
        setCatalogueLoading(false)
        setCatalogue(rows.map(row => ({ ...row, product_nutrients: row.nutrients || row.product_nutrients || [] })))
      })
      .catch(() => { if (!controller.signal.aborted) setCatalogueError('Catalogue options could not be loaded. Search below or try opening this list again.') })
      .finally(() => { if (!controller.signal.aborted) setCatalogueLoading(false) })
    return () => controller.abort()
  }, [addOpen, swap, catalogue.length])

  useEffect(() => () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); searchRequest.current++ }, [])

  function changeGoal(next: StackGoal) {
    setSavedSignature(null)
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
    if (!idsKey) { setCartProducts([]); setStackItems([]); setDetailsError(null); setDetailsLoading(false); return }
    setDetailsLoading(true)
    setDetailsError(null)
    setStackItems([])
    setCartProducts([])
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
        setCartProducts(data)
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
    const requestId = ++searchRequest.current
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    setSearching(false)
    setSearchResults([])
    if (!value.trim()) return
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      try {
        const response = await fetch(`/api/products/search?q=${encodeURIComponent(value)}`)
        if (!response.ok) throw new Error('Search unavailable')
        const data = await response.json()
        if (requestId === searchRequest.current) setSearchResults(Array.isArray(data) ? data : [])
      } catch { if (requestId === searchRequest.current) setCatalogueError('Search is unavailable. Please try again.') }
      finally { if (requestId === searchRequest.current) setSearching(false) }
    }, 300)
  }

  function addProduct(product: Product) {
    searchRequest.current++
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    setSearching(false)
    setSearchQuery('')
    setSearchResults([])
    setAddOpen(false)
    setSavedSignature(null)
    add({ id: product.id, name: product.name, brand: product.brand, category: product.category, score: scoreFor(product.brand, product.name) })
  }

  function removeItem(item: StackItem) {
    setSavedSignature(null)
    if (item.products) remove(item.products.id)
  }

  const stackProductIds = new Set(stack.map(item => item.id))

  // Catalogue identities are hydrated separately from saved membership. A
  // stored score, unresolved serving or unavailable record cannot affect this
  // historical average; it is not a combined-stack assessment.
  const assessmentProducts = stackItems.flatMap(item => item.products ? [item.products] : [])
  const assessmentSummary = summariseStackAssessments(assessmentProducts, stack.length)

  const dailyTotals = stackDoseTotals(stackItems).map(row => {
    const limit = NUTRIENT_LIMITS[row.name]
    const amount = limit ? convertAmount(row.amount, row.unit, limit.unit) : null
    const rni = rniFor(row.name, sex)
    const rniAmount = rni ? convertAmount(row.amount, row.unit, rni.unit) : null
    return { ...row, ulPercent: limit?.ul && amount != null ? Math.round(amount / limit.ul * 100) : null,
      limitLabel: limit?.limitLabel ?? 'UL', rdaPercent: rni && rniAmount != null ? Math.round(rniAmount / rni.value * 100) : null }
  })
  const flags = dailyTotals.filter(row => row.ulPercent != null && row.ulPercent >= 80)
  const stackCosts = stackItems.map(item => dailyCost(cartProducts.find(product => product.id === item.products?.id) || {}, item.servings_per_day))
  const stackDailyCost = stack.length === 0 ? 0 : stackItems.length === stack.length && stackCosts.every((value): value is number => value !== null)
    ? stackCosts.reduce((sum, value) => sum + value, 0) : null
  const money = (value: number | null) => value === null ? '—' : `£${value.toFixed(2)}`
  const candidates = catalogue.filter(product => !stackProductIds.has(product.id))
  const addOptions = candidates.filter(product => `${product.name} ${product.brand} ${product.category}`.toLowerCase().includes(searchQuery.toLowerCase()))
  const shareUrl = buildShareUrl(stackItems)
  const stackPath = !loading && !detailsError && cartProducts.length === stack.length
    ? shareStackPath(cartProducts.map(product => ({ ...product, quantity: 1 }))) : null
  const emailUrl = buildEmailLink(stackItems, stack.length)

  // Individual listings remain available alongside the optional store cart link.
  const retailerGroups = useMemo(() => {
    const groups: Record<string, { label: string; products: NonNullable<StackItem['products']>[] }> = {}
    for (const it of stackItems) {
      const p = it.products
      if (!p) continue
      const listing = resolveProductOffer({ ...p, buy_url: p.buy_url ?? null }, DEFAULT_STORE_BUY_LINK_MODE, 'stack')
      if (listing.state !== 'listing' || !listing.url || !listing.retailer) continue
      const label = listing.retailer
      if (!groups[label]) groups[label] = { label, products: [] }
      groups[label].products.push(p)
    }
    return Object.values(groups).sort((a, b) => b.products.length - a.products.length)
  }, [stackItems])

  // Social share text for the whole stack.
  const siteOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://theliftinglab.co.uk'
  const siteUrl = siteOrigin + (stackPath || '/stack')
  const shareText = stackResearchText(assessmentProducts, stack.length)
  async function copyLink() {
    if (!stackPath) return
    try { await navigator.clipboard.writeText(siteUrl); setCopied(true); setCopyError('') }
    catch { setCopyError('The link could not be copied. Select the link below to copy it manually.') }
  }

  return (
    <div data-theme="lab" className="stack-builder">
      <section className="stack-hero">
        <p className="stack-eyebrow">Stack builder</p>
        <h1>What are you training for?</h1>
        <p>Choose a goal to organise your stack. Explore ingredients, compare recorded costs and make it your own.</p>
        <div className="stack-chips" role="group" aria-label="Training goal">
          {STACK_GOALS.map(option => <button key={option} type="button" aria-pressed={goal === option} onClick={() => changeGoal(option)}>{option}</button>)}
        </div>
        <p className="stack-meta">Your goal organises your manual stack and is saved in this browser. Changing it keeps your chosen products. Goal-based recommendations await assessment review.</p>
      </section>

      <div role="status" aria-live="polite" className="stack-notices">
        {state.busy && <p>Saving stack…</p>}
        {state.identity && state.guest.length > 0 && <p>{state.guest.length} browser item(s) awaiting confirmation in your account. <button type="button" disabled={state.busy || state.loading} onClick={retry}>Save browser items</button></p>}
        {Boolean(state.snapshot?.recoveryConflicts) && <p>Earlier saved stacks contain differing serving amounts. Original entries are preserved for support review; conflicting amounts have not been added together.</p>}
        {state.error && <p>{state.error} {state.retryable && <button type="button" disabled={state.busy} onClick={retry}>Retry sync</button>}</p>}
        {detailsError && <p>{detailsError} <button type="button" onClick={() => setDetailAttempt(n => n + 1)}>Retry details</button></p>}
      </div>
      {unresolved.length > 0 && <div className="stack-card">
        <p>Serving amounts need review. These saved items are excluded from totals until corrected.</p>
        {unresolved.map(item => <div key={item.product_id} className="stack-row"><span>{item.products?.brand} {item.products?.name || 'Unavailable saved product'} — amount unresolved</span><button type="button" disabled={state.busy} onClick={() => remove(item.product_id)}>Remove</button></div>)}
      </div>}

      <div className="stack-columns">
        <section className="stack-slots" aria-labelledby="stack-heading">
          <div className="stack-row"><h2 id="stack-heading">Your {goal.toLowerCase()} stack</h2><span className="stack-mono stack-muted">{stack.length} products</span></div>
          {loading ? <p role="status">Loading your stack…</p> : stack.length === 0 ? <div className="stack-empty"><p>Your stack is empty. Add an ingredient below to get started.</p></div> : stackItems.map((item, itemIndex) => {
            const product = item.products
            if (!product) return null
            const options = [cartProducts.find(row => row.id === product.id), ...candidates.filter(row => row.category === product.category)].filter((row): row is BatchProduct => Boolean(row))
              .sort((a, b) => (dailyCost(a) ?? Infinity) - (dailyCost(b) ?? Infinity) || a.name.localeCompare(b.name))
            return <article key={item.id} className="stack-card">
              <div className="stack-row stack-slot-head">
                <div><p className="stack-eyebrow">{CATEGORY_LABELS[product.category] || product.category}</p><h3>{product.name}</h3>
                  <p className="stack-muted">{product.brand} · <span className="stack-mono">{product.serving_size} {product.serving_unit} × {item.servings_per_day}/day</span> · {timingFor(product.category)}</p></div>
                <div className="stack-slot-cost"><b className="stack-mono">{money(stackCosts[itemIndex])}</b><span className="stack-meta">a day</span></div>
              </div>
              <div className="stack-ingredients">{(product.product_nutrients || []).slice(0, 4).map(n => <span key={n.nutrient_name}>{n.nutrient_name} <span className="stack-mono">{n.amount} {n.unit}</span></span>)}</div>
              <ProductAssessment product={catalogueAssessment(product)} size="sm" />
              <div className="stack-actions">
                <button type="button" className="stack-button" aria-expanded={swap === product.id} aria-controls={`swap-${product.id}`} onClick={() => setSwap(swap === product.id ? null : product.id)}>Swap · {catalogue.length ? `${options.filter(row => row.id !== product.id).length} options` : 'view options'}</button>
                <button type="button" className="stack-text-button" disabled={state.busy} onClick={() => removeItem(item)}>Remove</button>
                <StagingCartAdd productId={product.id} />
              </div>
              {swap === product.id && <div id={`swap-${product.id}`} className="stack-drawer">
                <p className="stack-eyebrow">Ranked by recorded cost per dose</p>
                <p className="stack-meta">Same category; check ingredient amounts and pack size. Replacements start at one label serving a day. Unpriced options appear last.</p>
                {catalogueLoading && <p role="status">Loading options…</p>}
                {catalogueError && <p role="status">{catalogueError}</p>}
                {options.map((option, index) => {
                  const current = option.id === product.id
                  const cost = dailyCost(option)
                  const oldCost = stackCosts[itemIndex]
                  const difference = cost !== null && oldCost !== null ? (cost - oldCost) * 30 : null
                  const note = current ? 'In your stack' : difference === null ? 'Cost unavailable' : Math.abs(difference) < 0.005 ? 'Same cost' : `£${Math.abs(difference).toFixed(2)} ${difference < 0 ? 'less' : 'more'} a month`
                  return <button key={option.id} type="button" className="stack-option" aria-pressed={current} disabled={state.busy || loading} onClick={() => {
                    if (!current) { setPendingSwap({ previous: product.id, next: option.id }); addProduct(option) }
                    setSwap(null)
                  }}><span className="stack-mono">{index + 1}</span><span><b>{option.name}</b><small>{option.brand} · {note}</small></span><span className="stack-mono">{money(cost)}</span></button>
                })}
              </div>}
            </article>
          })}

          {!loading && stack.filter(product => !stackItems.some(item => item.products?.id === product.id) && !unresolved.some(item => item.product_id === product.id)).map(product => <div className="stack-card" key={`missing-${product.id}`}><h3>{product.name}</h3><p>Product details unavailable; excluded from totals.</p><button type="button" className="stack-button" disabled={state.busy} onClick={() => remove(product.id)}>Remove</button></div>)}
          {!loading && dailyTotals.filter(row => row.contributions.length > 1).map(row => <div className="stack-nudge" key={`${row.name}-${row.unit}`}><b>{row.contributions.length} products contain {row.name.toLowerCase()}</b><p>Combined: <span className="stack-mono">{Number(row.amount.toFixed(2))} {row.unit}</span> a day. See the dose panel for context.</p></div>)}
          {!loading && flags.map(row => <div className="stack-nudge" key={`flag-${row.name}`}><b>{row.name} · {row.ulPercent! > 100 ? 'Above' : row.ulPercent === 100 ? 'At' : 'Approaching'} {row.limitLabel}</b><p className="stack-mono">{Number(row.amount.toFixed(2))}{row.unit} total ({row.ulPercent}% of {row.limitLabel === 'UL' ? 'EFSA UL' : row.limitLabel})</p></div>)}

          <button type="button" className="stack-add" aria-expanded={addOpen} aria-controls="stack-add-list" onClick={() => { setAddOpen(!addOpen); setSwap(null) }}>+ Add an ingredient</button>
          {addOpen && <div id="stack-add-list" className="stack-card">
            <label htmlFor="stack-product-search" className="stack-eyebrow">Add a product</label>
            <input id="stack-product-search" ref={searchInput} type="search" value={searchQuery} onChange={event => handleSearchChange(event.target.value)} placeholder="Search the catalogue…" />
            {catalogueLoading || searching ? <p role="status">Loading options…</p> : null}
            {catalogueError && <p role="status">{catalogueError}</p>}
            <div className="stack-options">{(catalogue.length ? addOptions : searchResults.filter(product => !stackProductIds.has(product.id))).map(product => <button key={product.id} type="button" className="stack-option" disabled={state.busy} onClick={() => addProduct(product)}><span><small className="stack-eyebrow">{CATEGORY_LABELS[product.category] || product.category}</small><b>{product.name}</b><small>{product.brand}{'product_nutrients' in product ? ` · ${(product.product_nutrients as BatchProduct['product_nutrients']).map(n => n.nutrient_name).join(', ')}` : ''}</small></span><span className="stack-mono">{'retail_price' in product && dailyCost(product as BatchProduct) !== null ? `+ ${money(dailyCost(product as BatchProduct))}` : '+ Add'}</span></button>)}</div>
            {!catalogueLoading && !searching && (catalogue.length ? addOptions.length === 0 : searchQuery && searchResults.length === 0) && <p>No matching products.</p>}
          </div>}

          {!loading && stackItems.length > 0 && <section className="stack-day">
            <h2>Your day</h2>
            <div>{(['Any time', 'Pre-training', 'Post-training', 'Evening'] as const).map(period => {
              const items = stackItems.filter(item => item.products && timingFor(item.products.category) === period)
              return <article key={period} data-filled={items.length > 0}><p className="stack-eyebrow">{period}</p>{items.length ? items.map(item => <p key={item.id}>{item.products.name}<br /><span className="stack-mono">{item.products.serving_size} {item.products.serving_unit}</span></p>) : <p className="stack-muted">Nothing here</p>}</article>
            })}</div>
            <p className="stack-meta">Planning groups only. Follow the product label and ingredient guidance.</p>
          </section>}
        </section>

        <aside className="stack-aside">
          <section className="stack-cost tll-on-dark" aria-labelledby="stack-cost-heading">
            <h2 id="stack-cost-heading" className="stack-eyebrow">Your stack, costed</h2>
            <div className="stack-cost-figures" aria-live="polite" aria-atomic="true"><div><span>Per day</span><b>{loading ? '—' : money(stackDailyCost)}</b></div><div><span>Per month</span><b>{loading ? '—' : money(stackDailyCost === null ? null : stackDailyCost * 30)}</b></div></div>
            <p className="stack-meta">30 days at your recorded daily servings. Costs use recorded catalogue prices; missing prices remain unavailable. Pack quantities and delivery are separate.</p>
            {/* Match the loaded-product summary gate; membership arrives before details. */}
            {!loading && stackItems.length > 0 && <p className="stack-meta">{assessmentSummary.text}</p>}
            <div className="stack-actions"><button ref={shareButton} type="button" aria-expanded={showShare} aria-controls="stack-share" onClick={() => { setShowShare(true); setCopied(false); setCopyError('') }} disabled={loading || !stackItems.length}>Share Stack</button><button type="button" onClick={saveStack} disabled={loading || state.busy}>{saved ? 'Saved' : 'Save stack'}</button></div>
            {(saveError || saved) && <p className="stack-meta" role="status">{saveError || 'Saved in this browser.'}</p>}
            <label className="stack-check"><input type="checkbox" checked={cheaper} onChange={event => setCheaper(event.target.checked)} />Tell me when it gets cheaper</label>
            {cheaper && <p className="stack-meta">Price alerts are not available yet. No alert has been scheduled.</p>}
            <div className="stack-actions"><button type="button" className="stack-text-button" aria-expanded={showTotals} onClick={() => setShowTotals(!showTotals)}>Daily totals</button><a href={emailUrl}>Email stack</a></div>
          </section>
          <CombinedDosePanel totals={dailyTotals} />
          {showTotals && dailyTotals.length > 0 && <section className="stack-card">
            <div className="stack-row"><div><h2>Daily Intake Totals</h2><p className="stack-meta">Recorded label amounts across all products and servings per day.</p></div>
            <fieldset className="stack-chips"><legend>UK adult reference intake</legend>{(['male', 'female'] as Sex[]).map(option => <button key={option} type="button" aria-pressed={sex === option} onClick={() => changeSex(option)}>{option}</button>)}</fieldset></div>
            {dailyTotals.map(row => <div className="stack-total" key={`${row.name}-${row.unit}`}><b>{row.name}</b><span className="stack-mono">{Number(row.amount.toFixed(2))}{row.unit}</span><span>{row.rdaPercent == null ? '—' : `${row.rdaPercent}% UK adult reference intake`}</span><span>{row.ulPercent == null ? 'No upper level' : `${row.ulPercent}% ${row.limitLabel}`}</span></div>)}
            <p className="stack-meta">UL is the EFSA upper limit; vitamin C uses UK EVM supplemental guidance and iron uses the EFSA total-intake guidance level, neither an established UL. UK adult reference intake percentages use the {sex} reference values. Recorded supplements exclude food and drink. These totals do not establish a suitable or recommended dose.</p>
          </section>}
        </aside>
      </div>

      {!loading && retailerGroups.length > 0 && <section className="stack-card">
        <h2>Retailer listings</h2><p className="stack-muted">Check the exact product, pack, price and stock at each retailer.</p>
        {retailerGroups.map(group => <div key={group.label}><h3>{group.label}</h3>{group.products.map(product => <div key={product.id} className="stack-row"><span>{product.brand} {product.name}</span><ProductOfferLink storeCampaign="stack" product={{ ...product, buy_url: product.buy_url ?? null }} className="stack-button" /></div>)}</div>)}
      </section>}

      <div className="stack-buybar tll-on-dark">
        <div className="stack-row"><div><b className="stack-mono">{stack.length} products · 30 days</b><p>Daily serving estimate: {loading ? '—' : money(stackDailyCost === null ? null : stackDailyCost * 30)} a month</p></div>
          {!stackCartEnabled() && <button type="button" disabled>Buy my stack · Coming soon</button>}
          <BuyMyStack items={cartProducts.filter(product => stackProductIds.has(product.id)).map(product => ({ ...product, quantity: 1 }))} ready={!loading && !detailsError && cartProducts.length === stack.length && cartProducts.every(product => stackProductIds.has(product.id))} />
        </div>
        {stackCartEnabled() && (loading || !stack.length) && <p>{loading ? 'Loading store availability…' : 'Add products to check store availability.'}</p>}
      </div>

      {showShare && <section id="stack-share" className="stack-share" aria-labelledby="stack-share-title">
        <div className="stack-share-card tll-on-dark">
          <p className="stack-eyebrow">The Lifting Lab</p><h2 id="stack-share-title" ref={shareHeading} tabIndex={-1}>My {goal.toLowerCase()} stack</h2>
          {stackItems.map(item => <div key={item.id}><b>{item.products.brand} {item.products.name}</b><p className="stack-mono">{item.products.serving_size} {item.products.serving_unit} × {item.servings_per_day}/day</p></div>)}
          <p className="stack-share-money">{money(stackDailyCost)}</p><p>a day · theliftinglab.co.uk</p>
          <p className="stack-meta">{shareText}</p>
        </div>
        <div className="stack-actions"><button type="button" disabled={!stackPath} onClick={copyLink}>{copied ? 'Link copied' : 'Copy share link'}</button><button type="button" onClick={() => { setShowShare(false); shareButton.current?.focus() }}>Close</button></div>
        {stackPath ? <a href={stackPath} className="stack-share-url">{siteUrl}</a> : <p className="stack-meta">A variant-based stack URL is unavailable until every product has an approved store mapping and can be included. Affiliate items cannot be represented in this URL.</p>}
        {copyError && <p role="status">{copyError}</p>}
        <a href={shareUrl} target="_blank" rel="noopener noreferrer">Open share card image</a>
      </section>}
    </div>
  )
}
