// Per-category scoring methodology — the clinical reference spec surfaced in the
// "How We Score" modal. Ported verbatim from Path A's METHODOLOGY object
// (theliftinglab/webapp/index.html, read-only reference — never edited there).
//
// CATEGORY_TO_METHODOLOGY maps Supabase `category` slugs onto these keys. The
// mapping mirrors which Path A scorer actually scored each product cluster, so
// the spec shown always matches the formula behind the scores.

export type MethodologyRow = { ingredient: string; target: string; weight: string }

export type Methodology = {
  blurb: string
  rows: MethodologyRow[]
  notes: string[]
}

const r = (ingredient: string, target: string, weight: string): MethodologyRow => ({ ingredient, target, weight })

export const METHODOLOGY: Record<string, Methodology> = {
  pre_workouts: {
    blurb:
      'Scored dose-for-dose vs an evidence-defined perfect pre-workout. Core actives carry 85%; 15% covers secondaries. Every claim on this site is backed by peer-reviewed evidence — not manufacturer studies.',
    rows: [
      r('L-Citrulline (pure)', '8,000mg', '35%'),
      r('Beta-Alanine', '3,200mg', '25%'),
      r('Caffeine', '200–400mg sweet spot', '25%'),
      r('Betaine Anhydrous', '2,500mg', '3%'),
      r('L-Tyrosine (not NALT)', '2,000mg', '3%'),
      r('L-Theanine', '200mg', '3%'),
      r('Taurine', '2,000mg', '3%'),
      r('CDP-Choline', '300mg+', '3%'),
    ],
    notes: [
      'Caffeine outside 200–400mg is penalised in both directions — underdosed and overdosed.',
      'Proprietary blends hide doses. We apply a 15% score penalty and flag it red — transparency is rewarded.',
      'Pure L-Citrulline only. Citrulline Malate labels inflate the headline number: in a 2:1 malate blend, only 66% of the stated dose is actual citrulline. We convert and score the real dose.',
      'N-Acetyl-L-Tyrosine (NALT) is a common cheap substitute for L-Tyrosine. Studies show it converts poorly in the body and does not raise plasma tyrosine levels effectively. Products using NALT score at 50% of the tyrosine weight.',
      'Alpha-GPC is an unauthorised novel food in the UK — brands cannot legally use it in supplements. We score CDP-Choline, the compliant and functionally equivalent alternative.',
      'Dual caffeine matrix (anhydrous + slow-release DiCaffeine Malate) is flagged as a positive — it smooths the energy curve and reduces crash risk. It does not change the caffeine score.',
    ],
  },
  intra_workout: {
    blurb: 'The ideal intra keeps you training: full EAAs, premium fast carbs, and hydration.',
    rows: [
      r('EAAs', '14g', '50%'),
      r('Carbs (Cluster Dextrin/HBCD)', '35g', '30%'),
      r('Hydration / osmolytes', 'present', '20%'),
    ],
    notes: ['Standard/cheap carb sources score at 70% of the carb weight.'],
  },
  post_workout: {
    blurb: 'The ideal recovery shake refuels and rebuilds: high protein, replenishing carbs, real recovery agents.',
    rows: [
      r('Protein', '40g', '45%'),
      r('Carbs (~2:1 refuel)', '70g', '30%'),
      r('Recovery agents (creatine, glutamine...)', '4+', '25%'),
    ],
    notes: [],
  },
  eaas: {
    blurb:
      "The ideal EAA product delivers all nine essential amino acids at a meaningful dose. BCAAs alone are not EAAs — they're missing six essentials your body cannot synthesise.",
    rows: [
      r('Full-spectrum EAAs (all 9)', '10g+', '60%'),
      r('Complete spectrum (not BCAA-only)', 'all 9', '35%'),
      r('Added hydration / osmolytes', 'present', '5%'),
    ],
    notes: [
      'BCAA-only products score zero on the spectrum weight — three aminos marketed as nine is a false claim.',
      'Hydration is a nice bonus, not the reason you buy an EAA product — weighted accordingly at 5%.',
    ],
  },
  cycle_support: {
    blurb:
      'We score only the five ingredients with the strongest evidence for organ and cardiovascular protection. A long ingredient list with token doses of unproven herbs is a warning sign, not a selling point.',
    rows: [
      r('NAC (N-Acetyl Cysteine)', '600mg', '40%'),
      r('TUDCA', '250mg', '30%'),
      r('Citrus Bergamot (40%+ polyphenols)', '500mg', '15%'),
      r('CoQ10', '100mg', '10%'),
      r('Omega-3 / DHA', '1,000mg', '5%'),
    ],
    notes: [
      "No TUDCA is flagged red — it's the key liver protection agent.",
      'Proprietary blends on cycle support products are a serious red flag — hidden doses means you cannot verify protection. -15% score penalty applied.',
      "Many products add turmeric, milk thistle, or antioxidant blends at token doses to appear comprehensive. We don't score these — efficacy at typical supplement doses is unproven.",
    ],
  },
  whey_normal: {
    blurb: 'Purity-weighted: true protein per gram is the dose, not tub weight. Spiking is the cardinal sin.',
    rows: [
      r('Protein purity (yield)', '82%', '45%'),
      r('No amino-spiking', 'clean', '35%'),
      r('Value (£/100g protein)', '≤£1.50', '20%'),
    ],
    notes: ['Amino-spiking scores zero on the clean weight.'],
  },
  whey_isolate: {
    blurb: 'Purity-weighted to the isolate benchmark - higher bar than standard whey.',
    rows: [
      r('Protein purity (yield)', '90%', '45%'),
      r('No amino-spiking', 'clean', '35%'),
      r('Value (£/100g protein)', '≤£1.50', '20%'),
    ],
    notes: ['Amino-spiking scores zero on the clean weight.'],
  },
  casein: {
    blurb: 'Purity-weighted slow-release protein - micellar quality and an honest label.',
    rows: [
      r('Protein purity (yield)', '80%', '45%'),
      r('No amino-spiking', 'clean', '35%'),
      r('Value (£/100g protein)', '≤£1.50', '20%'),
    ],
    notes: [],
  },
  creatine: {
    blurb:
      'Creatine monohydrate is the most researched supplement in existence. The only variables that matter are price per effective dose and purity verification.',
    rows: [
      r('Value (£ per 5g dose)', '£0.18', '55%'),
      r('Purity (Creapure® or equivalent)', 'verified', '45%'),
    ],
    notes: [
      'Generic monohydrate is chemically identical to Creapure® in most cases — the small score gap reflects unverified purity, not proven inferiority.',
      "5g is the effective dose. Products dosed below this are flagged — you'll need more than one scoop to hit the threshold.",
      'Creatine HCl, Kre-Alkalyn and other "superior" forms have no meaningful advantage over monohydrate at effective doses. Marketing over evidence.',
    ],
  },
  hydration: {
    blurb:
      'The ideal electrolyte replaces what you lose through sweat — primarily sodium, supported by potassium and magnesium. No sugar needed.',
    rows: [
      r('Sodium', '1,000mg', '45%'),
      r('Potassium', '200mg', '15%'),
      r('Magnesium', '60mg', '15%'),
      r('No added sugar (or under 5g)', '<5g', '25%'),
    ],
    notes: [
      'Products with ≥800mg sodium carry a caution flag — appropriate for heavy sweating and sport, but check with your GP if you have blood pressure concerns.',
      'Added sugar above 5g (one teaspoon) incurs a 15% reduction on the sugar weight. Under 5g is not penalised.',
      'Sports drinks with high sugar are hydration products in name only — the sugar load undermines the electrolyte benefit for most users.',
    ],
  },
  protein_bars: {
    blurb:
      "The ideal protein bar hits a clean 15–20g of protein for a snack-sized dose, keeps sugar and fat low, and doesn't make you pay a premium per bar. Palm oil is flagged for transparency but not scored.",
    rows: [
      r('Protein dose (15–20g range)', '15–20g', '50%'),
      r('Value (price per bar)', '≤£2.00', '25%'),
      r('Sugar', '≤5g', '15%'),
      r('Fat', '≤10g', '10%'),
    ],
    notes: [
      "Protein in the 15–20g window scores full marks; below 15g is penalised proportionally — more isn't penalised.",
      'Sugar above 5g and fat above 10g are penalised progressively.',
      'Palm oil is flagged for transparency only — it carries no score penalty.',
    ],
  },
  meal_replacement_rtd: {
    blurb:
      'A ready-to-drink meal should deliver a real protein hit, complete micronutrition, a sensible calorie band and clean fats — at a fair price per gram of protein. Artificial sweeteners are flagged, not scored.',
    rows: [
      r('Protein', '25g+', '40%'),
      r('Value (price per g protein)', '≤£0.15/g', '25%'),
      r('Micronutrient completeness', '26/26 at ≥20% NRV', '10%'),
      r('Calorie band', '200–550 kcal', '10%'),
      r('Fat quality (% unsaturated)', 'higher = better', '10%'),
      r('Sugar', '≤8g', '5%'),
    ],
    notes: [
      'Protein at 25g+ scores full marks; below 20g is penalised.',
      'Micronutrient completeness counts vitamins/minerals hitting ≥20% NRV per bottle, out of 26.',
      'Calories outside the 200–550 kcal band are penalised in both directions.',
      'Fat quality rewards a higher unsaturated share; omega-3 sources are flagged as a positive.',
      'Artificial sweeteners are flagged for transparency only — no score penalty.',
    ],
  },
  vitamins_wellbeing: {
    blurb:
      'We score vitamins and wellbeing products on dose-per-pound against evidence-based targets: bioavailable forms, meaningful doses, and no padding with underdosed token ingredients.',
    rows: [
      r('Value (cost per day)', '≤£0.50/day', '40%'),
      r('Dose completeness (% RDA/NRV)', '≥100% key nutrients', '35%'),
      r('Form quality (bioavailability)', 'active/chelated forms', '25%'),
    ],
    notes: [
      'Active forms (methylfolate, methylcobalamin, chelated minerals) score higher than cheap oxide/cyanocobalamin equivalents.',
      'Products hiding doses in proprietary blends are penalised.',
      'OTC only — no prescription-only substances scored.',
    ],
  },
  hormone_support: {
    blurb:
      'Natural OTC hormone support rated on evidence quality and value. We score only ingredients with meaningful human trial data — not every herb on the label.',
    rows: [
      r('Evidence-backed dose', 'peer-reviewed threshold', '50%'),
      r('Value (cost per day)', '≤£1.00/day', '30%'),
      r('Formula transparency', 'no prop blends', '20%'),
    ],
    notes: [
      'Testosterone-support claims require human RCT evidence at the scored dose — animal data does not count.',
      'SARMs, prohormones, and any prescription-only compound are excluded from this category entirely.',
      'Ashwagandha, Tongkat Ali, Boron, and Zinc are the four ingredients with the strongest human evidence — products scoring here lead on these.',
    ],
  },
  gut_digestion: {
    blurb:
      'A mixed category — probiotics, digestive enzymes, prebiotic fibre and ACV — so every product is scored against the evidence target for its own type. Efficacy carries 65%, true value 25%, and label transparency 10%.',
    rows: [
      r('Probiotics: live cultures', '≥10bn CFU', '65% (efficacy)'),
      r('Probiotics: named strains', '≥5 strains', 'within efficacy'),
      r('Digestive enzymes: spectrum', '4+ enzyme classes', 'within efficacy'),
      r('Prebiotic fibre (inulin/FOS)', '≥3g', 'within efficacy'),
      r('Apple Cider Vinegar', '≥500mg acetic acid', 'within efficacy'),
      r('Value (cost per serving)', 'type-specific benchmark', '25%'),
      r('Label transparency', 'no prop blends', '10%'),
    ],
    notes: [
      'Probiotics are scored on both CFU count and strain diversity — a single mega-dosed strain is not the same as a broad multi-strain formula. Shelf-stable / enteric formulas get a small survivability bonus.',
      'Digestive enzymes are scored on breadth (number of enzyme classes); most labels do not disclose activity units (FCC/DU), so we flag that rather than guess.',
      'Prebiotic fibre targets ≥3g inulin/FOS (or ≥5g psyllium) per serving. Synbiotics are rewarded for pairing live cultures with a real prebiotic fibre dose.',
      'Apple Cider Vinegar is scored on actual acetic acid content — the active compound — not headline "ACV equivalent" numbers.',
      'Proprietary blends hide doses and are penalised. Informational only — not medical advice.',
    ],
  },
}

