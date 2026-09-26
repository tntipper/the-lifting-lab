// Pre-workout "actives content" rankings — the caffeine/stimulant axis.
//
// The site scores pre-workouts on Effectiveness Match (/best/pre-workout) and
// ranks them on price (/cheapest, /value), but nothing surfaces the single
// question the "strongest pre workout UK" / "highest caffeine pre workout"
// search class actually asks: how much caffeine (and beta-alanine, citrulline)
// is in each serving? That data already lives in `product_nutrients` (used only
// by the compare feature). This module reads it and ranks pre-workouts by
// caffeine per serving, the honest measure of "strength".
import { PRODUCT_COLUMNS, withScore, type Product } from '@/lib/products'
import { createPublicClient } from '@/lib/supabase-public'

// EFSA (2015): up to 400 mg caffeine/day is safe for most adults, and single
// doses up to 200 mg raise no safety concern. We flag servings over 400 mg as
// high-stim — the scoring engine already penalises them.
export const HIGH_STIM_MG = 400
export const SINGLE_DOSE_MG = 200
// Clinical performance doses (ISSN position stands): beta-alanine ~3.2 g/day,
// citrulline ~6-8 g. Used only to mark whether a serving hits an effective dose.
export const BETA_ALANINE_TARGET_G = 3.2
export const CITRULLINE_TARGET_G = 6

export type PreWorkoutRow = {
  id: string
  name: string
  brand: string
  score: number | null
  costPerServing: number | null
  caffeineMg: number
  betaAlanineG: number | null
  citrullineG: number | null
  citrullineForm: 'citrulline' | 'malate' | null
  buy_url: string | null
}

type NutrientRow = { product_id: string; nutrient_name: string; amount: number; unit: string }

const PRE_WORKOUT_CATEGORY = 'pre-workout'
const ACTIVE_NUTRIENTS = ['Caffeine', 'Beta-Alanine', 'L-Citrulline', 'Citrulline Malate']

// Only explicit mass units are comparable. Unknown units remain in the raw
// catalogue, but cannot silently become a mg/g comparison or caution amount.
function toMg(amount: number, unit: string): number | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || typeof unit !== 'string') return null
  const factor = ({ mg: 1, g: 1000, 'µg': 0.001, 'μg': 0.001, mcg: 0.001 } as Record<string, number>)[unit.trim().toLowerCase()]
  const converted = amount * factor
  return Number.isFinite(converted) ? converted : null
}
function toG(amount: number, unit: string): number | null {
  const mg = toMg(amount, unit)
  return mg === null ? null : mg / 1000
}

/** Build caffeine-led ranking rows from a product set + its nutrient rows. */
export function preWorkoutRows(products: Product[], nutrients: NutrientRow[]): PreWorkoutRow[] {
  const rows: PreWorkoutRow[] = []
  for (const raw of products) {
    if (raw.category !== PRE_WORKOUT_CATEGORY) continue
    const p = withScore(raw)
    const mine = nutrients.filter((n) => n.product_id === raw.id)
    const caf = mine.find((n) => n.nutrient_name === 'Caffeine')
    // Caffeine-led ranking: a product with no caffeine data is noise here, skip it.
    if (!caf) continue
    const caffeineMg = toMg(caf.amount, caf.unit)
    if (caffeineMg === null) continue
    const ba = mine.find((n) => n.nutrient_name === 'Beta-Alanine')
    const citPure = mine.find((n) => n.nutrient_name === 'L-Citrulline')
    const citMalate = mine.find((n) => n.nutrient_name === 'Citrulline Malate')
    const cit = citPure ?? citMalate

    rows.push({
      id: p.id,
      name: p.name,
      brand: p.brand,
      score: p.score,
      costPerServing: p.cost_per_serving,
      caffeineMg: caffeineMg,
      betaAlanineG: ba ? toG(ba.amount, ba.unit) : null,
      citrullineG: cit ? toG(cit.amount, cit.unit) : null,
      citrullineForm: cit ? (citPure ? 'citrulline' : 'malate') : null,
      buy_url: p.buy_url,
    })
  }
  // Recorded caffeine descending; equal amounts use neutral alphabetical order.
  rows.sort((a, b) => b.caffeineMg - a.caffeineMg || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  return rows
}

/**
 * Fetch active pre-workouts and their caffeine/beta-alanine/citrulline content,
 * ranked strongest (most caffeine) first. DB-failure safe: returns an empty
 * array so the page renders its graceful empty state rather than a 500.
 */
export async function fetchPreWorkoutRows(): Promise<PreWorkoutRow[]> {
  try {
    const sb = createPublicClient()
    const { data: prods, error } = await sb
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('status', 'active')
      .eq('category', PRE_WORKOUT_CATEGORY)
    if (error || !prods) return []
    const ids = (prods as Product[]).map((p) => p.id)
    if (!ids.length) return []
    const { data: nuts, error: nErr } = await sb
      .from('product_nutrients')
      .select('product_id, nutrient_name, amount, unit')
      .in('product_id', ids)
      .in('nutrient_name', ACTIVE_NUTRIENTS)
    if (nErr) return []
    return preWorkoutRows(prods as Product[], (nuts as NutrientRow[] | null) ?? [])
  } catch {
    return []
  }
}
