// Shared scoring utilities: verdict flags + per-nutrient RGB status

import type { Nutrient } from '@/lib/products'

const green = '#a6e22e'
const amber = '#f5b342'
const red = '#ff5c5c'

export type VerdictFlag = { color: string; text: string }

// Reference: minimum effective doses for green / amber thresholds
const NUTRIENT_REFS: Record<string, { green: number; amber: number; maxRed?: number }> = {
  'protein':                 { green: 25,    amber: 20 },
  'creatine':                { green: 5000,  amber: 3000 },
  'creatine monohydrate':    { green: 5000,  amber: 3000 },
  'caffeine':                { green: 200,   amber: 100,  maxRed: 400 },
  'caffeine anhydrous':      { green: 200,   amber: 100,  maxRed: 400 },
  'l-citrulline':            { green: 6000,  amber: 3000 },
  'citrulline':              { green: 6000,  amber: 3000 },
  'citrulline malate':       { green: 6000,  amber: 4000 },
  'beta-alanine':            { green: 3200,  amber: 1600 },
  'beta alanine':            { green: 3200,  amber: 1600 },
  'vitamin d3':              { green: 25,    amber: 10 },
  'vitamin d':               { green: 25,    amber: 10 },
  'magnesium':               { green: 200,   amber: 100 },
  'magnesium bisglycinate':  { green: 200,   amber: 100 },
  'zinc':                    { green: 15,    amber: 7 },
  'vitamin c':               { green: 500,   amber: 100 },
  'epa':                     { green: 600,   amber: 300 },
  'dha':                     { green: 400,   amber: 200 },
  'l-leucine':               { green: 2500,  amber: 1500 },
  'leucine':                 { green: 2500,  amber: 1500 },
  'ashwagandha':             { green: 300,   amber: 150 },
  'ksm-66':                  { green: 300,   amber: 150 },
  'coq10':                   { green: 100,   amber: 50 },
  'coenzyme q10':            { green: 100,   amber: 50 },
  'n-acetyl cysteine':       { green: 600,   amber: 300 },
  'nac':                     { green: 600,   amber: 300 },
  'milk thistle extract':    { green: 500,   amber: 250 },
  'milk thistle':            { green: 500,   amber: 250 },
  'silymarin':               { green: 200,   amber: 100 },
  'alpha lipoic acid':       { green: 300,   amber: 150 },
}

export function nutrientColor(name: string, amount: number): string | null {
  const ref = NUTRIENT_REFS[name.toLowerCase()]
  if (!ref) return null
  if (ref.maxRed && amount > ref.maxRed) return red
  if (amount >= ref.green) return green
  if (amount >= ref.amber) return amber
  return red
}

export function verdictFlags(
  nutrients: Nutrient[],
  score: number | null,
  informed_sport: boolean | null,
): VerdictFlag[] {
  const flags: VerdictFlag[] = []
  if (score == null) return flags

  if (score >= 90) flags.push({ color: green, text: 'Excellent Effectiveness Match — top-tier dosing' })
  else if (score >= 70) flags.push({ color: green, text: 'Strong Effectiveness Match against reference doses' })
  else if (score >= 50) flags.push({ color: amber, text: 'Partial Effectiveness Match — some doses below optimal' })
  else flags.push({ color: red, text: 'Poor Effectiveness Match — significantly underdosed vs reference' })

  if (informed_sport) {
    flags.push({ color: green, text: 'Informed Sport certified — batch tested for banned substances' })
  }

  for (const n of nutrients) {
    const name = n.nutrient_name.toLowerCase()
    const amt = n.amount

    if (name.includes('caffeine')) {
      if (amt >= 200 && amt <= 400) flags.push({ color: green, text: `Caffeine ${amt}mg — in the effective sweet spot (200–400mg)` })
      else if (amt > 400) flags.push({ color: red, text: `Caffeine ${amt}mg — above 400mg, potential side effects` })
      else flags.push({ color: amber, text: `Caffeine ${amt}mg — below optimal range (200–400mg)` })
    }
    if (name.includes('citrulline')) {
      if (amt >= 6000) flags.push({ color: green, text: `Citrulline ${amt}mg — meets or exceeds 6g effective dose` })
      else flags.push({ color: amber, text: `Citrulline ${amt}mg — below optimal 6–8g effective dose` })
    }
    if (name.includes('beta-alanine') || name === 'beta alanine') {
      if (amt >= 3200) flags.push({ color: green, text: `Beta-Alanine ${amt}mg — effective dose met (3.2g)` })
      else flags.push({ color: amber, text: `Beta-Alanine ${amt}mg — below optimal 3.2g dose` })
    }
    if (name === 'creatine' || name.includes('creatine monohydrate')) {
      if (amt >= 5000) flags.push({ color: green, text: `Creatine ${amt}mg — full 5g effective dose` })
      else flags.push({ color: amber, text: `Creatine ${amt}mg — below optimal 5g dose` })
    }
    if (name === 'protein') {
      if (amt >= 25) flags.push({ color: green, text: `${amt}g protein per serving — strong yield` })
      else flags.push({ color: amber, text: `${amt}g protein per serving — moderate yield` })
    }
    if (name.includes('vitamin d')) {
      if (amt >= 25) flags.push({ color: green, text: `Vitamin D ${amt}mcg — meets 1000IU+ recommendation` })
      else flags.push({ color: amber, text: `Vitamin D ${amt}mcg — below optimal dosing` })
    }
    if (name === 'magnesium' || name.includes('magnesium bisglycinate')) {
      if (amt >= 200) flags.push({ color: green, text: `Magnesium ${amt}mg — meaningful dose` })
      else flags.push({ color: amber, text: `Magnesium ${amt}mg — low dose` })
    }
  }

  return flags
}
