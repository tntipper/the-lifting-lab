import type { Nutrient } from '@/lib/products'

export type CardHighlight = { label: string; value: string }

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function findNutrient(nutrients: Nutrient[], aliases: string[], loose = true): Nutrient | undefined {
  const aliasNorms = aliases.map(norm).filter(Boolean)
  const exact = nutrients.find((n) => aliasNorms.includes(norm(n.nutrient_name)))
  if (exact || !loose) return exact
  return nutrients.find((n) => {
    const nn = norm(n.nutrient_name)
    if (!nn) return false
    return aliasNorms.some((a) => nn.includes(a) || a.includes(nn))
  })
}

function fmt(n: Nutrient | undefined): string {
  if (!n || n.amount == null || Number.isNaN(Number(n.amount))) return '\u2014'
  const unit = (n.unit ?? '').trim()
  return unit ? `${n.amount} ${unit}` : String(n.amount)
}

type AliasSlot = { kind: 'alias'; label: string; aliases: string[] }
type OrSlot = { kind: 'or'; groups: { label: string; aliases: string[] }[] }
type FileSlot = { kind: 'file'; max: number; prefer?: string[][] }
type Slot = AliasSlot | OrSlot | FileSlot

const PROTEIN_MACROS: Slot[] = [
  { kind: 'alias', label: 'Protein', aliases: ['protein'] },
  { kind: 'alias', label: 'Carbs', aliases: ['carbohydrates', 'carbs', 'carbohydrate'] },
  { kind: 'alias', label: 'Fat', aliases: ['fat', 'total fat'] },
]

const BY_CATEGORY: Record<string, Slot[]> = {
  whey: PROTEIN_MACROS,
  'whey-isolate': PROTEIN_MACROS,
  casein: PROTEIN_MACROS,
  'protein-bar': [
    { kind: 'alias', label: 'Protein', aliases: ['protein'] },
    { kind: 'alias', label: 'Sugar', aliases: ['sugar', 'sugars', 'of which sugars'] },
    { kind: 'alias', label: 'Calories', aliases: ['calories', 'energy', 'kcal'] },
  ],
  'meal-replacement': [
    { kind: 'alias', label: 'Calories', aliases: ['calories', 'energy', 'kcal'] },
    { kind: 'alias', label: 'Protein', aliases: ['protein'] },
    { kind: 'alias', label: 'Sugar', aliases: ['sugar', 'sugars', 'of which sugars'] },
  ],
  creatine: [
    { kind: 'or', groups: [
      { label: 'Creatine Monohydrate', aliases: ['creatine monohydrate'] },
      { label: 'Creatine', aliases: ['creatine'] },
    ] },
  ],
  'pre-workout': [
    { kind: 'alias', label: 'Caffeine', aliases: ['caffeine', 'caffeine anhydrous'] },
    { kind: 'or', groups: [
      { label: 'L-Citrulline', aliases: ['l citrulline', 'citrulline'] },
      { label: 'Citrulline Malate', aliases: ['citrulline malate'] },
    ] },
    { kind: 'alias', label: 'Beta-Alanine', aliases: ['beta alanine', 'beta-alanine'] },
  ],
  eaas: [
    { kind: 'or', groups: [
      { label: 'L-Leucine', aliases: ['l leucine'] },
      { label: 'Leucine', aliases: ['leucine'] },
    ] },
    { kind: 'or', groups: [
      { label: 'L-Isoleucine', aliases: ['l isoleucine'] },
      { label: 'Isoleucine', aliases: ['isoleucine'] },
    ] },
    { kind: 'or', groups: [
      { label: 'L-Valine', aliases: ['l valine'] },
      { label: 'Valine', aliases: ['valine'] },
    ] },
  ],
  'intra-workout': [
    { kind: 'alias', label: 'EAAs', aliases: ['eaas', 'eaa', 'essential amino acids', 'essential amino acid'] },
    { kind: 'or', groups: [
      { label: 'L-Leucine', aliases: ['l leucine'] },
      { label: 'Leucine', aliases: ['leucine'] },
    ] },
  ],
  'post-workout': [
    { kind: 'alias', label: 'Protein', aliases: ['protein'] },
    { kind: 'alias', label: 'Carbohydrates', aliases: ['carbohydrates', 'carbs', 'carbohydrate'] },
  ],
  hydration: [
    { kind: 'alias', label: 'Sodium', aliases: ['sodium'] },
    { kind: 'alias', label: 'Potassium', aliases: ['potassium'] },
    { kind: 'alias', label: 'Magnesium', aliases: ['magnesium'] },
  ],
  'cycle-support': [
    { kind: 'alias', label: 'NAC', aliases: ['nac', 'n acetyl cysteine', 'n acetylcysteine', 'n-acetyl cysteine'] },
    { kind: 'alias', label: 'TUDCA', aliases: ['tudca', 'tauroursodeoxycholic acid'] },
  ],
  'hormone-support': [
    { kind: 'file', max: 3, prefer: [
      ['ashwagandha', 'ksm 66', 'ksm66'],
      ['d aspartic acid', 'daa', 'd-aspartic acid'],
      ['tongkat ali', 'eurycoma', 'longjack'],
      ['zma'],
    ] },
  ],
  'gut-digestion': [
    { kind: 'file', max: 2 },
  ],
  vitamin: [{ kind: 'file', max: 3 }],
  multivitamin: [{ kind: 'file', max: 3 }],
  'vitamin-c': [
    { kind: 'alias', label: 'Vitamin C', aliases: ['vitamin c', 'ascorbic acid'] },
  ],
  'vitamin-d': [
    { kind: 'or', groups: [
      { label: 'Vitamin D3', aliases: ['vitamin d3', 'cholecalciferol'] },
      { label: 'Vitamin D', aliases: ['vitamin d'] },
    ] },
  ],
  zma: [
    { kind: 'file', max: 3, prefer: [
      ['zma'],
      ['zinc'],
      ['magnesium'],
      ['vitamin b6', 'b6'],
    ] },
  ],
  magnesium: [
    { kind: 'alias', label: 'Magnesium', aliases: ['magnesium'] },
  ],
  'omega-3': [
    { kind: 'file', max: 3, prefer: [
      ['epa', 'eicosapentaenoic'],
      ['dha', 'docosahexaenoic'],
      ['omega 3', 'omega-3', 'fish oil'],
    ] },
  ],
}

