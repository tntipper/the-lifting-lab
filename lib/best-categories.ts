// Shared helpers for the per-category "Best [Category] UK 2026" ranking pages
// (/best/[category]). These are the canonical affiliate-listicle surface: a
// static, schema-rich "Top N ranked" page per category — distinct from the
// /best hub (one winner per category), /guide/[category] (how-to-choose
// education) and the interactive /products grid.
import { createPublicClient } from '@/lib/supabase-public'
import { PRODUCT_COLUMNS, withScore, type Product, type ScoredProduct } from '@/lib/products'
import { hasApprovedAssessment, hasPositiveServingCost } from './assessment-display'
import { CATEGORIES } from '@/lib/categories'

// Minimum scored products in a category to publish a credible "Top N" ranking.
// Below this we do not publish a ranking page (avoids thin/doorway content);
// the category still lives on /products and, where present, /guide.
export const MIN_RANKED = 5

// How many products to show in the ranked list.
export const TOP_N = 10

// Preserve all records in stable research order, independent of approval.
export async function categoryResearchProducts(category: string): Promise<ScoredProduct[]> {
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
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  } catch {
    return []
  }
}

export async function rankedProducts(category: string): Promise<ScoredProduct[]> {
  return (await categoryResearchProducts(category)).filter(hasApprovedAssessment)
}

// The former rankings now preserve every known category as a research route.
export async function researchCategorySlugs(): Promise<string[]> {
  return CATEGORIES.map(category => category.slug)
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
  const eligible = ranked.filter(hasApprovedAssessment)
  const bestOverall = eligible[0] ?? null
  const priced = eligible.filter(
    (p) => p.score >= 50 && hasPositiveServingCost(p),
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
