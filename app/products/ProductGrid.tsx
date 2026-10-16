'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import InformedSportIcon from '@/components/InformedSportIcon'
import ClaimsReviewNotice from '@/components/ClaimsReviewNotice'
import FavouriteButton from '@/components/FavouriteButton'
import MethodologyModal from '@/components/MethodologyModal'
import ShopScoreBadge from '@/components/ShopScoreBadge'
import ServingLabel from '@/components/ServingLabel'
import styles from '@/components/shop.module.css'
import ProductImage from '@/components/ProductImage'
import ProductOfferLink from '@/components/ProductOfferLink'
import { useLocalStack } from '@/components/LocalStackContext'
import { useShopPanels } from '@/components/ShopPanelsContext'
import { assessmentDisplayFor } from '@/lib/assessment-display'
import { CATEGORIES, categoryLabel } from '@/lib/categories'
import { CATEGORY_GROUPS } from '@/lib/category-groups'
import { createClient } from '@/lib/supabase'
import { isSyntheticPreview } from '@/lib/preview-mode'
import { track } from '@/lib/gtag'
import { formatListedServingPrice, sortScored, trueCostReason, type ScoredProduct, type SortKey } from '@/lib/products'
import { displayPrice, isUsablePrice } from '@/lib/commerce/display-price'
import type { ReviewSummary } from '@/app/api/products/reviews-summary/route'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'budget', label: 'Lowest true cost (listed £/serving)' },
  { key: 'score', label: 'Score (pending review · A–Z)' },
  { key: 'value', label: 'Effectiveness value unavailable (A–Z)' },
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
      sort: sort && SORT_KEYS.includes(sort as SortKey) ? sort as SortKey : 'budget',
      q: searchParams.get('q') ?? '',
      group: searchParams.get('group'),
    })
    // The callback is intentionally applied only when the URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])
  return null
}

