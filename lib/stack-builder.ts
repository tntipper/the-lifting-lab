import { normaliseNutrientName, NUTRIENT_LIMITS, type StackItem } from './nutrient-limits'
import { convertAmount } from './stack-reference-ranges'

export type StackDoseTotal = {
  name: string; amount: number; unit: string
  contributions: { product: string; amount: number }[]
}

/** Convert before summing; incompatible units stay in separate rows. */
export function stackDoseTotals(items: StackItem[]): StackDoseTotal[] {
  const totals = new Map<string, StackDoseTotal>()
  for (const item of items) {
    if (!item.products) continue
    for (const nutrient of item.products.product_nutrients || []) {
      if (!Number.isFinite(nutrient.amount) || nutrient.amount < 0) continue
      const name = normaliseNutrientName(nutrient.nutrient_name)
      const existing = [...totals.values()].find(row => row.name.toLowerCase() === name.toLowerCase() && convertAmount(nutrient.amount, nutrient.unit, row.unit) !== null)
      const unit = existing?.unit ?? NUTRIENT_LIMITS[name]?.unit ?? nutrient.unit
      const converted = convertAmount(nutrient.amount, nutrient.unit, unit)
      const amount = (converted ?? nutrient.amount) * item.servings_per_day
      const key = `${name.toLowerCase()}:${converted === null ? nutrient.unit : unit}`
      const row = existing ?? totals.get(key) ?? { name, unit: converted === null ? nutrient.unit : unit, amount: 0, contributions: [] }
      row.amount += amount
      const product = `${item.products.brand} ${item.products.name}`
      const contribution = row.contributions.find(entry => entry.product === product)
      if (contribution) contribution.amount += amount
      else row.contributions.push({ product, amount })
      if (!existing) totals.set(key, row)
    }
  }
  return [...totals.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function dailyCost(product: { retail_price?: number | null; servings_per_container?: number | null; storePrice?: { price: number | null } | null }, servings = 1): number | null {
  const price = product.storePrice ? product.storePrice.price : product.retail_price
  const count = product.servings_per_container
  return typeof price === 'number' && Number.isFinite(price) && price > 0 && typeof count === 'number' && Number.isFinite(count) && count > 0
    ? price / count * servings : null
}