// Supabase category slug -> methodology key. Grounded in which Path A scorer
// actually scored each product cluster (see lib/scores.ts ordering).
const CATEGORY_TO_METHODOLOGY: Record<string, string> = {
  'pre-workout': 'pre_workouts',
  'intra-workout': 'intra_workout',
  'post-workout': 'post_workout',
  eaas: 'eaas',
  'cycle-support': 'cycle_support',
  'liver-health': 'cycle_support',
  whey: 'whey_normal',
  'whey-isolate': 'whey_isolate',
  casein: 'casein',
  creatine: 'creatine',
  hydration: 'hydration',
  'protein-bar': 'protein_bars',
  'meal-replacement': 'meal_replacement_rtd',
  vitamin: 'vitamins_wellbeing',
  multivitamin: 'vitamins_wellbeing',
  'vitamin-d': 'vitamins_wellbeing',
  'vitamin-c': 'vitamins_wellbeing',
  magnesium: 'vitamins_wellbeing',
  'omega-3': 'vitamins_wellbeing',
  'joint-health': 'vitamins_wellbeing',
  'heart-health': 'vitamins_wellbeing',
  'sleep-recovery': 'vitamins_wellbeing',
  'hormone-support': 'hormone_support',
  zma: 'hormone_support',
  'gut-digestion': 'gut_digestion',
}

