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
}

export type ScoredProduct = Product & {
  score: number | null
  cost_per_serving: number | null
}

export type Nutrient = {
  nutrient_name: string
  amount: number
  unit: string
}

export type ComparedProduct = ScoredProduct & { nutrients: Nutrient[] }

export const PRODUCT_COLUMNS =
  'id, name, brand, category, serving_size, serving_unit, servings_per_container, image_url, informed_sport, retail_price'

export function withScore<T extends { brand: string; name: string; servings_per_container: number | null; retail_price: number | null }>(
  p: T,
): T & { score: number | null; cost_per_serving: number | null } {
  const score = scoreFor(p.brand, p.name)
  const cost_per_serving =
    p.retail_price != null && p.servings_per_container != null && p.servings_per_container > 0
      ? Math.round((p.retail_price / p.servings_per_container) * 100) / 100
      : null
  return { ...p, score, cost_per_serving }
}

export type SortKey = 'score' | 'name' | 'brand' | 'value' | 'budget'

export function sortScored(list: ScoredProduct[], sort: SortKey): ScoredProduct[] {
  const out = [...list]
  out.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name)
    if (sort === 'brand') return a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name)
    if (sort === 'value') {
      // Score per £ per serving — highest ratio first; unpriced last
      const va = a.score != null && a.cost_per_serving != null ? a.score / a.cost_per_serving : -1
      const vb = b.score != null && b.cost_per_serving != null ? b.score / b.cost_per_serving : -1
      return vb - va
    }
    if (sort === 'budget') {
      // Cheapest per serving among scored products; unpriced last
      const ca = a.cost_per_serving ?? Infinity
      const cb = b.cost_per_serving ?? Infinity
      return ca - cb
    }
    // default: score highest first, unscored last
    return (b.score ?? -1) - (a.score ?? -1)
  })
  return out
}
