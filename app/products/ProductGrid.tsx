'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import ClaimsReviewNotice from '@/components/ClaimsReviewNotice'
import FavouriteButton from '@/components/FavouriteButton'
import MethodologyModal from '@/components/MethodologyModal'
import ProductAssessment from '@/components/ProductAssessment'
import ProductImage from '@/components/ProductImage'
import ProductOfferLink from '@/components/ProductOfferLink'
import { useLocalStack } from '@/components/LocalStackContext'
import { assessmentDisplayFor } from '@/lib/assessment-display'
import { CATEGORIES, categoryLabel } from '@/lib/categories'
import { CATEGORY_GROUPS } from '@/lib/category-groups'
import { createClient } from '@/lib/supabase'
import { isSyntheticPreview } from '@/lib/preview-mode'
import { track } from '@/lib/gtag'
import { formatListedServingPrice, sortScored, trueCostReason, type ScoredProduct, type SortKey } from '@/lib/products'
import type { ReviewSummary } from '@/app/api/products/reviews-summary/route'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'score', label: 'Assessment unavailable (A–Z)' },
  { key: 'value', label: 'Effectiveness value unavailable (A–Z)' },
  { key: 'budget', label: 'Lowest listed price per serving' },
  { key: 'price', label: 'Lowest pack price' },
  { key: 'name', label: 'Product name (A–Z)' },
  { key: 'brand', label: 'Brand (A–Z)' },
]

const SORT_KEYS: SortKey[] = ['score', 'name', 'brand', 'value', 'budget', 'price']
type UrlParams = { category: string; sort: SortKey; q: string; group: string | null }

