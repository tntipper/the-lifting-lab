// Server-side product data fetchers shared by the /products, /products/[id]
// and /compare pages (and reusable by the API routes).
//
// These run in React Server Components so the real product content — name,
// brand, score, true cost, serving info, nutrients, buy link, image — lands in
// the initial HTML response. Crawlers and no-JS / in-app-browser users must
// never see a "Loading…" shell for these commercial pages.
//
// Every helper is DB-failure safe: a Supabase error degrades to an empty list
// or null rather than a 500. Scores are attached via the existing withScore()
// helper — the scoring formula itself is untouched here.
import { createPublicClient } from '@/lib/supabase-public'
import {
  PRODUCT_COLUMNS,
  withScore,
  sortScored,
  type Product,
  type ScoredProduct,
  type Nutrient,
  type ComparedProduct,
} from '@/lib/products'

type NutrientRow = Nutrient & { product_id: string }

/** Full active catalogue, score-desc. Backs the /products grid + ItemList schema. */
export async function fetchCatalogue(): Promise<ScoredProduct[]> {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('status', 'active')
    if (error || !data) return []
    const products = data as Product[]
    const ids = products.map((p) => p.id)
    const { data: nutrients } = ids.length
      ? await sb
          .from('product_nutrients')
          .select('product_id, nutrient_name, amount, unit')
          .in('product_id', ids)
      : { data: [] as NutrientRow[] }
    const rows = (nutrients as NutrientRow[] | null) ?? []
    const byId = new Map<string, Nutrient[]>()
    for (const n of rows) {
      const list = byId.get(n.product_id) ?? []
      list.push({ nutrient_name: n.nutrient_name, amount: n.amount, unit: n.unit })
      byId.set(n.product_id, list)
    }
    return sortScored(
      products.map((p) => ({ ...withScore(p), nutrients: byId.get(p.id) ?? [] })),
      'score',
    )
  } catch {
    return []
  }
}

/** Active products in one category, score-desc (RelatedProducts module). */
export async function fetchCategory(category: string): Promise<ScoredProduct[]> {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('status', 'active')
      .eq('category', category)
    if (error || !data) return []
    return sortScored((data as Product[]).map(withScore), 'score')
  } catch {
    return []
  }
}

/** One active product with its full nutrient label, or null if not found. */
export async function fetchProductDetail(id: string): Promise<ComparedProduct | null> {
  try {
    const sb = createPublicClient()
    const { data: product, error } = await sb
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('id', id)
      .eq('status', 'active')
      .maybeSingle()
    if (error || !product) return null

    const { data: nutrients } = await sb
      .from('product_nutrients')
      .select('nutrient_name, amount, unit')
      .eq('product_id', id)
      .order('nutrient_name')

    return { ...withScore(product as Product), nutrients: (nutrients as Nutrient[] | null) ?? [] }
  } catch {
    return null
  }
}

/** Parse a `?ids=a,b,c` value into at most 3 trimmed, non-empty ids. */
export function parseCompareIds(raw: string | string[] | undefined): string[] {
  const value = Array.isArray(raw) ? raw[0] ?? '' : raw ?? ''
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3)
}

/** Up to 3 products with nutrients, in the requested order (the /compare page). */
export async function fetchCompareProducts(ids: string[]): Promise<ComparedProduct[]> {
  if (!ids.length) return []
  try {
    const sb = createPublicClient()
    const { data: products, error } = await sb
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('status', 'active')
      .in('id', ids)
    if (error || !products) return []

    const { data: nutrients } = await sb
      .from('product_nutrients')
      .select('product_id, nutrient_name, amount, unit')
      .in('product_id', ids)
    const nutrientRows = (nutrients as NutrientRow[] | null) ?? []

    const result: ComparedProduct[] = (products as Product[]).map((p) => ({
      ...withScore(p),
      nutrients: nutrientRows
        .filter((n) => n.product_id === p.id)
        .map(({ nutrient_name, amount, unit }) => ({ nutrient_name, amount, unit })),
    }))
    result.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
    return result
  } catch {
    return []
  }
}