function formatMoney(value: number | null) {
  if (!isUsablePrice(value)) return 'Not listed'
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
  const { inStack, toggle, state: stackState } = useLocalStack()
  const [all, setAll] = useState(initialProducts)
  const [loading, setLoading] = useState(initialProducts.length === 0)
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState<SortKey>('budget')
  const [query, setQuery] = useState('')
  const [groupParam, setGroupParam] = useState<string | null>(null)
  const { compared, toggleCompare } = useShopPanels()
  const selected = compared.map(product => product.id)
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

  // Direct single-category header links stay single-category. Protein and
  // Health share their group navigation when arriving via a sub-category URL.
  const activeGroup = CATEGORY_GROUPS.find((group) => group.slug === groupParam)
    ?? CATEGORY_GROUPS.find((group) => ['protein', 'wellbeing'].includes(group.slug) && group.categories.includes(category))
  const subCategories = CATEGORIES.filter((item) => activeGroup?.categories.includes(item.slug))

  function selectCategory(next: string) {
    const params = new URLSearchParams(window.location.search)
    if (next === 'all') params.delete('category'); else params.set('category', next)
    if (activeGroup) params.set('group', activeGroup.slug)
    params.set('sort', sort)
    if (query) params.set('q', query); else params.delete('q')
    window.history.pushState(null, '', `${window.location.pathname}?${params}${window.location.hash}`)
    setCategory(next)
    setGroupParam(activeGroup?.slug ?? null)
  }

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
    const product = all.find(item => item.id === id)
    if (product) toggleCompare(product)
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
    <div className={`${styles.shop} pb-44`}>
      <Suspense fallback={null}>
        <UrlParamSync onParams={({ category: nextCategory, sort: nextSort, q, group }) => {
          setCategory(nextCategory); setSort(nextSort); setQuery(q); setGroupParam(group)
        }} />
      </Suspense>

      <header className={styles.categoryHeader}><div>
        <p className={styles.eyebrow}><span className="font-mono">{visible.length}</span> products</p>
        <h1>{heading}</h1>
      </div></header>

      <div className={`${styles.catalogueContent} space-y-6`}>
      <ClaimsReviewNotice category={category} />

      <label className="block max-w-xl">
        <span className="sr-only">Search products</span>
        <input type="search" value={query} onChange={(event) => handleSearch(event.target.value)}
          placeholder="Search by product or brand…"
          className="min-h-12 w-full rounded-md border border-[var(--line-strong)] bg-lab-panel px-4 text-base text-white" />
      </label>

      {subCategories.length > 1 && <div className="hide-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label={`${activeGroup?.label} sub-categories`}>
        <button type="button" onClick={() => selectCategory('all')} aria-pressed={category === 'all'}
          className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${category === 'all' ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--lime)]' : 'border-[var(--line-strong)] bg-lab-panel text-white'}`}>
          All {activeGroup?.label}
        </button>
        {subCategories.map((item) => (
          <button type="button" key={item.slug} onClick={() => selectCategory(item.slug)} aria-pressed={category === item.slug}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${category === item.slug ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--lime)]' : 'border-[var(--line-strong)] bg-lab-panel text-white'}`}>
            {item.label}
          </button>
        ))}
      </div>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setIsOnly((value) => !value)} aria-pressed={isOnly}
            className={`min-h-11 rounded-md border px-3 text-sm font-semibold ${isOnly ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--lime)]' : 'border-[var(--line-strong)] bg-lab-panel text-white'}`}>
            Informed Sport
          </button>
          <div className="relative">
            <button type="button" onClick={() => setBrandPanelOpen((value) => !value)} aria-expanded={brandPanelOpen}
              className="min-h-11 rounded-md border border-[var(--line-strong)] bg-lab-panel px-3 text-sm font-semibold text-white">
              Brands{brandFilter.size ? ` (${brandFilter.size})` : ''} {brandPanelOpen ? '▴' : '▾'}
            </button>
            {brandPanelOpen && (
              <div className="absolute left-0 top-full z-30 mt-1 max-h-72 min-w-56 overflow-y-auto rounded-md border border-lab-border bg-lab-panel p-2">
                {availableBrands.map((brand) => (
                  <button type="button" key={brand} onClick={() => toggleBrand(brand)}
                    className={`block min-h-11 w-full rounded px-2 text-left text-sm ${brandFilter.has(brand) ? 'bg-[var(--lime-wash)] font-semibold text-[var(--lime-ink)]' : 'text-white hover:bg-lab-panel-2'}`}>
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
            className="min-h-11 w-full min-w-0 max-w-full rounded-md border border-[var(--line-strong)] bg-lab-panel px-3 text-sm text-white sm:w-auto">
            {SORTS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>
      </div>

      {!loading && visible.length === 0 && (
        <div className="rounded-xl border border-lab-border bg-lab-panel py-16 text-center text-lab-muted">
          <p className="text-sm">No products match your filters.</p>
        </div>
      )}

      {stackState.error && <p role="alert" className="mb-4 text-sm text-lab-muted">{stackState.error}</p>}
      <div className={styles.productGrid}>
        {visible.map((product) => {
          const isSelected = selected.includes(product.id)
          const stacked = inStack(product.id)
          const assessment = assessmentDisplayFor(product)
          const nutrients = product.nutrients ?? []
          const reviews = reviewSummary[product.id]
          return (
            <article key={product.id} data-product-id={product.id} className={`${styles.card} gap-3 p-6 ${isSelected ? 'border-[var(--line-strong)]' : ''}`}>
              <Link href={`/products/${product.id}`} className={styles.packshot}>
                <ProductImage src={product.image_url} alt={`${product.brand} ${product.name}`} size={240} fill sizes="(max-width: 647px) calc(100vw - 80px), (max-width: 987px) calc(50vw - 84px), 320px" className="max-h-full max-w-full" />
              </Link>

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={styles.brandLine}><p className="truncate text-xs font-semibold uppercase tracking-[.08em] text-lab-muted">{product.brand}</p><InformedSportIcon certified={product.informed_sport} /></div>
                  <Link href={`/products/${product.id}`} className={`${styles.cardTitle} mt-0.5 flex min-h-11 items-center text-[17px] font-semibold leading-6 text-[var(--ink)] hover:underline`}>
                    {product.name}
                  </Link>
                  <p className="mt-1 text-xs text-lab-muted">{categoryLabel(product.category)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <ShopScoreBadge product={product} />
                  <FavouriteButton productId={product.id} favourited={favourites.has(product.id)} signedIn={signedIn}
                    onChange={(active) => setFavourite(product.id, active)} />
                </div>
              </div>

              <div className={styles.priceBox}>
                <div className={styles.primaryPrice}>
                  <span>Price</span>
                  <b>{formatMoney(displayPrice(product))}</b>
                </div>
                <div>
                  <span>True cost</span>
                  <b title={trueCostReason(product) ?? undefined}>{product.cost_per_serving != null ? formatListedServingPrice(product.cost_per_serving) : 'Not listed'}</b>
                </div>
                <div>
                  <span>Per serving</span>
                  <b>{product.cost_per_serving != null ? formatListedServingPrice(product.cost_per_serving) : '—'}</b>
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
                <dd className="m-0 text-right font-medium text-[var(--ink)]">{assessment.label}</dd>
              </dl>

              <ServingLabel nutrients={nutrients} maxRows={3} productName={`${product.brand} ${product.name}`} productHref={`/products/${product.id}`} />

              {reviews && reviews.count > 0 && (
                <div className="space-y-1 border-t border-lab-border pt-3">
                  <div className="flex items-center gap-2">
                    <MiniStars value={Math.round(reviews.average)} />
                    <span className="text-xs font-semibold text-[var(--ink)]">{reviews.average.toFixed(1)} · {reviews.count} review{reviews.count === 1 ? '' : 's'}</span>
                  </div>
                  {reviews.latest && <p className="truncate text-xs italic text-lab-muted">“{reviewSnippet(reviews.latest)}”</p>}
                </div>
              )}

              <div className={`${styles.cardActions} flex flex-col gap-3`}>
                <ProductOfferLink comingSoonWhenNotSold product={product} storeActionLabel="Add to basket"
                  className="w-full rounded-md bg-[var(--ink)] py-3 text-sm font-semibold uppercase tracking-wide text-[var(--lime)]" />

                <div className="grid grid-cols-2 gap-2">
                  <label className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold ${isSelected ? 'border-[var(--ink)] bg-[var(--lime-wash)] text-[var(--lime-ink)]' : 'border-[var(--line-strong)] text-[var(--ink)]'} ${!isSelected && selected.length >= 3 ? 'cursor-not-allowed opacity-50' : ''}`}>
                    <input type="checkbox" checked={isSelected} disabled={!isSelected && selected.length >= 3}
                      onChange={() => toggleSelect(product.id)} className="h-[18px] w-[18px] accent-[var(--ink)]" />
                    {isSelected ? 'Compared' : 'Compare'}
                  </label>
                  <button type="button" aria-pressed={stacked} onClick={() => {
                    toggle({ id: product.id, name: product.name, brand: product.brand, category: product.category, score: product.score })
                    track(stacked ? 'remove_from_stack' : 'add_to_stack', { item_brand: product.brand, item_name: product.name })
                  }} className={`min-h-11 rounded-md border px-3 text-sm font-semibold ${stacked ? 'border-[var(--ink)] bg-[var(--lime-wash)] text-[var(--lime-ink)]' : 'border-[var(--line-strong)] text-[var(--ink)]'}`}>
                    {stacked ? 'In stack' : 'Add to stack'}
                  </button>
                </div>

                <p className="text-xs leading-4 text-lab-muted">
                  Research record only. Check the retailer page for the current pack, price and stock. Informational only, not medical advice.
                </p>
              </div>
            </article>
          )
        })}
      </div>

      </div>
    </div>
  )
}
