// Shared product types + score attachment for the browse/compare features.
import { scoreFor } from '@/lib/scores'
import { hasPositiveServingCost, isRankingCandidate } from './assessment-display'

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
  const cost_per_serving =
    typeof p.retail_price === 'number' && Number.isFinite(p.retail_price) && p.retail_price > 0
      && typeof p.servings_per_container === 'number' && Number.isFinite(p.servings_per_container) && p.servings_per_container > 0
      ? p.retail_price / p.servings_per_container
      : null
  return { ...p, score, cost_per_serving: cost_per_serving !== null && Number.isFinite(cost_per_serving) && cost_per_serving > 0 ? cost_per_serving : null }
}

export type SortKey = 'score' | 'name' | 'brand' | 'value' | 'budget' | 'price'

export function sortScored(list: ScoredProduct[], sort: SortKey): ScoredProduct[] {
  const out = [...list]
  out.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name)
    if (sort === 'brand') return a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name)
    if (sort !== 'price' && sort !== 'budget') {
      const eligibility = Number(isRankingCandidate(b, sort)) - Number(isRankingCandidate(a, sort))
      if (eligibility) return eligibility
      // Research records stay visible, but are not ordered as recommendations.
      if (!isRankingCandidate(a, sort)) return a.name.localeCompare(b.name)
    }
    if (sort === 'value') {
      // Score per £ per serving — highest ratio first; unpriced last
      const va = a.score! / a.cost_per_serving!
      const vb = b.score! / b.cost_per_serving!
      return vb - va
    }
    if (sort === 'budget' || sort === 'price') {
      // Listed price per known serving only; no scientific or offer approval.
      const ca = hasPositiveServingCost(a) ? a.cost_per_serving : Infinity
      const cb = hasPositiveServingCost(b) ? b.cost_per_serving : Infinity
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
  if (typeof p.retail_price === 'number' && Number.isFinite(p.retail_price) && p.retail_price > 0
    && typeof p.servings_per_container === 'number' && Number.isFinite(p.servings_per_container) && p.servings_per_container > 0) return null
  if (p.retail_price == null && (p.servings_per_container == null || p.servings_per_container <= 0)) {
    return 'no retail price or servings on file'
  }
  if (p.retail_price == null) return 'no retail price on file'
  return 'usable positive price or serving count unavailable'
}

// Retain the unrounded ratio for ordering/API data. Only the presentation rounds.
export function formatListedServingPrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'Unavailable'
  return value < 0.01 ? '<£0.01' : `£${value.toFixed(2)}`
}