function UrlParamSync({ onParams }: { onParams: (params: UrlParams) => void }) {
  const searchParams = useSearchParams()
  useEffect(() => {
    const category = searchParams.get('category')
    const sort = searchParams.get('sort')
    onParams({
      category: category && CATEGORIES.some((item) => item.slug === category) ? category : 'all',
      sort: sort && SORT_KEYS.includes(sort as SortKey) ? sort as SortKey : 'score',
      q: searchParams.get('q') ?? '',
      group: searchParams.get('group'),
    })
    // The callback is intentionally applied only when the URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])
  return null
}

function formatMoney(value: number | null) {
  if (value == null || !Number.isFinite(value) || value <= 0) return 'Not listed'
  return `£${value.toFixed(2)}`
}

function reviewSnippet(value: string) {
  const clean = value.trim().replace(/\s+/g, ' ')
  return clean.length <= 90 ? clean : `${clean.slice(0, 89).trimEnd()}…`
}

function MiniStars({ value }: { value: number }) {
  return (
    <span className="inline-flex shrink-0" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((index) => (
        <svg key={index} width={12} height={12} viewBox="0 0 24 24"
          fill={index <= value ? '#e8a020' : 'none'} stroke={index <= value ? '#e8a020' : '#7c7e72'}
          strokeWidth="2" strokeLinejoin="round">
          <path d="M12 2 15 9l7 .5-5.3 4.6L18.5 21 12 17.3 5.5 21 7.3 14.1 2 9.5 9 9z" />
        </svg>
      ))}
    </span>
  )
}

export default function ProductGrid({ initialProducts }: { initialProducts: ScoredProduct[] }) {
  const { inStack, toggle } = useLocalStack()
  const [all, setAll] = useState(initialProducts)
  const [loading, setLoading] = useState(initialProducts.length === 0)
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState<SortKey>('score')
  const [query, setQuery] = useState('')
  const [groupParam, setGroupParam] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [favourites, setFavourites] = useState<Set<string>>(new Set())
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [isOnly, setIsOnly] = useState(false)
  const [brandFilter, setBrandFilter] = useState<Set<string>>(new Set())
  const [brandPanelOpen, setBrandPanelOpen] = useState(false)
  const [reviewSummary, setReviewSummary] = useState<Record<string, ReviewSummary>>({})
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isSyntheticPreview()) { setSignedIn(false); return }
    let cancelled = false
    createClient().auth.getUser()
      .then(({ data }) => { if (!cancelled) setSignedIn(Boolean(data.user)) })
      .catch(() => { if (!cancelled) setSignedIn(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (isSyntheticPreview()) return
    let cancelled = false
    fetch('/api/favourites')
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!cancelled && data) setFavourites(new Set(Array.isArray(data.ids) ? data.ids : []))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (initialProducts.length > 0) return
    let cancelled = false
    fetch('/api/products?sort=score')
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return
        setAll(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) { setAll([]); setLoading(false) }
      })
    return () => { cancelled = true }
  }, [initialProducts.length])

  useEffect(() => {
    if (isSyntheticPreview()) return
    let cancelled = false
    fetch('/api/products/reviews-summary')
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!cancelled && data && typeof data === 'object') setReviewSummary(data as Record<string, ReviewSummary>)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const groupCategories = useMemo(() => {
    if (!groupParam) return null
    return CATEGORY_GROUPS.find((group) => group.slug === groupParam)?.categories ?? null
  }, [groupParam])

  const activeCategories = useMemo(() => {
    const present = new Set(all.map((product) => product.category))
    return CATEGORIES.filter((item) => present.has(item.slug))
  }, [all])

  const availableBrands = useMemo(() => Array.from(new Set(all.map((product) => product.brand))).sort(), [all])

  const visible = useMemo(() => {
    const search = query.trim().toLowerCase()
    let products = all
    if (category !== 'all') products = products.filter((product) => product.category === category)
    else if (groupCategories) products = products.filter((product) => groupCategories.includes(product.category))
    if (isOnly) products = products.filter((product) => product.informed_sport === true)
    if (brandFilter.size) products = products.filter((product) => brandFilter.has(product.brand))
    if (search) products = products.filter((product) => `${product.brand} ${product.name}`.toLowerCase().includes(search))
    return sortScored(products, sort)
  }, [all, brandFilter, category, groupCategories, isOnly, query, sort])

  const selectedProducts = selected
    .map((id) => all.find((product) => product.id === id))
    .filter((product): product is ScoredProduct => Boolean(product))

  const heading = category !== 'all'
    ? categoryLabel(category)
    : groupParam
      ? CATEGORY_GROUPS.find((group) => group.slug === groupParam)?.label ?? 'All supplements'
      : 'All supplements'

  function handleSearch(value: string) {
    setQuery(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (value.trim()) searchTimer.current = setTimeout(() => track('search_query', { search_term: value.trim() }), 600)
  }

  function toggleSelect(id: string) {
    setSelected((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : current.length < 3 ? [...current, id] : current)
  }

  function setFavourite(id: string, active: boolean) {
    setFavourites((current) => {
      const next = new Set(current)
      if (active) next.add(id); else next.delete(id)
      return next
    })
  }

  function toggleBrand(brand: string) {
    setBrandFilter((current) => {
      const next = new Set(current)
      if (next.has(brand)) next.delete(brand); else next.add(brand)
      return next
    })
  }

  return (
    <div className="space-y-6 pb-44">
      <Suspense fallback={null}>
        <UrlParamSync onParams={({ category: nextCategory, sort: nextSort, q, group }) => {
          setCategory(nextCategory); setSort(nextSort); setQuery(q); setGroupParam(group)
        }} />
      </Suspense>

      <h1 className="sr-only">{heading}</h1>

      <ClaimsReviewNotice category={category} />

      <label className="block max-w-xl">
        <span className="sr-only">Search products</span>
        <input type="search" value={query} onChange={(event) => handleSearch(event.target.value)}
          placeholder="Search by product or brand…"
          className="min-h-12 w-full rounded-md border border-[#7c7e72] bg-lab-panel px-4 text-base text-white" />
      </label>

      <div className="hide-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by category">
        <button type="button" onClick={() => setCategory('all')} aria-pressed={category === 'all'}
          className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${category === 'all' ? 'border-[#14140f] bg-[#14140f] text-[#a6e22e]' : 'border-[#7c7e72] bg-lab-panel text-white'}`}>
          All
        </button>
        {activeCategories.map((item) => (
          <button type="button" key={item.slug} onClick={() => setCategory(item.slug)} aria-pressed={category === item.slug}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${category === item.slug ? 'border-[#14140f] bg-[#14140f] text-[#a6e22e]' : 'border-[#7c7e72] bg-lab-panel text-white'}`}>
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setIsOnly((value) => !value)} aria-pressed={isOnly}
            className={`min-h-11 rounded-md border px-3 text-sm font-semibold ${isOnly ? 'border-[#14140f] bg-[#14140f] text-[#a6e22e]' : 'border-[#7c7e72] bg-lab-panel text-white'}`}>
            Informed Sport
          </button>
          <div className="relative">
            <button type="button" onClick={() => setBrandPanelOpen((value) => !value)} aria-expanded={brandPanelOpen}
              className="min-h-11 rounded-md border border-[#7c7e72] bg-lab-panel px-3 text-sm font-semibold text-white">
              Brands{brandFilter.size ? ` (${brandFilter.size})` : ''} {brandPanelOpen ? '▴' : '▾'}
            </button>
            {brandPanelOpen && (
              <div className="absolute left-0 top-full z-30 mt-1 max-h-72 min-w-56 overflow-y-auto rounded-md border border-lab-border bg-lab-panel p-2 shadow-xl">
                {availableBrands.map((brand) => (
                  <button type="button" key={brand} onClick={() => toggleBrand(brand)}
                    className={`block min-h-11 w-full rounded px-2 text-left text-sm ${brandFilter.has(brand) ? 'bg-[#eef5dc] font-semibold text-[#4a6e0b]' : 'text-white hover:bg-lab-panel-2'}`}>
                    {brandFilter.has(brand) ? '✓ ' : ''}{brand}
                  </button>
                ))}
              </div>
            )}
          </div>
          <MethodologyModal category={category === 'all' ? undefined : category} />
        </div>
        <label className="flex min-h-11 w-full min-w-0 flex-col items-stretch gap-1 text-sm text-lab-muted sm:w-auto sm:flex-row sm:items-center sm:gap-2">
          <span>Sort by</span>
          <select aria-label="Sort products" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}
            className="min-h-11 w-full min-w-0 max-w-full rounded-md border border-[#7c7e72] bg-lab-panel px-3 text-sm text-white sm:w-auto">
            {SORTS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>
      </div>

      {!loading && visible.length === 0 && (
        <div className="rounded-xl border border-lab-border bg-lab-panel py-16 text-center text-lab-muted">
          <p className="text-sm">No products match your filters.</p>
        </div>
      )}

      <div className="grid items-start gap-6 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((product) => {
          const isSelected = selected.includes(product.id)
          const stacked = inStack(product.id)
          const assessment = assessmentDisplayFor(product)
          const nutrients = product.nutrients ?? []
          const reviews = reviewSummary[product.id]
          return (
            <article key={product.id} data-product-id={product.id} className={`lab-card grid gap-3 p-4 sm:p-5 ${isSelected ? 'border-[#7c7e72]' : ''}`}>
              <Link href={`/products/${product.id}`} className="grid aspect-square place-items-center overflow-hidden rounded-lg bg-lab-panel-2">
                <ProductImage src={product.image_url} alt={`${product.brand} ${product.name}`} size={240} fill className="max-h-full max-w-full" />
              </Link>

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[.08em] text-lab-muted">{product.brand}</p>
                  <Link href={`/products/${product.id}`} className="mt-0.5 block text-[17px] font-semibold leading-6 text-white hover:underline">
                    {product.name}
                  </Link>
                  <p className="mt-1 text-xs text-lab-muted">{categoryLabel(product.category)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <ProductAssessment product={product} size="sm" />
                  <FavouriteButton productId={product.id} favourited={favourites.has(product.id)} signedIn={signedIn}
                    onChange={(active) => setFavourite(product.id, active)} />
                </div>
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 rounded-lg bg-lab-panel-2 p-3">
                <div className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-lab-muted">True cost</span>
                  <b className="mt-1 block font-mono text-lg text-white" title={trueCostReason(product) ?? undefined}>
                    {product.cost_per_serving != null ? formatListedServingPrice(product.cost_per_serving) : 'Not listed'}
                  </b>
                </div>
                <div className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-lab-muted">Per serving</span>
                  <b className="mt-1 block font-mono text-sm text-white">{product.cost_per_serving != null ? formatListedServingPrice(product.cost_per_serving) : '—'}</b>
                </div>
                <div className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-lab-muted">Our price</span>
                  <b className="mt-1 block font-mono text-sm text-white">{formatMoney(product.retail_price)}</b>
                </div>
              </div>

              <dl className="grid grid-cols-[1fr_auto] gap-x-3 text-sm">
                <dt className="text-lab-muted">Servings</dt>
                <dd className="m-0 text-right font-mono text-white">{product.servings_per_container ?? 'Not listed'}</dd>
                <dt className="text-lab-muted">Serving size</dt>
                <dd className="m-0 text-right font-mono text-white">
                  {product.serving_size != null ? `${product.serving_size}${product.serving_unit ? ` ${product.serving_unit}` : ''}` : 'Not listed'}
                </dd>
                <dt className="text-lab-muted">Assessment</dt>
                <dd className="m-0 text-right font-medium text-white">{assessment.label}</dd>
              </dl>

              {nutrients.length > 0 && (
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[.08em] text-lab-muted">Per serving</p>
                  <dl className="divide-y divide-lab-border">
                    {nutrients.map((nutrient) => (
                      <div key={`${nutrient.nutrient_name}-${nutrient.amount}-${nutrient.unit}`} className="grid grid-cols-[1fr_auto] gap-3 py-1.5 text-sm">
                        <dt className="text-lab-muted">{nutrient.nutrient_name}</dt>
                        <dd className="m-0 font-mono text-white">{nutrient.amount}{nutrient.unit}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {product.informed_sport && <p className="rounded bg-[#e6eef8] px-2 py-1 text-xs font-semibold text-[#1f4f8a]">Informed Sport certified</p>}

              {reviews && reviews.count > 0 && (
                <div className="space-y-1 border-t border-lab-border pt-3">
                  <div className="flex items-center gap-2">
                    <MiniStars value={Math.round(reviews.average)} />
                    <span className="text-xs font-semibold text-white">{reviews.average.toFixed(1)} · {reviews.count} review{reviews.count === 1 ? '' : 's'}</span>
                  </div>
                  {reviews.latest && <p className="truncate text-xs italic text-lab-muted">“{reviewSnippet(reviews.latest)}”</p>}
                </div>
              )}

              <div className="rounded-lg border border-lab-border px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-lab-muted">Price check</p>
                <div className="mt-1 grid grid-cols-[1fr_auto] gap-3 text-sm">
                  <span className="font-semibold">Recorded catalogue price</span>
                  <span className="font-mono font-bold">{formatMoney(product.retail_price)}</span>
                </div>
              </div>

              <ProductOfferLink product={product}
                className="w-full rounded-md bg-[#14140f] py-3 text-sm font-semibold uppercase tracking-wide text-[#a6e22e]" />

              <div className="grid grid-cols-2 gap-2">
                <label className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold ${isSelected ? 'border-[#14140f] bg-[#eef5dc] text-[#4a6e0b]' : 'border-[#7c7e72] text-white'} ${!isSelected && selected.length >= 3 ? 'cursor-not-allowed opacity-50' : ''}`}>
                  <input type="checkbox" checked={isSelected} disabled={!isSelected && selected.length >= 3}
                    onChange={() => toggleSelect(product.id)} className="h-[18px] w-[18px] accent-[#14140f]" />
                  {isSelected ? 'Compared' : 'Compare'}
                </label>
                <button type="button" aria-pressed={stacked} onClick={() => {
                  toggle({ id: product.id, name: product.name, brand: product.brand, category: product.category, score: product.score })
                  track(stacked ? 'remove_from_stack' : 'add_to_stack', { item_brand: product.brand, item_name: product.name })
                }} className={`min-h-11 rounded-md border px-3 text-sm font-semibold ${stacked ? 'border-[#14140f] bg-[#eef5dc] text-[#4a6e0b]' : 'border-[#7c7e72] text-white'}`}>
                  {stacked ? '✓ In stack' : '+ Stack'}
                </button>
              </div>

              <p className="text-xs leading-4 text-lab-muted">
                Research record only. Check the retailer page for the current pack, price and stock. Informational only, not medical advice.
              </p>
            </article>
          )
        })}
      </div>

      {selected.length > 0 && (
        <div className="fixed inset-x-3 bottom-3 z-30 mx-auto max-w-6xl rounded-xl border border-[#2a2c26] bg-[#0d0d0d] p-3 text-[#f2f2ee] shadow-2xl sm:inset-x-6 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid flex-1 grid-cols-3 gap-2">
              {[0, 1, 2].map((index) => {
                const product = selectedProducts[index]
                return product ? (
                  <div key={product.id} className="flex min-h-11 min-w-0 items-center gap-2 rounded-md border border-[#6c6f63] px-2 sm:px-3">
                    <span className="min-w-0 flex-1 truncate text-xs font-medium sm:text-sm">{product.name}</span>
                    <button type="button" onClick={() => toggleSelect(product.id)} aria-label={`Remove ${product.name} from comparison`}
                      className="min-h-9 min-w-9 shrink-0 rounded text-lg">×</button>
                  </div>
                ) : (
                  <div key={index} className="grid min-h-11 place-items-center rounded-md border border-dashed border-[#6c6f63] px-2 text-xs text-[#a9ac9f]">
                    Empty slot
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-between gap-3 lg:justify-end">
              <span className="text-xs text-[#a9ac9f]">Choose up to three</span>
              <button type="button" onClick={() => setSelected([])} className="min-h-11 px-2 text-sm font-semibold text-[#a9ac9f]">Clear</button>
              <Link href={`/compare?ids=${selected.join(',')}`} onClick={() => track('compare_start', { count: selected.length })}
                className="inline-flex min-h-11 items-center rounded-md bg-[#a6e22e] px-5 text-sm font-semibold text-[#14140f]">
                Compare side by side
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
