// Head-to-head matchup helpers for the /vs comparison pages.
//
// "[Product A] vs [Product B]" is one of the highest-intent affiliate search
// classes, but the interactive /compare page produces no crawlable URLs. These
// helpers build a curated, deterministic set of static matchup pages from the
// top-scoring products in each category — no new data needed, and no
// combinatorial explosion / duplicate-content sprawl.
import { brandSlug } from '@/lib/brands'

/**
 * Stable, URL-safe slug for a single product from its brand + name.
 * "Optimum Nutrition" / "Gold Standard 100% Whey"
 *   -> "optimum-nutrition-gold-standard-100-whey"
 */
export function productSlug(brand: string | null | undefined, name: string): string {
  const b = brand ? brandSlug(brand) : ''
  const n = name
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return b ? `${b}-${n}` : n
}

/** Canonical matchup slug joining two product slugs with `-vs-`. */
export function matchupSlug(
  aBrand: string | null | undefined,
  aName: string,
  bBrand: string | null | undefined,
  bName: string,
): string {
  return `${productSlug(aBrand, aName)}-vs-${productSlug(bBrand, bName)}`
}

export type MatchupProduct = {
  id: string
  name: string
  brand: string
  category: string
  score: number | null
}

export type Matchup<T> = { slug: string; a: T; b: T; category: string }

// How many top products per category to cross-pair. 5 -> up to 10 pages/category.
const TOP_PER_CATEGORY = 5

/**
 * Build the curated matchup set: within each category, take the top
 * TOP_PER_CATEGORY scored products and produce every unique pairing, in a
 * deterministic order (score desc, then name) so each pair has exactly one
 * canonical direction (no A-vs-B AND B-vs-A duplicates).
 */
export function curatedMatchups<T extends MatchupProduct>(products: T[]): Matchup<T>[] {
  const byCat = new Map<string, T[]>()
  for (const p of products) {
    if (p.score == null) continue
    const arr = byCat.get(p.category) || []
    arr.push(p)
    byCat.set(p.category, arr)
  }

  const out: Matchup<T>[] = []
  const seen = new Set<string>()
  for (const [category, arr] of byCat) {
    // Sort by score (then name), then dedupe by product slug before taking the
    // top N. Two *different* SKUs that slugify identically (e.g. duplicate
    // "Warrior Creatine Monohydrate" rows) would otherwise cross-pair into a
    // `x-vs-x` matchup slug. resolveMatchup keys products by slug, so it maps
    // both sides back to the same product, fails its `a !== b` guard, and the
    // page 404s — and the bad URL also leaks into the sitemap. Keeping only the
    // first (highest-scoring) product per slug removes the collision at source.
    const sorted = [...arr].sort(
      (x, y) => (y.score as number) - (x.score as number) || x.name.localeCompare(y.name),
    )
    const bySlug = new Map<string, T>()
    for (const p of sorted) {
      const s = productSlug(p.brand, p.name)
      if (!bySlug.has(s)) bySlug.set(s, p)
    }
    const top = Array.from(bySlug.values()).slice(0, TOP_PER_CATEGORY)
    for (let i = 0; i < top.length; i++) {
      for (let j = i + 1; j < top.length; j++) {
        const a = top[i]
        const b = top[j]
        if (a.id === b.id) continue // defensive: never pair a product with itself
        const slug = matchupSlug(a.brand, a.name, b.brand, b.name)
        if (seen.has(slug)) continue
        seen.add(slug)
        out.push({ slug, a, b, category })
      }
    }
  }
  return out
}

/**
 * Resolve a matchup slug back to its two products over the live product set.
 * Tries every `-vs-` split point so product slugs that happen to contain a
 * "vs" token still resolve. Returns null if either side is unknown.
 */
export function resolveMatchup<T extends { brand: string | null; name: string }>(
  matchup: string,
  products: T[],
): [T, T] | null {
  const map = new Map<string, T>()
  for (const p of products) {
    const s = productSlug(p.brand, p.name)
    if (!map.has(s)) map.set(s, p)
  }
  let idx = matchup.indexOf('-vs-')
  while (idx !== -1) {
    const a = map.get(matchup.slice(0, idx))
    const b = map.get(matchup.slice(idx + 4))
    if (a && b && a !== b) return [a, b]
    idx = matchup.indexOf('-vs-', idx + 1)
  }
  return null
}
