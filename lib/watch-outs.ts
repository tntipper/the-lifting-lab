// Data + logic for the "Supplement Watch-Outs" surface (/watch-outs): the
// honest flip-side of /best and /value. Where those hubs celebrate the top
// pick in every category, this one surfaces the LOWEST-scoring products our
// engine flags — each paired with the higher-scoring pick to buy instead.
//
// This is deliberately constructive, not a hit-list: a product only appears
// when (a) it scores below our 50 pass bar AND (b) there is a genuinely better
// alternative in the same category to point buyers at (>= MIN_DELTA points
// clear). Every reason shown is an objective, label-derived fact or our
// clearly-labelled Effectiveness Match score, never a subjective claim.
import { createPublicClient } from '@/lib/supabase-public'
import { PRODUCT_COLUMNS, withScore, type Product, type ScoredProduct } from '@/lib/products'

// Score at/above which a product is considered a "pass" (mirrors the amber/red
// boundary in ScoreBadge). Below this we treat it as a watch-out.
export const PASS_BAR = 50

// A category must field at least this many scored products before we publish
// its watch-outs, so a low scorer is judged against a real field rather than a
// tiny sample (avoids unfairly flagging a thin category).
export const MIN_CATEGORY = 6

// The category's top pick must beat a flagged product by at least this many
// points for it to qualify — guarantees the "buy instead" is a meaningful
// upgrade, not a marginal swap.
export const MIN_DELTA = 20

// Most flagged products to show per category (worst first).
export const MAX_PER_CATEGORY = 3

export type WatchOut = {
  product: ScoredProduct
  reasons: string[]
}

export type CategoryWatchOut = {
  category: string
  best: ScoredProduct // the higher-scoring pick to buy instead
  flagged: WatchOut[]
}

// Objective, verifiable reasons a product is flagged. Leads with our
// clearly-labelled editorial score; adds only label-derived facts.
function deriveReasons(p: ScoredProduct, best: ScoredProduct): string[] {
  const reasons: string[] = []
  const score = p.score as number
  reasons.push(`Effectiveness Match ${score}/100 — below our 50 pass bar`)

  if (p.proprietary_blend) {
    reasons.push(
      'Uses a proprietary blend, so individual ingredient doses are not disclosed on the label',
    )
  }
  if (p.amino_spiked) {
    reasons.push(
      'Our label analysis flags amino-spiking (cheap filler aminos that inflate the stated protein content)',
    )
  }
  // Value angle — only when we can compare cost per serving both ways and the
  // flagged product is no cheaper than the far higher-scoring pick.
  if (
    p.cost_per_serving != null &&
    best.cost_per_serving != null &&
    p.cost_per_serving >= best.cost_per_serving
  ) {
    const delta = (best.score as number) - score
    reasons.push(
      `Costs £${p.cost_per_serving.toFixed(2)} per serving — no cheaper than our top pick, yet scores ${delta} points lower`,
    )
  }
  return reasons
}

// One Supabase query, then derive per-category watch-outs. DB-failure safe:
// returns [] so the page renders its graceful empty state, never a 500.
export async function categoryWatchOuts(): Promise<CategoryWatchOut[]> {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('status', 'active')
    if (error || !data) return []

    const scored = (data as Product[]).map(withScore).filter((p) => p.score != null)

    // Group scored products by category.
    const byCategory = new Map<string, ScoredProduct[]>()
    for (const p of scored) {
      const list = byCategory.get(p.category) ?? []
      list.push(p)
      byCategory.set(p.category, list)
    }

    const out: CategoryWatchOut[] = []
    for (const [category, listRaw] of byCategory) {
      if (listRaw.length < MIN_CATEGORY) continue
      const list = [...listRaw].sort((a, b) => (b.score as number) - (a.score as number))
      const best = list[0]
      // Worst first, only those below the bar AND a clear delta from the best.
      const flaggedProducts = [...list]
        .sort((a, b) => (a.score as number) - (b.score as number))
        .filter(
          (p) =>
            (p.score as number) < PASS_BAR &&
            p.id !== best.id &&
            (best.score as number) - (p.score as number) >= MIN_DELTA,
        )
        .slice(0, MAX_PER_CATEGORY)
      if (flaggedProducts.length === 0) continue
      out.push({
        category,
        best,
        flagged: flaggedProducts.map((p) => ({ product: p, reasons: deriveReasons(p, best) })),
      })
    }
    return out
  } catch {
    return []
  }
}
