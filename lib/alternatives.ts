// "[Product] alternatives" is one of the highest-intent affiliate search
// classes ("Myprotein Impact Whey alternatives", "cheaper alternative to
// Optimum Nutrition"), but the site had no crawlable landing page for it — only
// a client-side Related module on the product detail page. These helpers build a
// curated, deterministic set of static alternatives pages from the top-scoring
// products in each category, reusing the same product slug + score/value logic
// as the /vs matchup pages. No new data needed.
import { productSlug } from '@/lib/matchups'
import { hasVerifiedCost } from '@/lib/products'

// How many products per category get their own alternatives page (the curated,
// pre-rendered + sitemap-indexed subset). Keeps the surface to products people
// actually search "X alternatives" for, not a doorway page per SKU.
export const TARGETS_PER_CATEGORY = 8

// A page only publishes when the target has at least this many same-category
// alternatives, so every page has genuine content (never a thin doorway).
export const MIN_ALTERNATIVES = 3

// How many alternatives to surface per section on a page.
export const MAX_SHOWN = 6

export type AltProduct = {
  id: string
  brand: string
  name: string
  category: string
  score: number | null
  cost_per_serving: number | null
}

/** Value ratio: Effectiveness Match per £ per serving. null when uncomputable. */
export function valueRatio(p: {
  score: number | null
  cost_per_serving: number | null
}): number | null {
  // Unverified (missing/£0) cost never yields a value ratio (TLL-P0-3).
  if (p.score == null || !hasVerifiedCost(p)) return null
  return p.score / p.cost_per_serving
}

/**
 * Same-category alternatives to `target`, deduped by product slug, score-desc.
 * The target itself is excluded (by id and by slug, so a duplicate SKU that
 * slugifies identically can't reappear as its own alternative).
 */
export function alternativesFor<T extends AltProduct>(target: T, all: T[]): T[] {
  const targetSlug = productSlug(target.brand, target.name)
  const seen = new Set<string>([targetSlug])
  const sorted = all
    .filter((p) => p.category === target.category && p.id !== target.id && p.score != null)
    .sort((a, b) => (b.score as number) - (a.score as number) || a.name.localeCompare(b.name))
  const out: T[] = []
  for (const p of sorted) {
    const s = productSlug(p.brand, p.name)
    if (seen.has(s)) continue
    seen.add(s)
    out.push(p)
  }
  return out
}

/**
 * The curated set of products that get a pre-rendered + sitemap-indexed
 * alternatives page: the top TARGETS_PER_CATEGORY scored products in each
 * category that also have >= MIN_ALTERNATIVES alternatives. Pages for any other
 * product still render on demand (dynamicParams), they're just not pre-listed.
 */
export function curatedAlternativeTargets<T extends AltProduct>(all: T[]): T[] {
  const byCat = new Map<string, T[]>()
  for (const p of all) {
    if (p.score == null) continue
    const arr = byCat.get(p.category) || []
    arr.push(p)
    byCat.set(p.category, arr)
  }
  const out: T[] = []
  const seenSlug = new Set<string>()
  for (const [, arr] of byCat) {
    const sorted = [...arr].sort(
      (a, b) => (b.score as number) - (a.score as number) || a.name.localeCompare(b.name),
    )
    // Dedupe by slug within the category before taking the top N, so two SKUs
    // that slugify identically don't both claim a page (same collision guard as
    // curatedMatchups).
    const bySlug = new Map<string, T>()
    for (const p of sorted) {
      const s = productSlug(p.brand, p.name)
      if (!bySlug.has(s)) bySlug.set(s, p)
    }
    const top = Array.from(bySlug.values()).slice(0, TARGETS_PER_CATEGORY)
    for (const t of top) {
      if (alternativesFor(t, arr).length < MIN_ALTERNATIVES) continue
      const gs = productSlug(t.brand, t.name)
      if (seenSlug.has(gs)) continue
      seenSlug.add(gs)
      out.push(t)
    }
  }
  return out
}

/** Resolve a product slug back to a product over the live set. */
export function resolveAlternativeTarget<T extends { brand: string; name: string }>(
  slug: string,
  all: T[],
): T | null {
  for (const p of all) {
    if (productSlug(p.brand, p.name) === slug) return p
  }
  return null
}
