/** Public safety notices from catalogue data. No supplier fields or approvals. */
export type ProductSafety = {
  containsCaffeine?: boolean
  minimumAge?: number
  labelWarnings?: string[]
}
type WarningProduct = {
  category: string
  nutrients?: { nutrient_name: string; amount: number; unit: string }[]
  safety?: ProductSafety | null
}
// Draft TLL guidance, not a legal age limit or approval of any UK label.
const CATEGORY_MINIMUM_AGE: Readonly<Record<string, number>> = { 'pre-workout': 16 }
export function productWarningsFor(product: WarningProduct) {
  const caffeineRows = (product.nutrients ?? []).filter(n =>
    /\bcaffeine\b/i.test(n.nutrient_name) && Number.isFinite(n.amount) && n.amount > 0)
  const caffeine = product.safety?.containsCaffeine === true || caffeineRows.length > 0
  const warnings: { code: string; text: string }[] = []
  if (caffeine) warnings.push({ code: 'caffeine', text:
    'Contains caffeine. Not recommended for children or pregnant women. Check the pack for the caffeine amount and recommended daily portion; take account of caffeine from other sources.' })
  const labelAge = product.safety?.minimumAge
  const minimumAge = Math.max(CATEGORY_MINIMUM_AGE[product.category] ?? 0, caffeine ? 16 : 0,
    typeof labelAge === 'number' && Number.isInteger(labelAge) && labelAge > 0 ? labelAge : 0)
  if (minimumAge) warnings.push({ code: 'age', text:
    `${minimumAge}+ notice: not intended for anyone under ${minimumAge}. Follow any stricter age restriction on the pack. This is TLL guidance, not a statement of a legal purchase age.` })
  for (const [i, text] of (product.safety?.labelWarnings ?? []).entries()) {
    if (text.trim()) warnings.push({ code: `label-${i}`, text: text.trim() })
  }
  return warnings
}
