import { hasPositiveServingCost } from './assessment-display'
// Listed price per known serving only. This is not an effectiveness, equivalent-dose
// or approved-offer comparison. Delivery and checkout costs are excluded.
import { PRODUCT_COLUMNS, withScore, type Product, type ScoredProduct } from '@/lib/products'
import { createPublicClient } from '@/lib/supabase-public'

export type CheapProduct = ScoredProduct & { cost_per_serving: number }

/** Order positive finite listed serving costs, independently of historical scores. */
export function rankCheapest(products: Product[]): CheapProduct[] {
  const rows = products
    .map(withScore)
    .flatMap((p) =>
      hasPositiveServingCost(p)
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
