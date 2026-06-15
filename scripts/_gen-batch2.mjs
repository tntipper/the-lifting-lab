import { readFileSync, writeFileSync } from 'node:fs'
const DATA_JS = 'C:/Users/tobia/.openclaw/workspace/theliftinglab/webapp/data.js'
const DADB = new Function('window', readFileSync(DATA_JS, 'utf8') + '\nreturn window.DADB;')({})
const idx = {}
for (const cat in DADB) for (const p of DADB[cat].products || []) idx[(p.Brand || '') + '||' + (p.Name || '')] = { cat, brand: p.Brand, name: p.Name }

const AWIN = (u) => `https://www.awin1.com/cread.php?awinmid=4822&awinaffid=2919631&ued=${encodeURIComponent(u)}`

// [brand, name, url, isBulk]
const D = [
  ['Optimum Nutrition', 'Platinum Pre-Workout', 'https://www.optimumnutrition.com/en-gb/products/platinum-pre-workout-powder'],
  ['Optimum Nutrition', 'Micronised Creatine Powder', 'https://www.optimumnutrition.com/en-gb/products/micronised-creatine-powder'],
  ['Optimum Nutrition', 'Platinum Creatine Plus', 'https://www.optimumnutrition.com/en-gb/products/platinum-creatine-plus-powder'],
  ['Optimum Nutrition', 'Essential Amino Energy', 'https://www.optimumnutrition.com/en-gb/products/essential-amino-energy-powder'],
  ['Optimum Nutrition', 'Essential Amino Energy Elite', 'https://www.optimumnutrition.com/en-gb/products/essential-amino-energy-elite'],
  ['Optimum Nutrition', 'Serious Mass', 'https://www.optimumnutrition.com/en-gb/products/serious-mass-weight-gainer-protein-powder-eu'],
  ['Optimum Nutrition', 'Electrolyte Powder', 'https://www.optimumnutrition.com/en-gb/products/electrolyte-powder'],
  ['Optimum Nutrition', 'Gold Standard 100% Isolate', 'https://www.optimumnutrition.com/en-gb/products/gold-standard-100-isolate-whey-protein-powder-eu'],
  ['Optimum Nutrition', 'Platinum Hydrowhey', 'https://www.optimumnutrition.com/en-gb/products/platinum-hydrowhey-hydrolysed-whey-protein-powder-eu'],
  ['Optimum Nutrition', 'Gold Standard 100% Casein', 'https://www.optimumnutrition.com/en-gb/products/gold-standard-100-casein-protein-powder-eu'],
  ['The Formula', 'NEUPHORIC', 'https://www.theformula.shop/products/neuphoric'],
  ['JYM Supplement Science', 'Pre JYM', 'https://jymsupplementscience.com/products/pre-jym-preworkout'],
  ['MyProtein', 'Origin Pre-Workout', 'https://www.myprotein.com/p/sports-nutrition/origin-pre-workout/12941037/'],
  ['MyProtein', 'Origin Pump Pre-Workout | Stim & Caffeine-Free', 'https://www.myprotein.com/p/sports-nutrition/origin-pre-workout-pump-stim-free/14269805/'],
  ['MyProtein', 'Impact EAA', 'https://www.myprotein.com/p/sports-nutrition/impact-eaa/11985042/'],
  ['MyProtein', 'Impact Whey Isolate', 'https://www.myprotein.com/p/sports-nutrition/impact-whey-isolate-powder/10530911/'],
  ['MyProtein', 'Micellar Casein', 'https://www.myprotein.com/p/sports-nutrition/micellar-casein-batch-tested-range/10872832/'],
  ['MyProtein', 'Prebiotic Inulin Fibre Powder', 'https://www.myprotein.com/p/vitamins/prebiotic-inulin-fibre/11397387/'],
  ['MyProtein', 'Creapure Creatine', 'https://www.myprotein.com/p/sports-nutrition/the-creatine-creapure/10529740/'],
  ['MyProtein', 'Impact Hydration', 'https://www.myprotein.com/p/sports-nutrition/impact-hydrate/15494789/'],
  ['MyProtein', 'Clear Whey Isolate', 'https://www.myprotein.com/p/sports-nutrition/clear-whey-isolate/12095867/'],
  ['Myprotein', 'Crispy Layered Bar (White Chocolate Peanut)', 'https://www.myprotein.com/p/sports-nutrition/crispy-layered-protein-bar/12856629/'],
  ['Bio-Synergy', 'Creatine Plus®', 'https://bio-synergy.uk/product/bio-synergy-creatine-plus-strength/'],
  ['Bio-Synergy', 'Whey Hey®', 'https://bio-synergy.uk/products/bio-synergy-whey-hey'],
  ['Bio-Synergy', 'Whey Better®', 'https://bio-synergy.uk/products/bio-synergy-whey-better'],
  ['Bio-Synergy', 'After Dark Protein', 'https://bio-synergy.uk/products/bio-synergy-afterdark-protein'],
  ['Warrior', 'Rage', 'https://teamwarrior.com/products/warrior-rage-pre-workout-powder'],
  ['Warrior', 'Whey Protein', 'https://teamwarrior.com/products/warrior-whey-protein-1kg'],
  ['Warrior', 'Clear Whey Isolate', 'https://teamwarrior.com/products/warrior-clear-whey-protein-isolate-powder-375g'],
  ['Warrior', 'Crunch Protein Bar', 'https://teamwarrior.com/products/warrior-crunch-protein-bars-12s'],
  ['Bulk', 'Creapure', 'https://www.bulk.com/uk/products/creapure-creatine-monohydrate/bpb-crea-0000', true],
  ['Bulk', 'Aftermath', 'https://www.bulk.com/uk/products/aftermath/bpps-amat', true],
  ['Bulk', 'Electrolyte Powder', 'https://www.bulk.com/uk/products/electrolyte-powder/bpb-elec-0000', true],
  ['Bulk', 'Pure Whey Protein', 'https://www.bulk.com/uk/products/pure-whey-protein/bpb-wpc8-0000', true],
  ['Bulk', 'Micellar Casein', 'https://www.bulk.com/uk/products/micellar-casein/bpb-mpi9-0000', true],
  ['Bulk', 'Macro Munch (Chocolate Hazelnut)', 'https://www.bulk.com/uk/products/macro-munch-protein-bar-v2/mmun-pbar-v2', true],
  ['Bulk', 'ZMA', 'https://www.bulk.com/uk/products/zma-capsules/bpb-zma-0000', true],
  ['Bulk', 'Psyllium Husk Powder', 'https://www.bulk.com/uk/products/psyllium-husks-powder/bpb-phus-0000', true],
  ['Strom Sports Nutrition', 'Creapure', 'https://www.stromsports.com/products/strom-presents-creamax-with-patented-creapure'],
  ['Strom Sports Nutrition', 'SupportMAX', 'https://www.stromsports.com/products/strom-presents-supportmax'],
  ['Grenade', 'Carb Killa (Chocolate Chip Salted Caramel)', 'https://www.grenade.com/products/protein-bar-chocolate-salted-caramel'],
  ['PhD Nutrition', 'Smart Bar (Cookies & Cream)', 'https://www.phd.com/phd-smart-bar-cookies-cream-12-x-64g'],
  ['Naughty Boy', 'Menace', 'https://naughtyboylifestyle.com/products/naughty-boy-menace-pre-workout'],
  ['Naughty Boy', 'Amino', 'https://naughtyboylifestyle.com/products/naughty-boy-amino-eaa'],
  ['Naughty Boy', 'Life Pac / Life Support', 'https://naughtyboylifestyle.com/products/naughty-boy-prime-life-pac'],
  ['TrainedByJP', 'Prepare', 'https://www.tb-jp.com/products/prepare-pro'],
  ['TrainedByJP', 'JP EAA', 'https://www.tb-jp.com/products/jp-eaa-1kg'],
  ['TrainedByJP', 'JP Hydration', 'https://www.tb-jp.com/products/peak-hydration'],
  ['TrainedByJP', 'Vital Support', 'https://www.tb-jp.com/products/vital-support'],
  ['TBJP', 'JP Creatine', 'https://www.tb-jp.com/products/creatine'],
  ['Trained by JP (TBJP)', 'Iso-Pro', 'https://www.tb-jp.com/products/jp-whey-isopro-2kg'],
  ['HR Labs', 'Hydro', 'https://hr-labs.co.uk/products/hydro-eaa'],
  ['Supplement Needs', 'Advanced Liver Support', 'https://www.supplementneeds.co.uk/products/supplement-needs-advanced-liver-support-stack'],
  ['Supplement Needs', 'Probiotics 50 Billion CFU', 'https://www.supplementneeds.co.uk/products/supplement-needs-probiotics-50-billion-cfus'],
  ['Supplement Needs', 'Sleep Stack', 'https://www.supplementneeds.co.uk/products/supplement-needs-sleep-stack-2-month-supply'],
  ['Applied Nutrition', 'ZMA Pro', 'https://appliednutrition.uk/products/zma-pro'],
  ['Science in Sport (SiS)', 'REGO Rapid Recovery', 'https://www.scienceinsport.com/rego-rapid-recovery-powder-1-5kg-strawberry'],
  ['Science In Sport (SiS)', 'Go Hydro', 'https://www.scienceinsport.com/go-hydro-20-tablets-beere'],
  ['Ghost Lifestyle', 'Ghost Hydration', 'https://uk.ghostlifestyle.com/products/ghost-hydration'],
  ['High5', 'Zero', 'https://highfive.co.uk/products/zero'],
  ['Precision Hydration', 'PH 1000', 'https://www.precisionhydration.com/products/ph-1000-low-calorie-electrolyte-supplement'],
  ['Ghost', 'Whey', 'https://uk.ghostlifestyle.com/products/ghost-whey'],
  ['The Protein Works', 'Whey Protein 80', 'https://www.theproteinworks.com/whey-protein-80-concentrate'],
  ['The Protein Works (TPW)', '100% Micellar Casein', 'https://www.theproteinworks.com/casein-protein'],
  ['Barebells', 'Protein Bar (Cookies & Cream)', 'https://barebells.co.uk/product/barebells-cookies-and-cream/'],
  ['Fulfil Nutrition', 'Vitamin & Protein Bar (Dark Choc Salted Caramel)', 'https://fulfilnutrition.com/products/dark-chocolate-salted-caramel'],
  ['Trek', 'Protein Flapjack (Cocoa Oat)', 'https://www.trekbars.com/products/protein-flapjacks/protein-flapjacks-cocoa-oat/'],
  ['Huel', 'Ready-to-drink (Vanilla)', 'https://uk.huel.com/products/huel-ready-to-drink/vanilla'],
  ['Huel', 'Black Edition Ready-to-drink (Chocolate)', 'https://uk.huel.com/products/huel-black-edition-ready-to-drink/chocolate'],
  ['Huel', 'Lite Ready-to-drink (Chocolate)', 'https://uk.huel.com/products/huel-lite-ready-to-drink'],
  ['Saturo', 'Meal Replacement Drink (Chocolate)', 'https://saturo.com/en-gb/products/ready-to-drink-meal'],
  ['Jimmy Joy', 'Plenny Drink (Vanilla)', 'https://jimmyjoy.com/en-gb/products/plenny-drink'],
  ['SuperDosed', 'Magnesium Glycinate', 'https://superdosed.co.uk/products/magnesium-glycinate-superdosed'],
  ['SuperDosed', 'Tongkat Ali', 'https://superdosed.co.uk/products/tongkat-ali-superdosed'],
  ['SuperDosed', 'Ashwagandha', 'https://superdosed.co.uk/products/ashwaganda-superdosed'],
  ['Roar Ambition', 'TestoFuel', 'https://www.testofuel.com/en-gb/testofuel-1-month'],
  ['Roar Ambition', 'Prime Male', 'https://www.primemale.com/en-gb/primemale-1-month'],
  ['Hunter Evolve', 'Hunter Test', 'https://www.hunterevolve.com/en-gb/hunter-test'],
  ['MuscleClub Ltd', 'TestoGen', 'https://testogen.com/products/testogen'],
  ['Optibac', 'Probiotics for Every Day', 'https://www.optibacprobiotics.com/uk/product/for-every-day-90-capsules'],
  ['Optibac', 'Every Day EXTRA', 'https://www.optibacprobiotics.com/uk/product/for-every-day-extra-strength-90-capsules'],
  ['Optibac', 'Every Day MAX', 'https://www.optibacprobiotics.com/product/for-every-day-max-30-capsules'],
  ['Optibac', 'Bifido & Fibre', 'https://www.optibacprobiotics.com/product/bifidobacteria-fibre-30-sachets'],
  ['Bio-Kult', 'Everyday Gut (Original)', 'https://www.bio-kult.com/p/everyday-gut/13412724/'],
  ['PrecisionBiotics', 'Alflorex', 'https://www.precisionbiotics.co.uk/p/alflorex-original-daily-gut-supplement-30-capsules/13444442/'],
  ['Symprove', 'Symprove Original', 'https://www.symprove.com/products/symprove-4-week-pack-original'],
  ['Dark Labs', 'Crack OG', 'https://darklabs.pro/p/crack-og-40-servings/'],
]

