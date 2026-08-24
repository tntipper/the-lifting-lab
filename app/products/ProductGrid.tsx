'use client'

import { Suspense, useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import ScoreBadge from '@/components/ScoreBadge'
import FavouriteButton from '@/components/FavouriteButton'
import ProductImage from '@/components/ProductImage'
import { createClient } from '@/lib/supabase'
import MethodologyModal from '@/components/MethodologyModal'
import { useLocalStack } from '@/components/LocalStackContext'
import { CATEGORIES, categoryLabel } from '@/lib/categories'
import { sortScored, trueCostReason, type ScoredProduct, type SortKey } from '@/lib/products'
import { buyLink } from '@/lib/affiliate'
import { GUIDE_SLUGS } from '@/lib/guides'
import { track } from '@/lib/gtag'
import { CATEGORY_GROUPS } from '@/lib/category-groups'
import type { ReviewSummary } from '@/app/api/products/reviews-summary/route'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'score', label: 'Best Rating' },
  { key: 'value', label: 'Best Value for Score' },
  { key: 'budget', label: 'Budget Pick' },
  { key: 'name', label: 'Name (A–Z)' },
  { key: 'brand', label: 'Brand (A–Z)' },
]

const MEDALS = ['🥇', '🥈', '🥉']

const CATEGORY_BENEFITS: Record<string, string> = {
  'whey':             'Fast-absorbing protein · Muscle protein synthesis · Post-workout recovery',
  'whey-isolate':     'High-purity protein · Low lactose · Lean muscle support',
  'casein':           'Slow-release protein · Overnight muscle repair · Anti-catabolic',
  'creatine':         'Strength & power output · ATP resynthesis · Muscle volumisation',
  'pre-workout':      'Training energy & focus · Blood flow & endurance · Delayed fatigue',
  'eaas':             'Full essential amino acid profile · Muscle repair · Intra-workout fuel',
  'intra-workout':    'Hydration & endurance · Amino acid delivery · Electrolyte replenishment',
  'post-workout':     'Recovery acceleration · Glycogen replenishment · Reduced DOMS',
  'hydration':        'Electrolyte balance · Performance hydration · Cramp prevention',
  'protein-bar':      'On-the-go protein · Controlled macros · Convenient muscle support',
  'meal-replacement': 'Balanced macro profile · Calorie management · Convenient nutrition',
  'cycle-support':    'Liver & organ protection · Hormone balance · Lipid management',
  'hormone-support':  'Testosterone support · Hormonal balance · Recovery optimisation',
  'vitamin':          'Micronutrient support · Immune function · Overall health foundation',
  'multivitamin':     'Full micronutrient spectrum · Immune & metabolic support · Daily baseline',
  'vitamin-d':        'Bone density · Immune regulation · Testosterone support',
  'vitamin-c':        'Immune defence · Collagen synthesis · Antioxidant protection',
  'gut-digestion':    'Digestive enzyme support · Gut microbiome · Nutrient absorption',
  'heart-health':     'Cardiovascular support · Cholesterol balance · Blood pressure',
  'liver-health':     'Liver detoxification · Hepatoprotective support · Antioxidant defence',
  'omega-3':          'Inflammation reduction · Heart & brain health · Joint lubrication',
  'joint-health':     'Cartilage support · Joint lubrication · Anti-inflammatory',
  'magnesium':        'Sleep quality · Muscle relaxation · Hormonal & nerve function',
  'sleep-recovery':   'Sleep onset · Deep sleep quality · Recovery & cortisol regulation',
  'zma':              'Testosterone & growth hormone · Sleep depth · Muscle recovery',
}

function PointerCard({
  children,
  className,
  style,
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)
  function handleMouseMove(e: React.MouseEvent) {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%')
    el.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%')
  }
  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      className={`lab-card beam ${className ?? ''}`}
      style={{ '--mx': '50%', '--my': '30%', ...style } as React.CSSProperties}
    >
      {children}
    </div>
  )
}

function fmt(n: number) {
  return n < 10 ? `£${n.toFixed(2)}` : `£${Math.round(n)}`
}

// Strict character cap for the latest-review snippet on a card (F12) so a long
// review can't blow out the card height. Collapses whitespace, then truncates.
const SNIPPET_MAX = 90
function reviewSnippet(text: string) {
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length <= SNIPPET_MAX ? t : t.slice(0, SNIPPET_MAX - 1).trimEnd() + '…'
}

