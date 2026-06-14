// Reconciles live DB products (scripts/_db-dump.json) against Path A data.js and
// emits idempotent re-seed SQL keyed by product id. Read-only / generates files.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_JS = 'C:/Users/tobia/.openclaw/workspace/theliftinglab/webapp/data.js'

const DADB = new Function('window', fs.readFileSync(DATA_JS, 'utf8') + '\nreturn window.DADB;')({})
const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', '_db-dump.json'), 'utf8'))
const active = db.filter((p) => p.status === 'active')

// ---------- helpers ----------
const num = (v) => { if (v == null) return 0; const m = String(v).match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : 0 }
const yes = (v) => /^y/i.test(String(v ?? ''))
const sqlStr = (s) => "'" + String(s).replace(/'/g, "''") + "'"

const BRAND_ALIAS = {
  trainedbyjp: 'tbjp', trainedbyjptbjp: 'tbjp', trainedbyjp_tbjp: 'tbjp',
  theproteinworks: 'theproteinworks', theproteinworkstpw: 'theproteinworks', tpw: 'theproteinworks',
  rawnutritioncbum: 'rawnutrition',
  scienceinsportsis: 'scienceinsport', scienceinsport: 'scienceinsport',
  cnpprofessional: 'cnp',
  stromnutrition: 'stromsportsnutrition',
}
function normBrand(b) {
  let s = String(b || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]/g, '')
  return BRAND_ALIAS[s] || s
}
function normName(n) {
  return String(n || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()
}
function tokens(s) { return new Set(normName(s).split(' ').filter((t) => t && t.length > 1)) }
function jaccard(a, b) {
  const A = tokens(a), B = tokens(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  return inter / (A.size + B.size - inter)
}
function brandMatch(a, b) {
  const x = normBrand(a), y = normBrand(b)
  if (!x || !y) return false
  if (x === y) return true
  if (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x))) return true
  return false
}

// ---------- category map (data.js catKey -> DB slug) ----------
const CAT_SLUG = {
  pre_workouts: 'pre-workout', creatine: 'creatine', eaas: 'eaas', intra_workout: 'intra-workout',
  post_workout: 'post-workout', hydration: 'hydration', cycle_support: 'cycle-support',
  whey_normal: 'whey', whey_isolate: 'whey-isolate', casein: 'casein', protein_bars: 'protein-bar',
  meal_replacement_rtd: 'meal-replacement', vitamins_wellbeing: 'vitamin', hormone_support: 'hormone-support',
  gut_digestion: 'gut-digestion',
}
// DB category slugs that should be treated as the 'vitamin' family for matching
const VITAMIN_FAMILY = new Set(['vitamin', 'vitamin-d', 'vitamin-c', 'magnesium', 'zma', 'omega-3', 'multivitamin'])
function sameCategory(dataCatKey, dbCat) {
  const slug = CAT_SLUG[dataCatKey]
  if (!slug) return false
  if (slug === dbCat) return true
  if (slug === 'vitamin' && VITAMIN_FAMILY.has(dbCat)) return true
  if (dbCat === 'eaa' && slug === 'eaas') return true
  return false
}

// ---------- flatten data.js ----------
const dataProducts = []
for (const [catKey, group] of Object.entries(DADB)) {
  for (const p of group.products || []) {
    if (!p.Name) continue
    dataProducts.push({ catKey, brand: p.Brand || '', name: p.Name, raw: p })
  }
}

