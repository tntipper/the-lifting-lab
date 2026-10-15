import type { Nutrient } from './products'

// Shop.dc.html REF caffeine entry, limited to the sourced single-dose context.
// No evidence-dose endorsements are inferred from the prototype's sample ranges.
export const SHOP_GUIDANCE = {
  caffeine: { match: /^caffeine(?: anhydrous)?$/i, maxMg: 200,
    context: 'EFSA single-dose guidance for healthy adults is 200 mg from all sources.',
    source: 'https://www.efsa.europa.eu/en/topics/topic/caffeine' },
} as const

export function aboveGuidance(nutrients: Nutrient[]) {
  return Object.values(SHOP_GUIDANCE).flatMap(ref => {
    const rows = nutrients.filter(n => ref.match.test(n.nutrient_name))
    if (!rows.length || rows.some(n => !Number.isFinite(n.amount) || n.amount < 0 || !['g', 'mg'].includes(n.unit.toLowerCase()))) return []
    const total = rows.reduce((sum, n) => sum + n.amount * (n.unit.toLowerCase() === 'g' ? 1000 : 1), 0)
    return total > ref.maxMg ? [{ text: `Caffeine ${Number(total.toFixed(3))} mg per serving. ${ref.context}`, source: ref.source }] : []
  })
}
