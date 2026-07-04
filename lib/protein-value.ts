// Cost-per-gram-of-protein rankings for protein powders.
//
// The site already ranks generic value on /value (Effectiveness Match per £ per
// serving). That metric does NOT answer the single question protein buyers
// actually search — "which protein is cheapest per gram of protein?" — because a
// cheap-per-serving tub can still be poor value if each serving is under-dosed on
// actual protein. This module derives the true per-gram-of-protein cost.
//
// Only powder categories carry a protein_yield (% protein by weight) plus the
// serving/container data needed to compute grams of protein. Bars, meal
// replacements and EAAs are excluded — they either lack a protein_yield or are
// not bought on a price-per-gram-of-protein basis.
import { PRODUCT_COLUMNS, withScore, type Product } from '@/lib/products'
import { createPublicClient } from '@/lib/supabase-public'

export const PROTEIN_CATEGORIES = ['whey', 'whey-isolate', 'casein'] as const
export type ProteinCategory = (typeof PROTEIN_CATEGORIES)[number]

export type ProteinValueRow = {
  id: string
  name: string
  brand: string
  category: string
  score: number | null
  proteinPerServing: number // grams of protein per serving
  totalProtein: number // grams of protein per container
  costPerGram: number // £ per gram of protein (headline metric)
  costPer30g: number // £ per 30 g reference protein dose
  retail_price: number
  buy_url: string | null
}

// Sanity bounds guard against malformed data (e.g. a serving_size stored as a
// scoop count rather than grams) producing absurd rankings. A real protein
// serving is ~10-60 g of protein and a UK powder realistically costs well under
// £0.20 per gram of protein.
const MIN_PROTEIN_PER_SERVING = 5
const MAX_PROTEIN_PER_SERVING = 60
const MIN_COST_PER_GRAM = 0.005
const MAX_COST_PER_GRAM = 0.2

/**
 * Compute per-gram-of-protein value rows from a product set, cheapest first.
 * Skips any product missing the price/serving/protein_yield data needed for an
 * honest calculation, and any product whose numbers fall outside sane bounds.
 */
export function proteinValueRows(products: Product[]): ProteinValueRow[] {
  const cats = new Set<string>(PROTEIN_CATEGORIES)
  const rows: ProteinValueRow[] = []

  for (const raw of products) {
    if (!cats.has(raw.category)) continue
    const p = withScore(raw)
    const { serving_size, protein_yield, servings_per_container, retail_price } = p
    if (
      serving_size == null ||
      protein_yield == null ||
      servings_per_container == null ||
      retail_price == null
    )
      continue
    if (serving_size <= 0 || protein_yield <= 0 || servings_per_container <= 0 || retail_price <= 0)
      continue

    const proteinPerServing = (serving_size * protein_yield) / 100
    const totalProtein = proteinPerServing * servings_per_container
    if (totalProtein <= 0) continue

    const costPerGram = retail_price / totalProtein
    if (proteinPerServing < MIN_PROTEIN_PER_SERVING || proteinPerServing > MAX_PROTEIN_PER_SERVING)
      continue
    if (costPerGram < MIN_COST_PER_GRAM || costPerGram > MAX_COST_PER_GRAM) continue

    rows.push({
      id: p.id,
      name: p.name,
      brand: p.brand,
      category: p.category,
      score: p.score,
      proteinPerServing: Math.round(proteinPerServing * 10) / 10,
      totalProtein: Math.round(totalProtein),
      costPerGram,
      costPer30g: costPerGram * 30,
      retail_price,
      buy_url: p.buy_url,
    })
  }

  rows.sort((a, b) => a.costPerGram - b.costPerGram)
  return rows
}

/**
 * Fetch active protein powders and return them ranked by cost per gram of
 * protein. DB-failure safe: returns an empty array so the page renders its
 * graceful empty state rather than a 500. Mirrors the /value fetch pattern.
 */
export async function fetchProteinValueRows(): Promise<ProteinValueRow[]> {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('status', 'active')
      .in('category', [...PROTEIN_CATEGORIES])
    if (error || !data) return []
    return proteinValueRows(data as Product[])
  } catch {
    return []
  }
}

/** Format a per-gram cost for display — pence when small, pounds otherwise. */
export function fmtPerGram(costPerGram: number): string {
  const pence = costPerGram * 100
  return pence < 10 ? `${pence.toFixed(1)}p` : `£${costPerGram.toFixed(2)}`
}
