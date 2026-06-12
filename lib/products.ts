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
}

export type ScoredProduct = Product & { score: number | null }

export type Nutrient = {
  nutrient_name: string
  amount: number
  unit: string
}

export type ComparedProduct = ScoredProduct & { nutrients: Nutrient[] }

export const PRODUCT_COLUMNS =
  'id, name, brand, category, serving_size, serving_unit, servings_per_container, image_url, informed_sport'

export function withScore<T extends { brand: string; name: string }>(p: T): T & { score: number | null } {
  return { ...p, score: scoreFor(p.brand, p.name) }
}

export type SortKey = 'score' | 'name' | 'brand'

export function sortScored(list: ScoredProduct[], sort: SortKey): ScoredProduct[] {
  const out = [...list]
  out.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name)
    if (sort === 'brand') return a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name)
    // score: highest first, unscored last
    return (b.score ?? -1) - (a.score ?? -1)
  })
  return out
}
