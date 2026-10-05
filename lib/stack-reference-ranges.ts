export type StackReferenceRange = {
  minimum: number
  maximum: number
  unit: 'mg' | 'g'
  timing: string
  context?: string
}

const REFERENCES: Record<string, StackReferenceRange> = {
  'creatine': { minimum: 3, maximum: 5, unit: 'g', timing: 'a day' },
  'creatine monohydrate': { minimum: 3, maximum: 5, unit: 'g', timing: 'a day' },
  'beta-alanine': { minimum: 3.2, maximum: 6.4, unit: 'g', timing: 'a day' },
  'l-citrulline': { minimum: 6, maximum: 8, unit: 'g', timing: 'before training' },
  'citrulline': { minimum: 6, maximum: 8, unit: 'g', timing: 'before training' },
  'betaine': { minimum: 2.5, maximum: 2.5, unit: 'g', timing: 'a day' },
  'betaine anhydrous': { minimum: 2.5, maximum: 2.5, unit: 'g', timing: 'a day' },
  'taurine': { minimum: 1, maximum: 2, unit: 'g', timing: 'around training' },
  'leucine': { minimum: 2, maximum: 3, unit: 'g', timing: 'per serving' },
  'l-theanine': { minimum: 100, maximum: 200, unit: 'mg', timing: 'alongside caffeine', context: 'A common pairing range, not a daily target.' },
  'sodium': { minimum: 500, maximum: 1000, unit: 'mg', timing: 'per hour of heavy sweating', context: 'Only for prolonged or heavy sweating; not a general daily target.' },
}

function keyFor(name: string): string {
  return name.toLowerCase().replace(/[()]/g, '').replace(/\s+/g, ' ').trim()
}

export function referenceRangeFor(name: string): StackReferenceRange | null {
  const key = keyFor(name)
  if (REFERENCES[key]) return REFERENCES[key]
  if (key.includes('creatine monohydrate')) return REFERENCES['creatine monohydrate']
  if (key.includes('beta alanine')) return REFERENCES['beta-alanine']
  if (key.includes('citrulline') && !key.includes('malate')) return REFERENCES['citrulline']
  return null
}

export function convertAmount(value: number, fromUnit: string, toUnit: string): number | null {
  const from = fromUnit.toLowerCase()
  const to = toUnit.toLowerCase()
  if (from === to) return value
  if (from === 'mg' && to === 'g') return value / 1000
  if (from === 'g' && to === 'mg') return value * 1000
  return null
}