export function methodologyFor(slug: string | null | undefined): Methodology | null {
  if (!slug) return null
  const key = CATEGORY_TO_METHODOLOGY[slug]
  return key ? METHODOLOGY[key] ?? null : null
}

// Ordered index of every distinct methodology block, with a display title and a
// representative category slug (so each block can deep-link to its buyer's guide
// / browse view). Drives the crawlable /methodology page — one entry per unique
// reference spec, deduped from CATEGORY_TO_METHODOLOGY's many-to-one mapping.
export type MethodologyIndexEntry = { key: string; title: string; categorySlug: string }

export const METHODOLOGY_INDEX: MethodologyIndexEntry[] = [
  { key: 'pre_workouts', title: 'Pre-Workout', categorySlug: 'pre-workout' },
  { key: 'creatine', title: 'Creatine', categorySlug: 'creatine' },
  { key: 'whey_normal', title: 'Whey Protein', categorySlug: 'whey' },
  { key: 'whey_isolate', title: 'Whey Isolate', categorySlug: 'whey-isolate' },
  { key: 'casein', title: 'Casein', categorySlug: 'casein' },
  { key: 'eaas', title: 'EAAs', categorySlug: 'eaas' },
  { key: 'intra_workout', title: 'Intra-Workout', categorySlug: 'intra-workout' },
  { key: 'post_workout', title: 'Post-Workout', categorySlug: 'post-workout' },
  { key: 'hydration', title: 'Hydration & Electrolytes', categorySlug: 'hydration' },
  { key: 'protein_bars', title: 'Protein Bars', categorySlug: 'protein-bar' },
  { key: 'meal_replacement_rtd', title: 'Meal Replacements & RTDs', categorySlug: 'meal-replacement' },
  { key: 'cycle_support', title: 'Cycle Support & Organ Health', categorySlug: 'cycle-support' },
  { key: 'vitamins_wellbeing', title: 'Vitamins & Wellbeing', categorySlug: 'vitamin' },
  { key: 'hormone_support', title: 'Hormone Support', categorySlug: 'hormone-support' },
  { key: 'gut_digestion', title: 'Gut & Digestion', categorySlug: 'gut-digestion' },
]