// ---------- nutrient extraction ----------
// field key regex -> { name, unit }. unit '' means derive from value.
const NUTRIENT_FIELDS = [
  [/^L-Citrulline dose/i, 'L-Citrulline', 'g'],
  [/^Beta-Alanine dose/i, 'Beta-Alanine', 'g'],
  [/^Caffeine dose/i, 'Caffeine', 'mg'],
  [/^Betaine dose/i, 'Betaine', 'g'],
  [/^L-Tyrosine dose/i, 'L-Tyrosine', 'g'],
  [/^L-Theanine dose/i, 'L-Theanine', 'mg'],
  [/^Taurine dose/i, 'Taurine', 'g'],
  [/^CDP-Choline dose/i, 'CDP-Choline', 'mg'],
  [/^Total EAAs per serving/i, 'EAAs', 'g'],
  [/^EAA dose per serving/i, 'EAAs', 'g'],
  [/^Carb dose per serving/i, 'Carbs', 'g'],
  [/^Carb Source & Dose/i, 'Carbs', 'g'],
  [/^Protein per serving/i, 'Protein', 'g'],
  [/^Protein dose per serving/i, 'Protein', 'g'],
  [/^Protein per bar/i, 'Protein', 'g'],
  [/^Protein per bottle/i, 'Protein', 'g'],
  [/^Sugar per bar/i, 'Sugar', 'g'],
  [/^Sugar per bottle/i, 'Sugar', 'g'],
  [/^Fat per bar/i, 'Fat', 'g'],
  [/^Fat per bottle/i, 'Fat', 'g'],
  [/^Saturated Fat per bar/i, 'Saturated Fat', 'g'],
  [/^Saturated Fat per bottle/i, 'Saturated Fat', 'g'],
  [/^Calories per bar/i, 'Calories', 'kcal'],
  [/^Calories per bottle/i, 'Calories', 'kcal'],
  [/^Sodium dose per serving/i, 'Sodium', 'mg'],
  [/^Potassium dose per serving/i, 'Potassium', 'mg'],
  [/^Magnesium dose per serving/i, 'Magnesium', 'mg'],
  [/^NAC dose per serving/i, 'NAC', 'mg'],
  [/^TUDCA dose per serving/i, 'TUDCA', 'mg'],
  [/^Citrus Bergamot dose per serving/i, 'Citrus Bergamot', 'mg'],
  [/^CoQ10 dose per serving/i, 'CoQ10', 'mg'],
  [/^Omega-3\/DHA dose per serving/i, 'Omega-3/DHA', 'mg'],
  [/^Hawthorn Berry dose per serving/i, 'Hawthorn Berry', 'mg'],
  [/^Astragalus dose per serving/i, 'Astragalus', 'mg'],
]
function extractNutrients(p) {
  const rows = []
  const seen = new Set()
  for (const [key, val] of Object.entries(p)) {
    const def = NUTRIENT_FIELDS.find(([re]) => re.test(key))
    if (!def) continue
    const [, name, unit] = def
    const amount = num(val)
    if (!amount || seen.has(name)) continue
    seen.add(name)
    rows.push({ nutrient_name: name, amount, unit })
  }
  // NOTE: the single "Key Active Ingredient" (vitamins) and "Primary Active"
  // (hormone support) dose rows are deliberately NOT seeded. Their units are
  // inconsistent (IU vs mcg vs compound-vs-elemental mg) and lib/nutrient-limits
  // analyseStack() compares amounts to EFSA ULs WITHOUT unit conversion — so a
  // "Vitamin D3 4000 IU" row would falsely read as 4000% of the 100mcg UL. Per
  // the no-guess / safety guardrail we skip them rather than risk a false flag.
  // (Sports-category structured doses above are unit-consistent and safe.)
  return rows
}

// ---------- match each active DB product ----------
const AUTO = [], REVIEW = [], UNMATCHED = []
for (const d of active) {
  const brandCands = dataProducts.filter((c) => brandMatch(c.brand, d.brand))
  // prefer same-category candidates; fall back to all brand matches only if none
  const sameCat = brandCands.filter((c) => sameCategory(c.catKey, d.category))
  const cands = sameCat.length ? sameCat : brandCands
  const scored = cands.map((c) => {
    const exact = normName(c.name) === normName(d.name)
    return { c, exact, conf: exact ? 1 : jaccard(c.name, d.name) }
  }).sort((a, b) => b.conf - a.conf)
  const best = scored[0] || null
  // ambiguous: 2+ real candidates tie at top confidence but point at different products
  const ambiguous = best && best.conf >= 0.5 && scored.filter(
    (s) => Math.abs(s.conf - best.conf) < 1e-9 && `${s.c.brand}|${s.c.name}` !== `${best.c.brand}|${best.c.name}`,
  ).length > 0
  if (ambiguous) {
    REVIEW.push({ d, best, ambiguous: true })
  } else if (best && (best.exact || best.conf >= 0.55)) {
    AUTO.push({ d, c: best.c.raw, dataBrand: best.c.brand, dataName: best.c.name, conf: best.conf, exact: best.exact })
  } else if (best && best.conf >= 0.3) {
    REVIEW.push({ d, best })
  } else {
    UNMATCHED.push({ d, best })
  }
}