const sql = (s) => "'" + String(s).replace(/'/g, "''") + "'"
const errs = []
const lines = [
  '-- populate-buy-urls-batch2.sql',
  '-- Pre-launch data-quality pass #2: newly-resolved DIRECT product-page URLs.',
  '-- Every URL was fetch-verified (brand own-store) or WebSearch-confirmed live (Bulk).',
  '-- Bulk links are Awin deeplinks (awinmid=4822, awinaffid=2919631) per lib/affiliate.ts.',
  '-- Brand-store links are bare (those brands have no affiliate program wired).',
  '-- Idempotent. Run in Supabase SQL Editor AFTER add-buy-url.sql + populate-buy-urls.sql.',
  '',
]
let n = 0
for (const [brand, name, url, isBulk] of D) {
  if (!idx[brand + '||' + name]) { errs.push(`NO MATCH: ${brand} || ${name}`); continue }
  const final = isBulk ? AWIN(url) : url
  lines.push(`UPDATE public.products SET buy_url = ${sql(final)} WHERE brand = ${sql(brand)} AND name = ${sql(name)};`)
  n++
}
lines.push('', `-- ${n} direct URLs emitted.`, '')
if (errs.length) { console.error('MISMATCHES (fix before using):\n' + errs.join('\n')); process.exit(1) }
writeFileSync('scripts/populate-buy-urls-batch2.sql', lines.join('\n'))
console.log(`OK wrote scripts/populate-buy-urls-batch2.sql with ${n} statements`)
