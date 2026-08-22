// Cheapest-per-serving rankings — the price-ascending complement to /value.
//
// /value ranks by True Cost as effectiveness-per-pound and surfaces the single
// best-value winner in each category. /best ranks by Effectiveness Match score.
// Neither answers the literal, high-intent query "what is the cheapest [category]
// UK?" with a full ranked list. This module ranks every credibly-scored, priced
// product by absolute cost per serving, cheapest first — while still gating to a
// passing Effectiveness Match, so a dirt-cheap but under-dosed tub can never top
// the list. The result is an honest "cheapest that still works" ranking.
import { PRODUCT_COLUMNS, hasVerifiedCost, withScore, type Product, type ScoredProduct } from '@/lib/products'
import { createPublicClient } from '@/lib/supabase-public'

// A product must clear our pass bar before it can rank on price. Cheap means
// nothing if the dose does not work, so we never list an under-dosed product as
// "cheapest" without that guard (mirrors the /value MIN_SCORE gate).
export const MIN_SCORE = 50

export type CheapProduct = ScoredProduct & { cost_per_serving: number; score: number }

/**
 * Rank a product set by cost per serving, cheapest first. Keeps only products
 * that both clear the pass bar and carry the price/servings data needed for an
 * honest per-serving figure. Products missing servings_per_container (so no
 * cost_per_serving) are skipped rather than guessed at.
 */
export function rankCheapest(products: Product[]): CheapProduct[] {
  const rows = products
    .map(withScore)
    .flatMap((p) =>
      p.score != null &&
      p.score >= MIN_SCORE &&
      hasVerifiedCost(p)
        ? [{ ...p, score: p.score, cost_per_serving: p.cost_per_serving }]
        : [],
    )
  rows.sort((a, b) => a.cost_per_serving - b.cost_per_serving)
  return rows
}

/**
 * Fetch active products and return them ranked cheapest per serving first.
 * DB-failure safe: returns an empty array so the page renders its graceful
 * empty state rather than a 500. Mirrors the /value + /protein-value fetch.
 */
export async function fetchCheapest(): Promise<CheapProduct[]> {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('status', 'active')
    if (error || !data) return []
    return rankCheapest(data as Product[])
  } catch {
    return []
  }
}