// Compact star row matching the product-detail review styling (same SVG path).
function MiniStars({ value }: { value: number }) {
  return (
    <span className="inline-flex shrink-0" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width={11} height={11} viewBox="0 0 24 24"
          fill={i <= value ? '#e8a020' : 'none'} stroke={i <= value ? '#e8a020' : '#3a3a3a'}
          strokeWidth="2" strokeLinejoin="round">
          <path d="M12 2 15 9l7 .5-5.3 4.6L18.5 21 12 17.3 5.5 21 7.3 14.1 2 9.5 9 9z" />
        </svg>
      ))}
    </span>
  )
}

const SORT_KEYS: SortKey[] = ['score', 'name', 'brand', 'value', 'budget']

type UrlParams = { category: string; sort: SortKey; q: string; group: string | null }

// Reads the deep-link params (?category= ?sort= ?q= ?group=) and hands them to
// the grid once on mount. This lives in its own Suspense-wrapped child because
// useSearchParams() in the grid itself would force the whole statically
// rendered /products page to bail out to client rendering — which is exactly
// what put a "Loading…" shell in the HTML crawlers and no-JS users received.
// Validated against the known category/sort lists so a junk param can't wedge
// the filter on an empty set.
function UrlParamSync({ onParams }: { onParams: (p: UrlParams) => void }) {
  const searchParams = useSearchParams()
  useEffect(() => {
    const c = searchParams.get('category')
    const so = searchParams.get('sort')
    onParams({
      category: c && CATEGORIES.some((cat) => cat.slug === c) ? c : 'all',
      sort: so && SORT_KEYS.includes(so as SortKey) ? (so as SortKey) : 'score',
      q: searchParams.get('q') ?? '',
      group: searchParams.get('group'),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])
  return null
}

export default function ProductGrid({ initialProducts }: { initialProducts: ScoredProduct[] }) {
  const { inStack, toggle } = useLocalStack()
  const [groupParam, setGroupParam] = useState<string | null>(null)
  const groupCategories = useMemo(() => {
    if (!groupParam) return null
    const g = CATEGORY_GROUPS.find((g) => g.slug === groupParam)
    return g ? g.categories : null
  }, [groupParam])

  // Seeded from the server-rendered catalogue, so the first paint (and the raw
  // HTML) already lists every product. The client refetch below only kicks in
  // as a fallback if the server fetch came back empty (e.g. a transient DB
  // hiccup at build / revalidate time).
  const [all, setAll] = useState<ScoredProduct[]>(initialProducts)
  const [reviewSummary, setReviewSummary] = useState<Record<string, ReviewSummary>>({})
  const [loading, setLoading] = useState(initialProducts.length === 0)
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState<SortKey>('score')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [favs, setFavs] = useState<Set<string>>(new Set())
  // null = auth not resolved yet. Tri-state so FavouriteButton can wait rather
  // than default-to-signed-out and bounce a logged-in user to /auth (F10).
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [isOnly, setIsOnly] = useState(false)
  const [brandFilter, setBrandFilter] = useState<Set<string>>(new Set())
  const [brandPanelOpen, setBrandPanelOpen] = useState(false)
  const [categoryPanelOpen, setCategoryPanelOpen] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Authoritative auth check — independent of the favourites endpoint. Uses the
  // same session the rest of the app relies on (see TopNav), so a 401/500 from
  // /api/favourites can never make a signed-in user look logged out.
  useEffect(() => {
    let cancelled = false
    createClient().auth.getUser()
      .then(({ data }) => { if (!cancelled) setSignedIn(!!data.user) })
      .catch(() => { if (!cancelled) setSignedIn(false) })
    return () => { cancelled = true }
  }, [])

  // Load the user's favourite ids for the heart fill state. A non-ok response
  // here only leaves favs empty — it no longer affects signed-in state.
  useEffect(() => {
    let cancelled = false
    fetch('/api/favourites')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        setFavs(new Set<string>(Array.isArray(data.ids) ? data.ids : []))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Fallback only: the catalogue normally arrives server-rendered via props.
  useEffect(() => {
    if (initialProducts.length > 0) return
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
    return () => { cancelled = true }
  }, [initialProducts])

  // Per-product review aggregates for the cards (F12). Fetched in parallel; a
  // failure here just leaves cards without a review line — never blocks the grid.
  useEffect(() => {
    let cancelled = false
    fetch('/api/products/reviews-summary')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data || typeof data !== 'object') return
        setReviewSummary(data as Record<string, ReviewSummary>)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const activeCategories = useMemo(() => {
    const present = new Set(all.map((p) => p.category))
    return CATEGORIES.filter((c) => present.has(c.slug))
  }, [all])

  const availableBrands = useMemo(() => {
    const brands = new Set(all.map((p) => p.brand))
    return Array.from(brands).sort()
  }, [all])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = all
    // A specific category pick overrides the group scope (the category chips list
    // every category, so selecting one outside the current group must not intersect
    // to an empty set). Group scope only applies while category is 'all'.
    if (category !== 'all') list = list.filter((p) => p.category === category)
    else if (groupCategories) list = list.filter((p) => groupCategories.includes(p.category))
    if (isOnly) list = list.filter((p) => p.informed_sport === true)
    if (brandFilter.size) list = list.filter((p) => brandFilter.has(p.brand))
    if (q) list = list.filter((p) => `${p.brand} ${p.name}`.toLowerCase().includes(q))
    return sortScored(list, sort)
  }, [all, category, sort, query, isOnly, groupCategories, brandFilter])

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

  function setFav(id: string, favourited: boolean) {
    setFavs((prev) => {
      const next = new Set(prev)
      if (favourited) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleBrand(brand: string) {
    setBrandFilter((prev) => {
      const next = new Set(prev)
      if (next.has(brand)) next.delete(brand)
      else next.add(brand)
      return next
    })
  }

  const topLabel = sort === 'value' ? 'Best Value Pick' : sort === 'budget' ? 'Best Budget Pick' : 'Top Pick'

  // Dynamic heading word: category chip > group filter > default
  const headingWord = category !== 'all'
    ? categoryLabel(category)
    : groupParam
    ? (CATEGORY_GROUPS.find((g) => g.slug === groupParam)?.label ?? 'Supplement')
    : 'Supplement'

  return (
    <div className="space-y-4 pb-28">
      <Suspense fallback={null}>
        <UrlParamSync
          onParams={(p) => {
            setCategory(p.category)
            setSort(p.sort)
            setQuery(p.q)
            setGroupParam(p.group)
          }}
        />
      </Suspense>
      {/* dynamic heading */}
      <div className="flex items-start justify-between mb-2">
        <div>
          {/* Visual heading only — the crawlable page <h1> is server-rendered in
              page.tsx (this grid is client-only). Demoted to <h2> so the page has
              exactly one h1. */}
          <h2
            className="text-2xl uppercase leading-none tracking-tight"
            style={{ fontFamily: 'var(--font-anton), Impact, sans-serif', transform: 'skewX(-4deg)' }}
          >
            {headingWord}{' '}
            <span style={{ color: '#a6e22e', textShadow: '0 0 12px rgba(166,226,46,0.4)' }}>
              Showdown
            </span>
          </h2>
          <p className="text-[11px] text-white/40 mt-1 uppercase tracking-widest">
            Ranked by effective dosing · not brand reputation
          </p>
        </div>
        <div className="shrink-0 pt-1">
          <MethodologyModal category={category === 'all' ? undefined : category} />
        </div>
      </div>

      {/* search */}
      <input
        type="text"
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="Search by product or brand…"
        className="w-full bg-lab-panel text-white border border-lab-border rounded-xl px-4 py-3 focus:outline-none focus:border-lab-lime transition-colors"
      />

      {/* filters row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Category filter (single-select dropdown — replaces the chip row to save space) */}
        <div className="relative">
          <button
            onClick={() => setCategoryPanelOpen((v) => !v)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-bold transition-colors ${
              category !== 'all'
                ? 'bg-lab-lime text-black border-lab-lime'
                : 'bg-lab-panel text-lab-muted border-lab-border hover:border-lab-lime hover:text-white'
            }`}
          >
            <span>{category !== 'all' ? categoryLabel(category) : 'Category'}</span>
            <span>{categoryPanelOpen ? '▴' : '▾'}</span>
          </button>
          {categoryPanelOpen && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-lab-panel-2 border border-lab-border rounded-xl shadow-xl p-3 min-w-[180px] max-h-64 overflow-y-auto">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] uppercase tracking-widest font-bold text-lab-muted">Filter category</span>
                {category !== 'all' && (
                  <button
                    onClick={() => { setCategory('all'); setCategoryPanelOpen(false) }}
                    className="text-[10px] text-lab-lime font-bold uppercase"
                  >
                    Clear
                  </button>
                )}
              </div>
              <button
                onClick={() => { setCategory('all'); setCategoryPanelOpen(false) }}
                className={`w-full text-left text-xs px-2 py-1.5 rounded-lg mb-0.5 font-bold transition-colors ${
                  category === 'all'
                    ? 'bg-lab-lime/20 text-lab-lime'
                    : 'text-white/70 hover:bg-lab-border/40 hover:text-white'
                }`}
              >
                {category === 'all' ? '✓ ' : ''}All
              </button>
              {activeCategories.map((c) => (
                <button
                  key={c.slug}
                  onClick={() => { setCategory(c.slug); setCategoryPanelOpen(false) }}
                  className={`w-full text-left text-xs px-2 py-1.5 rounded-lg mb-0.5 font-bold transition-colors ${
                    category === c.slug
                      ? 'bg-lab-lime/20 text-lab-lime'
                      : 'text-white/70 hover:bg-lab-border/40 hover:text-white'
                  }`}
                >
                  {category === c.slug ? '✓ ' : ''}{c.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Informed Sport toggle */}
        <button
          onClick={() => setIsOnly((v) => !v)}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-bold transition-colors ${
            isOnly
              ? 'bg-lab-lime text-black border-lab-lime'
              : 'bg-lab-panel text-lab-muted border-lab-border hover:border-lab-lime hover:text-white'
          }`}
        >
          <span>🛡️</span>
          <span>Informed Sport</span>
        </button>

        {/* Brand filter */}
        <div className="relative">
          <button
            onClick={() => setBrandPanelOpen((v) => !v)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-bold transition-colors ${
              brandFilter.size > 0
                ? 'bg-lab-lime text-black border-lab-lime'
                : 'bg-lab-panel text-lab-muted border-lab-border hover:border-lab-lime hover:text-white'
            }`}
          >
            <span>Brands {brandFilter.size > 0 ? `(${brandFilter.size})` : ''}</span>
            <span>{brandPanelOpen ? '▴' : '▾'}</span>
          </button>
          {brandPanelOpen && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-lab-panel-2 border border-lab-border rounded-xl shadow-xl p-3 min-w-[180px] max-h-64 overflow-y-auto">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] uppercase tracking-widest font-bold text-lab-muted">Filter brands</span>
                {brandFilter.size > 0 && (
                  <button
                    onClick={() => setBrandFilter(new Set())}
                    className="text-[10px] text-lab-lime font-bold uppercase"
                  >
                    Clear
                  </button>
                )}
              </div>
              {availableBrands.map((brand) => (
                <button
                  key={brand}
                  onClick={() => toggleBrand(brand)}
                  className={`w-full text-left text-xs px-2 py-1.5 rounded-lg mb-0.5 font-bold transition-colors ${
                    brandFilter.has(brand)
                      ? 'bg-lab-lime/20 text-lab-lime'
                      : 'text-white/70 hover:bg-lab-border/40 hover:text-white'
                  }`}
                >
                  {brandFilter.has(brand) ? '✓ ' : ''}{brand}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* contextual guide link */}
      {category !== 'all' && GUIDE_SLUGS.includes(category) && (
        <Link
          href={`/guide/${category}`}
          className="flex items-center gap-3 bg-lab-panel border border-lab-border rounded-xl px-4 py-3 hover:border-lab-lime transition-colors"
        >
          <span className="text-lg shrink-0">📖</span>
          <span className="text-sm text-white/90 min-w-0 flex-1">
            New to {categoryLabel(category).toLowerCase()}? Read our{' '}
            <span className="text-lab-lime font-bold">{categoryLabel(category)} buyer&apos;s guide</span>
          </span>
          <span className="text-lab-lime text-lg shrink-0">→</span>
        </Link>
      )}

      {/* sort + count */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-lab-muted text-xs uppercase tracking-widest font-bold shrink-0">
          {loading ? 'Loading…' : `${visible.length} product${visible.length === 1 ? '' : 's'}`}
        </span>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="bg-lab-panel text-white text-xs border border-lab-border rounded-lg px-3 py-1.5 focus:outline-none focus:border-lab-lime"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {visible.map((p, i) => {
          const isSel = selected.includes(p.id)
          const isTop = i === 0 && (sort === 'score' || sort === 'value' || sort === 'budget')
          const medal = MEDALS[i] ?? null
          const stacked = inStack(p.id)
          const benefits = CATEGORY_BENEFITS[p.category] ?? null
          const dosingNote = p.score != null
            ? p.score >= 70
              ? p.score >= 90 ? '· Excellent dosing' : '· Good dosing'
              : p.score >= 50
              ? '· Partially dosed'
              : '· Below effective dose'
            : ''
          const scoreFlag = benefits
            ? {
                color: p.score != null && p.score >= 70 ? '#a6e22e' : p.score != null && p.score >= 50 ? '#f5b342' : '#ff5c5c',
                text: benefits + (p.score != null ? ' ' + dosingNote : ''),
              }
            : p.score != null
            ? {
                color: p.score >= 70 ? '#a6e22e' : p.score >= 50 ? '#f5b342' : '#ff5c5c',
                text: p.score >= 70 ? (p.score >= 90 ? 'Excellent Effectiveness Match' : 'Strong Effectiveness Match') : p.score >= 50 ? 'Partial Effectiveness Match' : 'Below effective threshold',
              }
            : null

          return (
            <PointerCard
              key={p.id}
              className="p-4"
              style={isTop ? {
                borderColor: 'rgba(166,226,46,0.45)',
                boxShadow: '0 6px 30px rgba(0,0,0,0.5), 0 0 22px rgba(166,226,46,0.12), inset 0 1px 0 rgba(255,255,255,0.05)',
              } : isSel ? {
                borderColor: 'rgba(166,226,46,0.45)',
              } : {}}
            >
              {/* top row: pack shot left, score + fav right */}
              <div className="flex items-start gap-3">
                <Link href={`/products/${p.id}`} className="shrink-0 mt-0.5">
                  <ProductImage src={p.image_url} alt={`${p.brand} ${p.name}`} size={88} />
                </Link>

                <div className="min-w-0 flex-1">
                  {/* rank + brand */}
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {medal && <span className="text-sm leading-none">{medal}</span>}
                    <span
                      className="text-[11px] uppercase tracking-widest font-bold truncate"
                      style={{ color: '#2E8FE0', textShadow: '0 1px 2px rgba(0,0,0,0.7), 0 0 8px rgba(46,143,224,0.35)' }}
                    >{p.brand}</span>
                  </div>
                  {/* product name */}
                  <Link href={`/products/${p.id}`} className="hover:text-lab-lime transition-colors">
                    <p className="text-white text-sm font-black leading-tight">
                      {p.name} <span className="text-lab-lime text-xs">›</span>
                    </p>
                  </Link>

                  {/* badges */}
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className="text-[8px] uppercase tracking-widest font-semibold bg-lab-panel-2 text-lab-muted px-1.5 py-0.5 rounded-full">
                      {categoryLabel(p.category)}
                    </span>
                    {p.informed_sport && (
                      <span className="badge-is text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full border">
                        IS Certified
                      </span>
                    )}
                    {isTop && (
                      <span className="text-[10px] uppercase tracking-widest font-bold text-white/60 border border-white/15 px-2 py-0.5 rounded-full">
                        {topLabel}
                      </span>
                    )}
                  </div>
                </div>

                <div className="shrink-0 flex flex-col items-end gap-2">
                  <Link href={`/products/${p.id}`} className="shrink-0">
                    <ScoreBadge score={p.score} size="sm" />
                  </Link>
                  <FavouriteButton
                    productId={p.id}
                    favourited={favs.has(p.id)}
                    signedIn={signedIn}
                    onChange={(fav) => setFav(p.id, fav)}
                  />
                </div>
              </div>

              {/* 3 metrics mini-grid */}
              <div className="grid grid-cols-3 gap-1.5 mt-2">
                <div className="bg-black/30 rounded-md px-1.5 py-1 text-center">
                  <div className="text-[8px] text-lab-muted uppercase tracking-wide">Match</div>
                  <div className="text-xs font-bold text-white mt-0.5">
                    {p.score != null ? `${p.score}%` : '—'}
                  </div>
                </div>
                <div className="bg-black/30 rounded-md px-1.5 py-1 text-center">
                  <div className="text-[8px] text-lab-muted uppercase tracking-wide">True Cost / srv</div>
                  <div
                    className="mt-0.5"
                    title={trueCostReason(p) ?? undefined}
                    style={p.cost_per_serving != null ? { fontSize: '12px', fontWeight: 800, color: '#f2f2f2' } : { fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.35)' }}
                  >
                    {p.cost_per_serving != null ? `£${p.cost_per_serving.toFixed(2)}` : '—'}
                    {p.cost_per_serving == null && (
                      <span className="block text-[8px] normal-case tracking-normal leading-tight">{trueCostReason(p)}</span>
                    )}
                  </div>
                </div>
                <div className="bg-black/30 rounded-md px-1.5 py-1 text-center">
                  <div className="text-[8px] text-lab-muted uppercase tracking-wide">Retail</div>
                  <div className="mt-0.5" style={p.retail_price != null ? { fontSize: '12px', fontWeight: 800, color: '#f2f2f2' } : { fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.35)' }}>
                    {p.retail_price != null ? fmt(p.retail_price) : 'Pending'}
                  </div>
                </div>
              </div>

              {/* verdict flag */}
              {scoreFlag && (
                <div className="flex items-start gap-1.5 mt-3">
                  <span className="text-xs leading-none mt-0.5 shrink-0" style={{ color: scoreFlag.color }}>●</span>
                  <span className="text-[11px] text-gray-300 leading-snug">{scoreFlag.text}</span>
                </div>
              )}

              {/* reviews (F12): star rating + latest snippet, graceful empty state */}
              {(() => {
                const rs = reviewSummary[p.id]
                if (!rs || rs.count === 0) {
                  return (
                    <p className="text-[10px] text-lab-muted/40 mt-3 uppercase tracking-widest">
                      No reviews yet
                    </p>
                  )
                }
                return (
                  <div className="mt-3 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <MiniStars value={Math.round(rs.average)} />
                      <span className="text-[11px] font-bold text-white leading-none">{rs.average.toFixed(1)}</span>
                      <span className="text-[11px] text-lab-muted leading-none">
                        ({rs.count} review{rs.count === 1 ? '' : 's'})
                      </span>
                    </div>
                    {rs.latest && (
                      <p className="text-[11px] text-white/55 italic leading-snug truncate">
                        “{reviewSnippet(rs.latest)}”
                      </p>
                    )}
                  </div>
                )
              })()}

              {/* action row: stack + compare + buy */}
              <div className="grid grid-cols-3 gap-1.5 mt-2">
                <button
                  onClick={() => {
                    toggle({ id: p.id, name: p.name, brand: p.brand, category: p.category, score: p.score })
                    track(stacked ? 'remove_from_stack' : 'add_to_stack', { item_brand: p.brand, item_name: p.name })
                  }}
                  className={`text-center text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl border transition-colors ${
                    stacked
                      ? 'border-lab-lime text-lab-lime bg-lab-lime/10'
                      : 'border-lab-border text-lab-muted hover:text-white'
                  }`}
                >
                  {stacked ? '✓ Stack' : '+ Stack'}
                </button>
                <button
                  onClick={() => toggleSelect(p.id)}
                  disabled={!isSel && selected.length >= 3}
                  className={`text-center text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl border transition-colors disabled:opacity-30 ${
                    isSel
                      ? 'border-lab-lime text-lab-lime bg-lab-lime/10'
                      : 'border-lab-border text-lab-muted hover:text-white'
                  }`}
                >
                  {isSel ? 'Added ✓' : 'Compare'}
                </button>
                <a
                  href={buyLink(p.brand, p.name, p.buy_url)}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  onClick={() => track('buy_click', { item_brand: p.brand, item_name: p.name })}
                  className="text-center text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl transition-all"
                  style={isTop ? {
                    background: 'linear-gradient(145deg, color-mix(in srgb, #a6e22e 80%, #fff), #a6e22e 45%, color-mix(in srgb, #a6e22e 72%, #000))',
                    color: '#0d0d0d',
                    boxShadow: '0 0 12px rgba(166,226,46,0.4), inset 0 1px 0 rgba(255,255,255,0.3)',
                  } : {
                    background: 'rgba(255,255,255,0.06)',
                    color: '#a6e22e',
                    border: '1px solid rgba(166,226,46,0.5)',
                  }}
                >
                  Buy{isTop ? ' 🏆' : ''}
                </a>
              </div>
              <p className="text-[9px] text-lab-muted/40 text-right mt-1">affiliate link</p>
            </PointerCard>
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
