// UK Reference Nutrient Intake (RNI) — NHS / SACN values for adults 19-64.
// The RDA side of the Stack Builder RAG methodology: a stack is flagged GREEN
// for a nutrient once cumulative daily intake reaches 100% of the RNI (without
// exceeding the EFSA Tolerable Upper Intake Level — see lib/nutrient-limits.ts).
//
// Where the UK sets no formal RNI, a "safe intake" / adequate intake figure is
// used and noted. Names are pre-normalised via normaliseNutrientName.

export type Sex = 'male' | 'female'

export const NUTRIENT_RNI: Record<string, {
  male: number
  female: number
  unit: string
  note: string
}> = {
  'Vitamin A':   { male: 700,  female: 600,  unit: 'mcg', note: 'UK RNI; mcg retinol equivalents' },
  'Vitamin D3':  { male: 10,   female: 10,   unit: 'mcg', note: 'NHS RNI (400 IU) for adults' },
  'Vitamin E':   { male: 4,    female: 3,    unit: 'mg',  note: 'UK safe intake (no formal RNI)' },
  'Vitamin C':   { male: 40,   female: 40,   unit: 'mg',  note: 'UK RNI' },
  'Vitamin B6':  { male: 1.4,  female: 1.2,  unit: 'mg',  note: 'UK RNI; scales with protein intake' },
  'Vitamin B12': { male: 1.5,  female: 1.5,  unit: 'mcg', note: 'UK RNI' },
  'Zinc':        { male: 9.5,  female: 7,    unit: 'mg',  note: 'UK RNI' },
  'Magnesium':   { male: 300,  female: 270,  unit: 'mg',  note: 'UK RNI' },
  'Iron':        { male: 8.7,  female: 14.8, unit: 'mg',  note: 'UK RNI; higher for menstruating women' },
  'Selenium':    { male: 75,   female: 60,   unit: 'mcg', note: 'UK RNI' },
  'Iodine':      { male: 140,  female: 140,  unit: 'mcg', note: 'UK RNI' },
  'Calcium':     { male: 700,  female: 700,  unit: 'mg',  note: 'UK RNI' },
}

// Returns the RNI for a (already-normalised) nutrient name and sex, or null.
export function rniFor(nutrientName: string, sex: Sex): { value: number; unit: string; note: string } | null {
  const r = NUTRIENT_RNI[nutrientName]
  if (!r) return null
  return { value: sex === 'female' ? r.female : r.male, unit: r.unit, note: r.note }
}
