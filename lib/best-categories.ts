// Shared helpers for the per-category "Best [Category] UK 2026" ranking pages
// (/best/[category]). These are the canonical affiliate-listicle surface: a
// static, schema-rich "Top N ranked" page per category — distinct from the
// /best hub (one winner per category), /guide/[category] (how-to-choose
// education) and the interactive /products grid.
import { createPublicClient } from '@/lib/supabase-public'
import { PRODUCT_COLUMNS, hasVerifiedCost, withScore, type Product, type ScoredProduct } from '@/lib/products'
import { CATEGORIES } from '@/lib/categories'

// Minimum scored products in a category to publish a credible "Top N" ranking.
// Below this we do not publish a ranking page (avoids thin/doorway content);
// the category still lives on /products and, where present, /guide.
export const MIN_RANKED = 5

// How many products to show in the ranked list.
export const TOP_N = 10

// Top scored products for one category, score desc (then name for stability),
// unscored dropped. DB-failure safe: returns [] so the page renders notFound
// rather than a 500.
export async function rankedProducts(category: string): Promise<ScoredProduct[]> {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('status', 'active')
      .eq('category', category)
    if (error || !data) return []
    return (data as Product[])
      .map(withScore)
      .filter((p) => p.score != null)
      .sort(
        (a, b) =>
          (b.score as number) - (a.score as number) || a.name.localeCompare(b.name),
      )
  } catch {
    return []
  }
}

// All known category slugs with enough scored products to rank, in CATEGORIES
// (browse-nav) order. Used by generateStaticParams + the sitemap so both stay
// in lockstep with the live catalogue. DB-failure safe: returns [].
export async function rankedCategorySlugs(): Promise<string[]> {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('status', 'active')
    if (error || !data) return []
    const counts = new Map<string, number>()
    for (const p of (data as Product[]).map(withScore)) {
      if (p.score == null) continue
      counts.set(p.category, (counts.get(p.category) ?? 0) + 1)
    }
    return CATEGORIES.map((c) => c.slug).filter((s) => (counts.get(s) ?? 0) >= MIN_RANKED)
  } catch {
    return []
  }
}

export type CategoryAwards = {
  bestOverall: ScoredProduct | null
  bestValue: ScoredProduct | null
  bestBudget: ScoredProduct | null
}

// Derive the three award picks from a score-sorted ranking. Value/budget are
// gated to score >= 50 and require real cost-per-serving data, so a cheap-but-
// underdosed tub never wins "best value" or "best budget".
export function deriveAwards(ranked: ScoredProduct[]): CategoryAwards {
  const bestOverall = ranked[0] ?? null
  const priced = ranked.filter(
    // hasVerifiedCost excludes null AND non-positive costs (TLL-P0-3).
    (p) => (p.score ?? 0) >= 50 && hasVerifiedCost(p),
  )
  const bestValue = priced.length
    ? priced.reduce((a, b) =>
        (b.score as number) / (b.cost_per_serving as number) >
        (a.score as number) / (a.cost_per_serving as number)
          ? b
          : a,
      )
    : null
  const bestBudget = priced.length
    ? priced.reduce((a, b) =>
        (b.cost_per_serving as number) < (a.cost_per_serving as number) ? b : a,
      )
    : null
  return { bestOverall, bestValue, bestBudget }
}
