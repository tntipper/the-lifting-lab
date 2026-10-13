import type { StoreLinkMapping } from './commerce/product-mapping'

// EFSA upper limits and EFSA/UK EVM guidance or safe levels.
// The legacy ul field stores the numeric comparison threshold; limitLabel identifies its basis.
// Source: nutrient_limits.json (EFSA 2006-2024)

export const NUTRIENT_LIMITS: Record<string, {
  ul: number | null
  unit: string
  risk: 'low' | 'medium' | 'high'
  note: string
  limitLabel?: string
}> = {
  'Vitamin A': { ul: 3000, unit: 'mcg', risk: 'high', note: 'Fat-soluble; accumulates in liver' },
  'Vitamin D3': { ul: 100, unit: 'mcg', risk: 'high', note: 'Fat-soluble; UL = 100mcg (4,000 IU)' },
  'Vitamin E': { ul: 300, unit: 'mg', risk: 'medium', note: 'Anticoagulant effects at high doses' },
  'Vitamin C': { ul: 1000, unit: 'mg', risk: 'low', limitLabel: 'UK EVM guidance', note: 'UK EVM guidance: 1000mg/day supplemental vitamin C, not an EFSA UL; higher doses may cause GI disturbance' },
  'Vitamin B6': { ul: 12, unit: 'mg', risk: 'high', note: 'UL reduced from 25mg to 12mg (EFSA 2023); peripheral neuropathy risk' },
  'Vitamin B12': { ul: null, unit: 'mcg', risk: 'low', note: 'No established UL' },
  'Zinc': { ul: 25, unit: 'mg', risk: 'high', note: 'Common in multi+ZMA stacks; copper depletion' },
  'Magnesium': { ul: 250, unit: 'mg', risk: 'medium', note: 'UL applies to supplemental Mg only; GI effects' },
  'Iron': { ul: 40, unit: 'mg', risk: 'high', limitLabel: 'EFSA safe level', note: 'EFSA safe level: 40 mg/day total iron for adults, not a UL. If you\'re on TRT, which can raise red blood cell count, speak to your clinician before adding iron and about blood tests.' },
  'Selenium': { ul: 255, unit: 'mcg', risk: 'high', note: 'UL lowered to 255mcg (EFSA 2023); narrow therapeutic window; selenosis risk' },
  'Iodine': { ul: 600, unit: 'mcg', risk: 'medium', note: 'Thyroid disruption at excess' },
  'Calcium': { ul: 2500, unit: 'mg', risk: 'low', note: 'Calcification risk at very high doses' },
  'Caffeine': { ul: 400, unit: 'mg', risk: 'medium', limitLabel: 'EFSA safe level', note: 'EFSA safe level: 400 mg/day from all sources for healthy adults, not a UL' },
}

export function normaliseNutrientName(name: string): string {
  const map: Record<string, string> = {
    'vitamin d': 'Vitamin D3',
    'vitamin d3': 'Vitamin D3',
    'vit d3': 'Vitamin D3',
    'vit b6': 'Vitamin B6',
    'vitamin b6': 'Vitamin B6',
    'vit b12': 'Vitamin B12',
    'vitamin b12': 'Vitamin B12',
    'vit c': 'Vitamin C',
    'vitamin c': 'Vitamin C',
    'vit a': 'Vitamin A',
    'vitamin a': 'Vitamin A',
    'vit e': 'Vitamin E',
    'vitamin e': 'Vitamin E',
  }
  return map[name.toLowerCase()] || name
}

export type SafetyFlag = {
  nutrientName: string
  totalAmount: number
  unit: string
  ul: number
  percentage: number
  risk: 'low' | 'medium' | 'high'
  products: string[]
  note: string
  limitLabel: string
}

export function analyseStack(stackItems: StackItem[]): SafetyFlag[] {
  const totals: Record<string, { amount: number; unit: string; products: string[] }> = {}

  for (const item of stackItems) {
    const product = item.products
    if (!product) continue
    const multiplier = item.servings_per_day || 1

    for (const nutrient of product.product_nutrients || []) {
      const key = normaliseNutrientName(nutrient.nutrient_name)
      if (!totals[key]) {
        totals[key] = { amount: 0, unit: nutrient.unit, products: [] }
      }
      totals[key].amount += nutrient.amount * multiplier
      if (!totals[key].products.includes(product.brand + ' ' + product.name)) {
        totals[key].products.push(product.brand + ' ' + product.name)
      }
    }
  }

  const flags: SafetyFlag[] = []

  for (const [nutrientName, total] of Object.entries(totals)) {
    const limit = NUTRIENT_LIMITS[nutrientName]
    if (!limit || limit.ul === null) continue

    const percentage = (total.amount / limit.ul) * 100
    if (percentage >= 80) {
      flags.push({
        nutrientName,
        totalAmount: Math.round(total.amount * 10) / 10,
        unit: total.unit,
        ul: limit.ul,
        percentage: Math.round(percentage),
        risk: limit.risk,
        products: total.products,
        note: limit.note,
        limitLabel: limit.limitLabel ?? 'EFSA UL',
      })
    }
  }

  return flags.sort((a, b) => b.percentage - a.percentage)
}

export type StackItem = {
  id: string
  servings_per_day: number
  products: {
    id: string
    name: string
    brand: string
    category: string
    serving_size: number
    serving_unit: string
    buy_url?: string | null
    storeLinkMapping?: StoreLinkMapping | null
    product_nutrients: { nutrient_name: string; amount: number; unit: string }[]
  }
}
