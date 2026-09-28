'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CATEGORY_GROUPS } from '@/lib/category-groups'
import { formatListedServingPrice, type ScoredProduct } from '@/lib/products'

type GroupStats = { count: number; lowestServingCost: number | null }
type CategoryGridProps = { products?: ScoredProduct[]; variant?: 'full' | 'compact' }
const EMPTY_PRODUCTS: ScoredProduct[] = []

const COMPACT_CATEGORIES = [
  { slug: 'protein', label: 'Protein', href: '/products?group=protein', categories: ['whey', 'whey-isolate', 'casein'] },
  { slug: 'creatine', label: 'Creatine', href: '/products?category=creatine', categories: ['creatine'] },
  { slug: 'pre-workout', label: 'Pre-workout', href: '/products?category=pre-workout', categories: ['pre-workout'] },
  { slug: 'hydration', label: 'Hydration', href: '/products?category=hydration', categories: ['hydration'] },
  { slug: 'bars', label: 'Bars', href: '/products?category=protein-bar', categories: ['protein-bar'] },
  {
    slug: 'health',
    label: 'Health',
    href: '/products?group=wellbeing',
    categories: CATEGORY_GROUPS.find((group) => group.slug === 'wellbeing')?.categories ?? [],
  },
] as const

function statsFor(products: ScoredProduct[], categories: readonly string[]): GroupStats {
  const matches = products.filter((product) => categories.includes(product.category))
  const servingCosts = matches
    .map((product) => product.cost_per_serving)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)

  return {
    count: matches.length,
    lowestServingCost: servingCosts.length > 0 ? Math.min(...servingCosts) : null,
  }
}

function TileCard({ group, stats }: { group: (typeof CATEGORY_GROUPS)[0]; stats: GroupStats | undefined }) {
  return (
    <Link href={`/products?group=${group.slug}`} className="group flex min-h-36 flex-col justify-between rounded-xl border border-lab-border bg-lab-panel p-4 transition-colors hover:border-[#7c7e72]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="tll-display text-[26px] leading-7 text-white">{group.label}</p>
          <p className="mt-2 text-sm leading-5 text-lab-muted">{group.tagline}</p>
        </div>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 shrink-0" style={{ stroke: group.accent, strokeWidth: '1.5' }} dangerouslySetInnerHTML={{ __html: group.iconSvg }} />
      </div>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-lab-border pt-3 text-xs text-lab-muted">
        <span>{stats ? `${stats.count} listed` : 'Loading…'}</span>
        <span className="font-semibold text-lab-lime group-hover:underline">Explore →</span>
      </div>
    </Link>
  )
}

function GuideTile() {
  return (
    <Link href="/guide" className="group flex min-h-36 flex-col justify-between rounded-xl border border-lab-border bg-lab-panel p-4 transition-colors hover:border-[#7c7e72]">
      <div>
        <p className="tll-display text-[26px] leading-7 text-white">Guides</p>
        <p className="mt-2 text-sm leading-5 text-lab-muted">How to research supplements with confidence.</p>
      </div>
      <span className="mt-5 border-t border-lab-border pt-3 text-xs font-semibold text-lab-lime group-hover:underline">Read guides →</span>
    </Link>
  )
}

function LiftAppTile() {
  return (
    <a href="https://trylift.app" target="_blank" rel="noopener noreferrer" className="group flex min-h-36 flex-col justify-between rounded-xl border border-lab-border bg-lab-panel p-4 transition-colors hover:border-[#7c7e72]">
      <div>
        <p className="tll-display text-[26px] leading-7 text-white">LIFT App</p>
        <p className="mt-2 text-sm leading-5 text-lab-muted">Free iPhone beta for training, nutrition and recovery.</p>
      </div>
      <span className="mt-5 border-t border-lab-border pt-3 text-xs font-semibold text-lab-lime group-hover:underline">Get the app ↗</span>
    </a>
  )
}

export default function CategoryGrid({ products: suppliedProducts, variant = 'full' }: CategoryGridProps) {
  const initialProducts = suppliedProducts ?? EMPTY_PRODUCTS
  const [products, setProducts] = useState(initialProducts)

  useEffect(() => {
    if (initialProducts.length > 0) {
      setProducts(initialProducts)
      return
    }

    fetch('/api/products?sort=score')
      .then((response) => response.json())
      .then((catalogue: ScoredProduct[]) => setProducts(catalogue))
      .catch(() => {})
  }, [suppliedProducts, initialProducts])

  const fullStats = useMemo(() => Object.fromEntries(
    CATEGORY_GROUPS.map((group) => [group.slug, statsFor(products, group.categories)]),
  ) as Record<string, GroupStats>, [products])

  if (variant === 'compact') {
    return (
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        {COMPACT_CATEGORIES.map((category) => {
          const stats = statsFor(products, category.categories)
          const countLabel = `${stats.count} ${stats.count === 1 ? 'product' : 'products'}`
          const priceLabel = stats.lowestServingCost !== null ? ` · from ${formatListedServingPrice(stats.lowestServingCost)}` : ''

          return (
            <Link key={category.slug} href={category.href} className="group flex min-h-[76px] flex-col justify-center rounded-xl border border-[#ddddd3] bg-white px-3.5 py-3 text-[#12120f] transition-colors hover:border-[#77786d] sm:min-h-[82px] sm:px-4">
              <span className="tll-display text-[21px] leading-none sm:text-[24px]">{category.label}</span>
              <span className="mt-2 text-[11px] leading-none text-[#62645a] sm:text-xs">{countLabel}{priceLabel}</span>
            </Link>
          )
        })}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {CATEGORY_GROUPS.map((group) => <TileCard key={group.slug} group={group} stats={fullStats[group.slug]} />)}
      <GuideTile />
      <LiftAppTile />
    </div>
  )
}
