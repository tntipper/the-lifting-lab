// Supplement combination checker — "can I take X with Y together?".
// Pure, DB-free, deterministic logic so the surface can never fail at runtime.
// Scope is strictly supplement-with-supplement combining for healthy adults;
// drug interactions and medical conditions are deliberately out of scope and
// always deferred to a clinician in the UI copy.

export type ComboLevel = 'good' | 'watch' | 'caution'

export type Supplement = {
  key: string
  label: string
  // one-line description shown under the chip / in the picker
  blurb: string
  // carries a meaningful dose of caffeine (drives the total-caffeine flag)
  caffeine?: boolean
  // commonly bundled inside pre-workout blends (drives double-dose notes)
  inPreWorkout?: boolean
}

// The common supplements people actually ask about combining. Order is the
// display order in the picker.
export const SUPPLEMENTS: Supplement[] = [
  { key: 'creatine', label: 'Creatine', blurb: 'Daily saturation supplement for strength and power.' },
  { key: 'whey', label: 'Whey protein', blurb: 'Fast-digesting complete protein.' },
  { key: 'casein', label: 'Casein', blurb: 'Slow-digesting complete protein.' },
  { key: 'pre-workout', label: 'Pre-workout', blurb: 'Stimulant blend, usually caffeine plus pump ingredients.', caffeine: true },
  { key: 'caffeine', label: 'Caffeine / coffee', blurb: 'Standalone stimulant — pills, coffee or energy drinks.', caffeine: true },
  { key: 'citrulline', label: 'L-Citrulline', blurb: 'Pump and blood-flow ingredient.', inPreWorkout: true },
  { key: 'beta-alanine', label: 'Beta-alanine', blurb: 'Endurance ingredient — causes the tingles.', inPreWorkout: true },
  { key: 'eaa', label: 'EAAs / BCAAs', blurb: 'Free-form amino acids.' },
  { key: 'vitamin-d', label: 'Vitamin D', blurb: 'Fat-soluble vitamin for bone and immune health.' },
  { key: 'multivitamin', label: 'Multivitamin', blurb: 'Broad vitamin and mineral blend.' },
  { key: 'omega-3', label: 'Omega-3 / fish oil', blurb: 'Fat-soluble EPA and DHA.' },
  { key: 'magnesium', label: 'Magnesium / ZMA', blurb: 'Evening mineral for sleep and recovery.' },
  { key: 'ashwagandha', label: 'Ashwagandha', blurb: 'Adaptogen for stress and recovery.' },
  { key: 'collagen', label: 'Collagen', blurb: 'Connective-tissue protein — low in key aminos.' },
]

export const SUPPLEMENT_BY_KEY: Record<string, Supplement> = Object.fromEntries(
  SUPPLEMENTS.map((s) => [s.key, s]),
)

export type ComboVerdict = {
  a: string
  b: string
  level: ComboLevel
  note: string
}

export type ComboFlag = {
  level: ComboLevel
  title: string
  note: string
}

export type ComboResult = {
  pairs: ComboVerdict[]
  flags: ComboFlag[]
  summary: { good: number; watch: number; caution: number }
}

// Unordered pair key so a|b and b|a resolve to the same rule.
export function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|')
}

type Rule = { level: ComboLevel; note: string }

