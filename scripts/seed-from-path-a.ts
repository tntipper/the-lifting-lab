// Seeds the full Path A catalogue (~200 products) into Supabase.
//
// Reads Path A's webapp/data.js (window.DADB), maps each product to the Path B
// schema (products + product_nutrients), skips anything already present
// (matched on brand + name), and inserts the rest.
//
// Requires SUPABASE_SERVICE_KEY (service_role) to bypass RLS on insert.
// The script loads .env.local automatically if present.
//
// Run:  node scripts/seed-from-path-a.ts
//   (Node 24+ strips TS types and auto-detects ESM — no tsx needed)

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// --- load .env.local (so SUPABASE_SERVICE_KEY is available without extra tooling) ---
const envPath = resolve(ROOT, '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wrhgscovsgsudtedbljr.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_KEY. Add it to .env.local (service_role key) and re-run.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// Path A data (workspace copy). Read-only.
const DATA_JS = 'C:/Users/tobia/.openclaw/workspace/theliftinglab/webapp/data.js'

// ---- load window.DADB ----
const dataSrc = readFileSync(DATA_JS, 'utf8')
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const DADB: Record<string, { label: string; products: Record<string, unknown>[] }> =
  new Function('window', dataSrc + '\nreturn window.DADB;')({})

// ---- Path A category key -> Path B category slug + serving unit hint ----
const CATEGORY_MAP: Record<string, { slug: string; unit: string }> = {
  pre_workouts: { slug: 'pre-workout', unit: 'scoop' },
  creatine: { slug: 'creatine', unit: 'g' },
  eaas: { slug: 'eaas', unit: 'scoop' },
  intra_workout: { slug: 'intra-workout', unit: 'scoop' },
  post_workout: { slug: 'post-workout', unit: 'scoop' },
  hydration: { slug: 'hydration', unit: 'serving' },
  cycle_support: { slug: 'cycle-support', unit: 'serving' },
  whey_normal: { slug: 'whey', unit: 'scoop' },
  whey_isolate: { slug: 'whey-isolate', unit: 'scoop' },
  casein: { slug: 'casein', unit: 'scoop' },
  protein_bars: { slug: 'protein-bar', unit: 'bar' },
  meal_replacement_rtd: { slug: 'meal-replacement', unit: 'bottle' },
  vitamins_wellbeing: { slug: 'vitamin', unit: 'serving' },
  hormone_support: { slug: 'hormone-support', unit: 'serving' },
  gut_digestion: { slug: 'gut-digestion', unit: 'serving' },
}

// pull the first number out of a value, e.g. "200mg" -> 200, "30 (1 scoop)" -> 30
function num(v: unknown): number {
  if (v == null) return 0
  const m = String(v).match(/-?\d+(\.\d+)?/)
  return m ? parseFloat(m[0]) : 0
}

type NutrientRow = { nutrient_name: string; amount: number; unit: string }

// Map a Path A dose field key -> { name, unit } for the nutrients we care about
// (especially anything the EFSA safety analysis can flag). Best-effort: unknown
// fields are skipped rather than guessed.
const NUTRIENT_FIELDS: { match: RegExp; name: string; unit: string }[] = [
  { match: /^Caffeine dose/i, name: 'Caffeine', unit: 'mg' },
  { match: /^Beta-Alanine dose/i, name: 'Beta-Alanine', unit: 'g' },
  { match: /^L-Citrulline dose/i, name: 'L-Citrulline', unit: 'g' },
  { match: /^Betaine dose/i, name: 'Betaine', unit: 'g' },
  { match: /^L-Tyrosine dose/i, name: 'L-Tyrosine', unit: 'g' },
  { match: /^L-Theanine dose/i, name: 'L-Theanine', unit: 'mg' },
  { match: /^Taurine dose/i, name: 'Taurine', unit: 'g' },
  { match: /^Sodium dose/i, name: 'Sodium', unit: 'mg' },
  { match: /^Potassium dose/i, name: 'Potassium', unit: 'mg' },
  { match: /^Magnesium dose/i, name: 'Magnesium', unit: 'mg' },
  { match: /^NAC dose/i, name: 'NAC', unit: 'mg' },
  { match: /^TUDCA dose/i, name: 'TUDCA', unit: 'mg' },
  { match: /^Citrus Bergamot dose/i, name: 'Citrus Bergamot', unit: 'mg' },
  { match: /^CoQ10 dose/i, name: 'CoQ10', unit: 'mg' },
  { match: /^Total EAAs per serving/i, name: 'EAAs', unit: 'g' },
  { match: /^EAA dose per serving/i, name: 'EAAs', unit: 'g' },
  { match: /^Protein per serving/i, name: 'Protein', unit: 'g' },
  { match: /^Protein dose per serving/i, name: 'Protein', unit: 'g' },
  { match: /^Protein per bar/i, name: 'Protein', unit: 'g' },
  { match: /^Protein per bottle/i, name: 'Protein', unit: 'g' },
  { match: /^Calories per bottle/i, name: 'Calories', unit: 'kcal' },
  { match: /^Sugar per bar/i, name: 'Sugar', unit: 'g' },
  { match: /^Sugar per bottle/i, name: 'Sugar', unit: 'g' },
]

function extractNutrients(p: Record<string, unknown>): NutrientRow[] {
  const rows: NutrientRow[] = []
  const seen = new Set<string>()
  for (const [key, val] of Object.entries(p)) {
    const def = NUTRIENT_FIELDS.find((f) => f.match.test(key))
    if (!def) continue
    const amount = num(val)
    if (!amount || seen.has(def.name)) continue
    seen.add(def.name)
    rows.push({ nutrient_name: def.name, amount, unit: def.unit })
  }
  // vitamins / hormone support: single "Key Active Ingredient" + dose
  const activeName = (p['Key Active Ingredient'] || p['Primary Active']) as string | undefined
  const activeDose = p['Active Ingredient Dose per serving'] || p['Primary Active Dose per serving (mg)']
  if (activeName && activeDose != null && !seen.has(activeName)) {
    const amount = num(activeDose)
    if (amount) {
      const unit = /mg|mcg|g|iu/i.exec(String(activeDose))?.[0]?.toLowerCase() || 'mg'
      rows.push({ nutrient_name: activeName, amount, unit })
    }
  }
  return rows
}

async function seed() {
  // existing products (brand|name) so we can skip duplicates
  const { data: existing, error: exErr } = await supabase
    .from('products')
    .select('name, brand')
  if (exErr) {
    console.error('Could not read existing products:', exErr.message)
    process.exit(1)
  }
  const existingKeys = new Set((existing || []).map((r) => `${r.brand || ''}|${r.name}`))

  let inserted = 0
  let skipped = 0
  let failed = 0

  for (const [catKey, group] of Object.entries(DADB)) {
    const map = CATEGORY_MAP[catKey]
    if (!map) continue
    for (const p of group.products || []) {
      const name = p['Name'] as string
      const brand = (p['Brand'] as string) || ''
      if (!name) continue
      if (existingKeys.has(`${brand}|${name}`)) {
        skipped++
        continue
      }

      const servingSize = num(p['Serving Size (grams)']) || null
      const servings =
        num(p['Total Servings']) || num(p['Total Servings (per tub)']) || null

      const productData = {
        name,
        brand,
        category: map.slug,
        serving_size: servingSize,
        serving_unit: map.unit,
        servings_per_container: servings ? Math.round(servings) : null,
        source: 'tll_reviewed',
        status: 'active',
      }

      const { data: row, error } = await supabase
        .from('products')
        .insert(productData)
        .select('id')
        .single()

      if (error || !row) {
        console.error(`✗ ${brand} ${name}: ${error?.message}`)
        failed++
        continue
      }

      const nutrients = extractNutrients(p).map((n) => ({ ...n, product_id: row.id }))
      if (nutrients.length) {
        const { error: nErr } = await supabase.from('product_nutrients').insert(nutrients)
        if (nErr) console.error(`  nutrients for ${name}: ${nErr.message}`)
      }
      existingKeys.add(`${brand}|${name}`)
      inserted++
      console.log(`✓ ${brand} ${name} (${nutrients.length} nutrients)`)
    }
  }

  console.log(`\nDone. Inserted ${inserted}, skipped ${skipped} (already present), failed ${failed}.`)
}

seed()