function fromFile(nutrients: Nutrient[], max: number, prefer?: string[][]): CardHighlight[] {
  const out: CardHighlight[] = []
  const used = new Set<string>()
  if (prefer) {
    for (const aliases of prefer) {
      if (out.length >= max) break
      const n = findNutrient(nutrients, aliases)
      if (!n) continue
      const key = norm(n.nutrient_name)
      if (used.has(key)) continue
      used.add(key)
      out.push({ label: n.nutrient_name, value: fmt(n) })
    }
  }
  if (out.length >= max) return out
  const rest = [...nutrients].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
  for (const n of rest) {
    if (out.length >= max) break
    const key = norm(n.nutrient_name)
    if (!key || used.has(key)) continue
    used.add(key)
    out.push({ label: n.nutrient_name, value: fmt(n) })
  }
  return out
}

function resolveSlot(slot: Slot, nutrients: Nutrient[]): CardHighlight[] {
  if (slot.kind === 'alias') {
    return [{ label: slot.label, value: fmt(findNutrient(nutrients, slot.aliases)) }]
  }
  if (slot.kind === 'or') {
    for (const g of slot.groups) {
      const n = findNutrient(nutrients, g.aliases, false) ?? findNutrient(nutrients, g.aliases, true)
      if (n) return [{ label: n.nutrient_name, value: fmt(n) }]
    }
    return [{ label: slot.groups[0].label, value: '\u2014' }]
  }
  return fromFile(nutrients, slot.max, slot.prefer)
}

/** 2–3 (or fewer) highlights from on-file nutrients. Missing slots use an em dash. Never invents amounts. */
export function cardHighlights(category: string, nutrients: Nutrient[] | undefined): CardHighlight[] {
  const list = nutrients ?? []
  const slots = BY_CATEGORY[category]
  if (!slots) {
    return fromFile(list, 2)
  }
  const out: CardHighlight[] = []
  for (const slot of slots) {
    out.push(...resolveSlot(slot, list))
  }
  return out.slice(0, 3)
}