// Specific pair rules. Anything not listed falls back to the honest default:
// no known negative interaction. Notes are evidence-based and clinician-safe.
const RULES: Record<string, Rule> = {
  [pairKey('creatine', 'caffeine')]: {
    level: 'good',
    note: 'Myth-buster: the idea that caffeine cancels out creatine came from one dated study and has not held up. At normal doses they are fine together — most pre-workouts contain both by design.',
  },
  [pairKey('creatine', 'pre-workout')]: {
    level: 'watch',
    note: 'Great pairing, but many pre-workouts already include creatine — often underdosed. Check the label so you are not double-dosing, and top up to 3 to 5g total if your pre-workout falls short.',
  },
  [pairKey('caffeine', 'pre-workout')]: {
    level: 'caution',
    note: 'Both are caffeine sources. Stacking a scoop of pre-workout on top of coffee or a caffeine pill can push you well past a sensible dose. Add up the total and keep it in check.',
  },
  [pairKey('citrulline', 'pre-workout')]: {
    level: 'watch',
    note: 'Most pre-workouts already contain citrulline, frequently in a 2:1 malate blend that is under the effective 6 to 8g. Check the label before adding a standalone scoop so you know your real total.',
  },
  [pairKey('beta-alanine', 'pre-workout')]: {
    level: 'watch',
    note: 'Beta-alanine is a standard pre-workout ingredient — it causes the skin tingles. See what your pre-workout already provides before adding more; the target is 4 to 6g a day total.',
  },
  [pairKey('creatine', 'beta-alanine')]: {
    level: 'good',
    note: 'Two of the best-evidenced supplements, both work by saturating over weeks rather than acutely. Commonly stacked — take them daily and give it a month.',
  },
  [pairKey('whey', 'casein')]: {
    level: 'good',
    note: 'A classic combo — fast whey and slow casein. No issue at all; many people use whey around training and casein before bed.',
  },
  [pairKey('whey', 'creatine')]: {
    level: 'good',
    note: 'One of the most common and best-studied combinations. Fine to put both in the same shake.',
  },
  [pairKey('whey', 'eaa')]: {
    level: 'watch',
    note: 'Whey already contains all nine essential amino acids. If you are hitting your daily protein target with whey, a separate EAA or BCAA product is usually redundant spend rather than a safety issue.',
  },
  [pairKey('casein', 'eaa')]: {
    level: 'watch',
    note: 'Casein is a complete protein with the full amino profile, so a standalone EAA or BCAA product adds little once your total protein is adequate.',
  },
  [pairKey('multivitamin', 'vitamin-d')]: {
    level: 'watch',
    note: 'Most multivitamins already include vitamin D. Add both doses together and keep the total under 100 micrograms (4000 IU) a day unless a clinician has advised more.',
  },
  [pairKey('multivitamin', 'magnesium')]: {
    level: 'watch',
    note: 'Multivitamins and ZMA-style products both carry zinc and magnesium. Tally the zinc in particular — the safe upper limit is roughly 25 to 40mg a day from supplements.',
  },
  [pairKey('omega-3', 'vitamin-d')]: {
    level: 'good',
    note: 'Both are fat-soluble, so take them with a meal that has some fat for best absorption. No interaction to worry about.',
  },
  [pairKey('ashwagandha', 'caffeine')]: {
    level: 'watch',
    note: 'These pull in opposite directions — caffeine stimulates, ashwagandha calms. Fine together, but many people take caffeine pre-workout and save ashwagandha for the evening.',
  },
  [pairKey('ashwagandha', 'pre-workout')]: {
    level: 'watch',
    note: 'Pre-workout is a stimulant and ashwagandha is calming, so they partly offset. No harm, but splitting them — stim before training, ashwagandha at night — usually makes more sense.',
  },
  [pairKey('ashwagandha', 'magnesium')]: {
    level: 'good',
    note: 'Both are commonly taken in the evening for stress, recovery and sleep support — a sensible and popular pairing.',
  },
  [pairKey('collagen', 'whey')]: {
    level: 'watch',
    note: 'Collagen is a low-quality protein missing key muscle-building aminos, so do not count it toward your protein target — that is your whey job. Fine to take both; just log them differently.',
  },
}

const DEFAULT_NOTE =
  'No known negative interaction. These two are commonly taken together with no issue for healthy adults.'

// Evaluate a set of selected supplement keys into pairwise verdicts plus
// aggregate flags (total caffeine, pre-workout double-dosing).
export function evaluateCombo(selected: string[]): ComboResult {
  const keys = selected.filter((k) => k in SUPPLEMENT_BY_KEY)
  const pairs: ComboVerdict[] = []

  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const rule = RULES[pairKey(keys[i], keys[j])]
      pairs.push({
        a: keys[i],
        b: keys[j],
        level: rule?.level ?? 'good',
        note: rule?.note ?? DEFAULT_NOTE,
      })
    }
  }

  const flags: ComboFlag[] = []

  // Total-caffeine flag — the one genuinely important safety message here.
  const caffeineSources = keys.filter((k) => SUPPLEMENT_BY_KEY[k]?.caffeine)
  if (caffeineSources.length >= 2) {
    flags.push({
      level: 'caution',
      title: 'Watch your total caffeine',
      note: 'You have selected more than one caffeine source. A strong pre-workout can be 200 to 350mg and a coffee another 80 to 120mg. Keep your daily caffeine under about 400mg, and no more than roughly 3mg per kg of bodyweight in a single pre-workout dose. If you train in the evening, mind the 5 to 6 hour half-life so it does not wreck your sleep.',
    })
  }

  // Pre-workout double-dosing flag — consolidates the label-check message when
  // standalone versions of common pre-workout actives are also selected.
  if (keys.includes('pre-workout')) {
    const overlaps = keys
      .filter((k) => k !== 'pre-workout' && SUPPLEMENT_BY_KEY[k]?.inPreWorkout)
      .map((k) => SUPPLEMENT_BY_KEY[k].label)
    if (overlaps.length > 0) {
      flags.push({
        level: 'watch',
        title: 'Check your pre-workout label',
        note: `Your pre-workout very likely already contains ${listWords(overlaps)}. Read the panel and add up your real totals before taking standalone versions — the risk is silent double-dosing, not a dangerous mix.`,
      })
    }
  }

  const summary = {
    good: pairs.filter((p) => p.level === 'good').length,
    watch: pairs.filter((p) => p.level === 'watch').length,
    caution: pairs.filter((p) => p.level === 'caution').length,
  }

  return { pairs, flags, summary }
}

// "a", "a and b", "a, b and c"
function listWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