// ---------- build SQL ----------
let sqlFields = `-- reseed-02-product-fields.sql  (idempotent — keyed by product id)
-- Populates retail_price, informed_sport, proprietary_blend, amino_spiked,
-- protein_yield for active products confidently matched to Path A data.js.
-- Run AFTER reseed-01-columns.sql.
BEGIN;
`
let sqlNutri = `-- reseed-03-nutrients.sql  (idempotent — full per-product nutrient breakdown)
-- For each confidently matched product: deletes its existing rows, reinserts the
-- FULL Path A breakdown. Re-runnable. Run AFTER reseed-02-product-fields.sql.
BEGIN;
`
const aliasMap = {} // dbKey -> dataKey (for scoring)
let cFieldRows = 0, cNutriProducts = 0, cNutriRows = 0, cPrice = 0, cIS = 0
for (const m of AUTO) {
  const p = m.c
  const sets = []
  const price = p['Average UK Retail Price (£)']
  if (price != null && num(price) > 0) { sets.push(`retail_price = ${num(price)}`); cPrice++ }
  if (p['Informed Sport'] != null) { const v = yes(p['Informed Sport']); sets.push(`informed_sport = ${v}`); if (v) cIS++ }
  if (p['Proprietary Blend'] != null) sets.push(`proprietary_blend = ${yes(p['Proprietary Blend'])}`)
  const spiked = p['Amino Spiked Flag'] ?? p['Amino Spiked Flag (Yes/No)']
  if (spiked != null) sets.push(`amino_spiked = ${yes(spiked)}`)
  const py = p['Protein Yield Percentage']
  if (py != null && num(py) > 0) sets.push(`protein_yield = ${num(py)}`)
  if (sets.length) {
    sqlFields += `UPDATE public.products SET ${sets.join(', ')} WHERE id = ${sqlStr(m.d.id)}; -- ${m.dataBrand} ${m.dataName}\n`
    cFieldRows++
  }
  const nutrients = extractNutrients(p)
  if (nutrients.length) {
    sqlNutri += `DELETE FROM public.product_nutrients WHERE product_id = ${sqlStr(m.d.id)};\n`
    for (const n of nutrients) {
      sqlNutri += `INSERT INTO public.product_nutrients (product_id, nutrient_name, amount, unit) VALUES (${sqlStr(m.d.id)}, ${sqlStr(n.nutrient_name)}, ${n.amount}, ${sqlStr(n.unit)});\n`
      cNutriRows++
    }
    cNutriProducts++
  }
  // alias for scoring if DB key differs from data.js key
  const dbKey = `${m.d.brand || ''}|${m.d.name}`
  const dataKey = `${m.dataBrand || ''}|${m.dataName}`
  if (dbKey !== dataKey) aliasMap[dbKey] = dataKey
}
sqlFields += 'COMMIT;\n'
sqlNutri += 'COMMIT;\n'

fs.writeFileSync(path.join(ROOT, 'scripts', 'reseed-02-product-fields.sql'), sqlFields)
fs.writeFileSync(path.join(ROOT, 'scripts', 'reseed-03-nutrients.sql'), sqlNutri)
fs.writeFileSync(path.join(ROOT, 'scripts', 'score-aliases.json'), JSON.stringify(aliasMap, null, 2))

// review/unmatched reports
const reviewTxt = REVIEW.map((r) => `${r.d.category} | DB: ${r.d.brand} | ${r.d.name}  ~?~  data.js: ${r.best.c.brand} | ${r.best.c.name}  (conf ${r.best.conf.toFixed(2)}${r.ambiguous ? ', AMBIGUOUS — multiple equal matches' : ''})`).join('\n')
const unmatchedTxt = UNMATCHED.map((r) => `${r.d.category} | ${r.d.brand} | ${r.d.name}${r.best ? `  (closest: ${r.best.c.brand} | ${r.best.c.name} ${r.best.conf.toFixed(2)})` : ''}`).join('\n')
fs.writeFileSync(path.join(ROOT, 'scripts', '_review-matches.txt'), reviewTxt)
fs.writeFileSync(path.join(ROOT, 'scripts', '_unmatched.txt'), unmatchedTxt)

console.log(`active=${active.length}`)
console.log(`AUTO matched=${AUTO.length}  REVIEW=${REVIEW.length}  UNMATCHED=${UNMATCHED.length}`)
console.log(`field UPDATE rows=${cFieldRows}  price set=${cPrice}  informed_sport=true=${cIS}`)
console.log(`nutrient products=${cNutriProducts}  nutrient rows=${cNutriRows}`)
console.log(`scoring aliases=${Object.keys(aliasMap).length}`)
console.log(`exact matches=${AUTO.filter(m=>m.exact).length}  fuzzy auto=${AUTO.filter(m=>!m.exact).length}`)
