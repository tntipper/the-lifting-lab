// Brand-tier head-to-head helpers for the /brands-vs comparison pages.
//
// "[Brand A] vs [Brand B]" (e.g. "Bulk vs Myprotein", "Optimum Nutrition vs
// Myprotein") is a high-intent supplement search class that the product-level
// /vs pages do not serve. These helpers build a curated, deterministic set of
// brand-vs-brand pages from the live product set — no new data needed.
//
// Gating keeps it honest and crawl-friendly:
//  - only brands with >= MIN_PRODUCTS scored products qualify (no thin
//    one-product brands that would produce doorway pages),
//  - only the top MAX_BRANDS by catalogue size are cross-paired (avoids an
//    N-squared sprawl of duplicate-shape pages),
//  - each pair has exactly one canonical slug direction (alphabetical), so no
//    A-vs-B AND B-vs-A duplicates.
import type { ScoredProduct } from '@/lib/products'
import { brandSlug } from '@/lib/brands'

export type BrandStat = {
  brand: string
  slug: string
  count: number
  categories: string[]
  avgScore: number | null
  bestScore: number | null
  avgCostPerServing: number | null
  // products, score-sorted (desc), for per-category head-to-head on the page
  products: ScoredProduct[]
}

export type BrandMatchup = { slug: string; a: BrandStat; b: BrandStat }

// Minimum scored products for a brand to be eligible for a showdown page.
const MIN_PRODUCTS = 4
// Cap how many brands cross-pair: top N by catalogue size. C(10,2) = 45 pages.
const MAX_BRANDS = 10

/** Aggregate scored products into per-brand stats (score-sorted within brand). */
export function buildBrandStats(products: ScoredProduct[]): BrandStat[] {
  const byBrand = new Map<string, ScoredProduct[]>()
  for (const p of products) {
    if (!p.brand || !p.brand.trim()) continue
    const arr = byBrand.get(p.brand) || []
    arr.push(p)
    byBrand.set(p.brand, arr)
  }

  const stats: BrandStat[] = []
  for (const [brand, arr] of byBrand) {
    const sorted = [...arr].sort(
      (x, y) => (y.score ?? -1) - (x.score ?? -1) || x.name.localeCompare(y.name),
    )
    const scores = sorted.map((p) => p.score).filter((s): s is number => s != null)
    const costs = sorted
      .map((p) => p.cost_per_serving)
      .filter((c): c is number => c != null && c > 0)
    stats.push({
      brand,
      slug: brandSlug(brand),
      count: sorted.length,
      categories: Array.from(new Set(sorted.map((p) => p.category))),
      avgScore: scores.length
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null,
      bestScore: scores.length ? Math.max(...scores) : null,
      avgCostPerServing: costs.length
        ? Math.round((costs.reduce((a, b) => a + b, 0) / costs.length) * 100) / 100
        : null,
      products: sorted,
    })
  }
  return stats
}

/** Brands eligible for showdowns, ranked by catalogue size then name. */
export function qualifyingBrands(stats: BrandStat[]): BrandStat[] {
  return stats
    .filter((s) => s.count >= MIN_PRODUCTS)
    .sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand))
}

/**
 * Curated brand match-ups: cross-pair the top MAX_BRANDS qualifying brands,
 * one canonical (alphabetical-slug) direction per pair.
 */
export function curatedBrandMatchups(stats: BrandStat[]): BrandMatchup[] {
  const top = qualifyingBrands(stats).slice(0, MAX_BRANDS)
  const out: BrandMatchup[] = []
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      // canonical order by slug so the slug is direction-independent
      const [a, b] = [top[i], top[j]].sort((x, y) => x.slug.localeCompare(y.slug))
      out.push({ slug: `${a.slug}-vs-${b.slug}`, a, b })
    }
  }
  return out
}

/**
 * Resolve a `brand-a-vs-brand-b` slug back to two brand stats over the live set.
 * Tries every `-vs-` split point so brand slugs that contain a "vs" token still
 * resolve. Returns null if either side is unknown or both resolve identically.
 */
export function resolveBrandMatchup(
  matchup: string,
  stats: BrandStat[],
): [BrandStat, BrandStat] | null {
  const map = new Map<string, BrandStat>()
  for (const s of stats) if (!map.has(s.slug)) map.set(s.slug, s)
  let idx = matchup.indexOf('-vs-')
  while (idx !== -1) {
    const a = map.get(matchup.slice(0, idx))
    const b = map.get(matchup.slice(idx + 4))
    if (a && b && a.slug !== b.slug) return [a, b]
    idx = matchup.indexOf('-vs-', idx + 1)
  }
  return null
}
