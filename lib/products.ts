// Shared product types + score attachment for the browse/compare features.
import { scoreFor } from '@/lib/scores'

export type Product = {
  id: string
  name: string
  brand: string
  category: string
  serving_size: number | null
  serving_unit: string | null
  servings_per_container: number | null
  image_url: string | null
  informed_sport: boolean | null
  retail_price: number | null
  buy_url: string | null
  proprietary_blend: boolean | null
  amino_spiked: boolean | null
  protein_yield: number | null
}

export type ScoredProduct = Product & {
  score: number | null
  cost_per_serving: number | null
  nutrients?: Nutrient[]
}

export type Nutrient = {
  nutrient_name: string
  amount: number
  unit: string
}

export type ComparedProduct = ScoredProduct & { nutrients: Nutrient[] }

export const PRODUCT_COLUMNS =
  'id, name, brand, category, serving_size, serving_unit, servings_per_container, image_url, informed_sport, retail_price, buy_url, proprietary_blend, amino_spiked, protein_yield'

export function withScore<T extends { brand: string; name: string; servings_per_container: number | null; retail_price: number | null }>(
  p: T,
): T & { score: number | null; cost_per_serving: number | null } {
  const score = scoreFor(p.brand, p.name)
  // cost_per_serving is only derived when BOTH inputs are real, positive
  // figures. A missing or £0 retail price, or a missing/zero servings count,
  // yields null — never 0 — so an incomplete record can never be ranked as
  // "cheapest" or "best value" (TLL-P0-3).
  const raw =
    p.retail_price != null &&
    p.retail_price > 0 &&
    p.servings_per_container != null &&
    p.servings_per_container > 0
      ? Math.round((p.retail_price / p.servings_per_container) * 100) / 100
      : null
  const cost_per_serving = raw != null && raw > 0 ? raw : null
  return { ...p, score, cost_per_serving }
}

/**
 * True only when a product carries a verified, positive cost-per-serving figure
 * derived from real price + servings data. Every cost-based ranking, award or
 * "best value" badge must gate on this (TLL-P0-3): products without it are
 * excluded from the ranking (or badged unverified), never treated as £0.
 */
export function hasVerifiedCost<T extends { cost_per_serving: number | null }>(
  p: T,
): p is T & { cost_per_serving: number } {
  return p.cost_per_serving != null && Number.isFinite(p.cost_per_serving) && p.cost_per_serving > 0
}

/** Label shown wherever a product's per-serving cost is missing or unverified. */
export const UNVERIFIED_COST_LABEL = 'Price unverified'

export type SortKey = 'score' | 'name' | 'brand' | 'value' | 'budget'

export function sortScored(list: ScoredProduct[], sort: SortKey): ScoredProduct[] {
  const out = [...list]
  out.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name)
    if (sort === 'brand') return a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name)
    if (sort === 'value') {
      // Score per £ per serving — highest ratio first; unverified cost last
      const va = a.score != null && hasVerifiedCost(a) ? a.score / a.cost_per_serving : -1
      const vb = b.score != null && hasVerifiedCost(b) ? b.score / b.cost_per_serving : -1
      return vb - va
    }
    if (sort === 'budget') {
      // Cheapest per serving among verified-cost products; unverified last
      const ca = hasVerifiedCost(a) ? a.cost_per_serving : Infinity
      const cb = hasVerifiedCost(b) ? b.cost_per_serving : Infinity
      return ca - cb
    }
    // default: score highest first, unscored last
    return (b.score ?? -1) - (a.score ?? -1)
  })
  return out
}

// Why True Cost (£/serving) can't be computed for a product. Used to render an
// honest "—" with a stated reason instead of a fabricated number.
export function trueCostReason(p: {
  retail_price: number | null
  servings_per_container: number | null
}): string | null {
  // Mirrors withScore(): a price must be a real positive figure to count.
  const priceOk = p.retail_price != null && p.retail_price > 0
  const servingsOk = p.servings_per_container != null && p.servings_per_container > 0
  if (priceOk && servingsOk) return null
  if (!priceOk && !servingsOk) return 'no verified retail price or servings on file'
  if (!priceOk) return 'no verified retail price on file'
  return 'servings per container unknown'
}
