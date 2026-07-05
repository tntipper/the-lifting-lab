// Curated ingredient-vs-ingredient comparisons for /ingredients-vs.
//
// This serves the large informational query class ("creatine vs beta-alanine",
// "caffeine vs theanine", "magnesium vs zinc") that none of the existing
// surfaces cover: product-vs-product (/vs) and brand-vs-brand (/brands-vs) are
// commercial, and single /ingredients/[slug] pages describe one ingredient in
// isolation. Each page disambiguates two commonly-confused ingredients.
//
// Content is deterministic and local — the two ingredients are pulled from
// lib/ingredients.ts (already-vetted, clinician-safe copy), so these pages
// carry no DB dependency and always render. The only new prose is the
// comparison framing (intro / key difference / stack note / verdict / when to
// pick each), written to stay consistent with the evidence levels and doses
// already published on the ingredient pages. Slugs are canonical (one
// direction per pair) so there are no A-vs-B / B-vs-A duplicates.

import { getIngredient, type Ingredient } from '@/lib/ingredients'

export type MatchupFaq = { q: string; a: string }

export type IngredientMatchup = {
  slug: string // canonical URL slug, e.g. 'creatine-monohydrate-vs-beta-alanine'
  a: string // ingredient slug (left)
  b: string // ingredient slug (right)
  metaTitle: string
  metaDescription: string
  intro: string // frames why these two get compared
  bestForA: string // when to reach for A
  bestForB: string // when to reach for B
  keyDifference: string // the core distinction
  together: string // honest "do they stack?" note
  verdict: string // the bottom line
  guides: string[] // guide slugs to funnel into (filtered against real guides at render)
  faqs: MatchupFaq[]
}

export const INGREDIENT_MATCHUPS: IngredientMatchup[] = [
  {
    slug: 'creatine-monohydrate-vs-beta-alanine',
    a: 'creatine-monohydrate',
    b: 'beta-alanine',
    metaTitle: 'Creatine vs Beta-Alanine: Which Should You Take? | The Lifting Lab',
    metaDescription:
      'Creatine and beta-alanine are cheap performance staples that work in completely different ways. Here is what each does, when to pick which, and why most lifters take both.',
    intro:
      'Two of the most popular and affordable training supplements, often confused because both are cheap performance aids sold in the same aisle. They target different energy systems, so for most lifters this is not really an either/or question.',
    bestForA:
      'You want the single most proven strength, power and lean-mass supplement, and your training leans on heavy or explosive lower-rep efforts.',
    bestForB:
      'Your training lives in the 60 to 240 second burn zone — higher-rep sets, sprints, circuit-style work — where muscular endurance is the limiter.',
    keyDifference:
      'Creatine tops up the ATP-phosphocreatine system that fuels short, maximal efforts, and it works for nearly everyone with strong evidence behind it. Beta-alanine raises muscle carnosine, which buffers the acid build-up that ends higher-rep sets, and its benefit is narrower with more moderate evidence.',
    together:
      'Yes. They hit different energy systems and are a classic, well-tolerated pairing: creatine 3 to 5g daily plus beta-alanine around 3.2 to 6g daily (split through the day to reduce the harmless tingling) covers both ends.',
    verdict:
      'If you only buy one, buy creatine — it is the higher-evidence, broader-benefit choice and one of the cheapest supplements there is. Add beta-alanine only if endurance in the burn zone is your specific bottleneck.',
    guides: ['creatine', 'pre-workout'],
    faqs: [
      {
        q: 'Should I take creatine or beta-alanine?',
        a: 'For most lifters, creatine first — it has stronger evidence and helps nearly everyone build strength and lean mass. Add beta-alanine only if your limiter is fatigue in higher-rep, 1 to 4 minute efforts.',
      },
      {
        q: 'Can I take creatine and beta-alanine together?',
        a: 'Yes. They work on different energy systems and are a common, well-tolerated stack. Take creatine 3 to 5g and beta-alanine 3.2 to 6g daily, splitting the beta-alanine to reduce tingling.',
      },
      {
        q: 'Do creatine and beta-alanine do the same thing?',
        a: 'No. Creatine fuels short, maximal efforts and strength; beta-alanine buffers acid to delay fatigue in sustained higher-rep work. They complement rather than replace each other.',
      },
    ],
  },
  {
    slug: 'l-citrulline-vs-beta-alanine',
    a: 'l-citrulline',
    b: 'beta-alanine',
    metaTitle: 'Citrulline vs Beta-Alanine: Pump or Endurance? | The Lifting Lab',
    metaDescription:
      'L-citrulline and beta-alanine are the two staple non-stimulant pre-workout ingredients. One is about pumps and blood flow, the other about pushing back fatigue. Here is which you actually want.',
    intro:
      'Two staple non-stimulant pre-workout ingredients that almost always appear side by side on the label. One is about blood flow and pump, the other about delaying the burn.',
    bestForA:
      'You want better pumps, blood flow and a small endurance bump from a stim-free ingredient — good for evening sessions.',
    bestForB:
      'Your sticking point is the burning fatigue of higher-rep or repeated-effort work.',
    keyDifference:
      'L-citrulline raises nitric oxide to widen blood vessels for pump and nutrient delivery, with a modest endurance effect at a proper 6 to 8g dose. Beta-alanine buffers muscle acidity to delay fatigue in the roughly one to four minute effort range. Both sit at moderate evidence.',
    together:
      'Yes — they are complementary and appear together in most well-built pre-workouts. Neither is a stimulant, so the pairing suits training at any time of day.',
    verdict:
      'Chasing pumps and blood flow, pick citrulline. Fighting the burn on high-rep work, pick beta-alanine. In a complete pre-workout you will usually get both, correctly dosed.',
    guides: ['pre-workout'],
    faqs: [
      {
        q: 'Is citrulline or beta-alanine better for pre-workout?',
        a: 'They do different jobs. Citrulline drives pumps and blood flow; beta-alanine delays muscular fatigue in higher-rep work. A good pre-workout includes both.',
      },
      {
        q: 'Can I take citrulline and beta-alanine together?',
        a: 'Yes. Both are non-stimulant and complementary — citrulline around 6 to 8g and beta-alanine around 3.2 to 6g are commonly stacked in the same formula.',
      },
    ],
  },
  {
    slug: 'caffeine-vs-l-theanine',
    a: 'caffeine',
    b: 'l-theanine',
    metaTitle: 'Caffeine vs L-Theanine: Why They Belong Together | The Lifting Lab',
    metaDescription:
      'Caffeine and L-theanine is the most talked-about focus pairing. This is less which wins and more why the two work best stacked together, and the ratio to use.',
    intro:
      'The most talked-about pairing in pre-workout and nootropic circles. This is less a case of which one wins and more a lesson in why the two belong together.',
    bestForA:
      'You want the proven performance and focus boost — more output and lower perceived effort.',
    bestForB:
      'You want to keep caffeine’s focus but take the edge off the jitters and the crash.',
    keyDifference:
      'Caffeine is the active driver, with strong evidence for performance and alertness. L-theanine does little for training on its own but smooths caffeine’s over-stimulation and supports calm focus. One is the engine, the other the suspension.',
    together:
      'This is the whole point. A roughly 1:1 to 2:1 theanine-to-caffeine ratio — for example 200mg theanine with 100 to 200mg caffeine — is the classic smooth-focus stack.',
    verdict:
      'Not really either/or. Caffeine does the heavy lifting; add theanine if caffeine leaves you wired or jittery. If you train late in the evening, consider dropping both to protect sleep.',
    guides: ['pre-workout'],
    faqs: [
      {
        q: 'Should I take caffeine or L-theanine?',
        a: 'Caffeine is the one that boosts performance and focus. L-theanine is best added to caffeine, not taken instead of it, to smooth out jitters and the crash.',
      },
      {
        q: 'What is the best caffeine to theanine ratio?',
        a: 'A ratio of roughly 1:1 to 2:1 theanine to caffeine is the common smooth-focus stack, such as 200mg theanine with 100 to 200mg caffeine.',
      },
    ],
  },
  {
    slug: 'whey-protein-vs-leucine',
    a: 'whey-protein',
    b: 'leucine',
    metaTitle: 'Whey Protein vs Leucine (or BCAAs): Do You Need Both? | The Lifting Lab',
    metaDescription:
      'Do you need a whole protein or just the anabolic trigger amino? Whey already contains plenty of leucine, so for most people the answer is simple. Here is the honest breakdown.',
    intro:
      'A common question dressed up in different words: do you need a whole protein, or just the anabolic trigger amino leucine (the star of most BCAA and EAA products)?',
    bestForA:
      'You want the simplest, best-value way to hit your daily protein target with a complete protein that is already rich in leucine.',
    bestForB:
      'A niche case — topping up a plant-based or low-leucine meal, or a specific fasted-training situation, when you already hit your protein target.',
    keyDifference:
      'Whey is a complete protein delivering all the amino acids needed to actually build tissue, and a 25 to 30g serving already contains around 2.5 to 3g of leucine — enough to maximally trigger muscle protein synthesis. Isolated leucine flips that switch but supplies little building material, so it cannot replace real protein.',
    together:
      'You rarely need both. If your total daily protein is on point, extra leucine or BCAAs add little; they mainly help around low-protein or plant-based meals.',
    verdict:
      'For almost everyone, whey (or any complete protein) wins outright — it does leucine’s job and provides the raw material to build from. Save standalone leucine for specific dietary gaps.',
    guides: ['whey', 'eaas'],
    faqs: [
      {
        q: 'Do I need leucine or BCAAs if I take whey?',
        a: 'Usually not. A normal whey serving already contains around 2.5 to 3g of leucine, enough to trigger muscle protein synthesis, plus the full set of amino acids to build from.',
      },
      {
        q: 'Is leucine better than whey protein?',
        a: 'No. Leucine triggers muscle building but supplies little material to build with. Whey both triggers the response and provides complete protein, so it is the better single choice for most people.',
      },
    ],
  },
  {
    slug: 'magnesium-vs-zinc',
    a: 'magnesium',
    b: 'zinc',
    metaTitle: 'Magnesium vs Zinc: Which Do Lifters Actually Need? | The Lifting Lab',
    metaDescription:
      'Magnesium and zinc are bundled together in ZMA and sold for sleep, recovery and testosterone. They are not interchangeable. Here is which matters most and how to dose them safely.',
    intro:
      'Two essential minerals bundled together in ZMA and marketed for sleep, recovery and testosterone. They do genuinely different jobs and are not interchangeable.',
    bestForA:
      'Sleep quality, muscle function and recovery — the mineral lifters are most commonly short on.',
    bestForB:
      'Immune function and testosterone — but this mainly matters when you are actually deficient.',
    keyDifference:
      'Magnesium supports hundreds of processes including muscle relaxation and sleep, and hard training plus sweat can leave you short. Zinc is central to immunity and testosterone, but supplementing only meaningfully helps if you are low — more is not better, and high doses interfere with copper. Both sit at moderate evidence for training benefits.',
    together:
      'They are the M and Z in ZMA and are commonly taken together in the evening. Keep zinc modest (around 15 to 30mg) and avoid megadosing.',
    verdict:
      'For most lifters, magnesium is the higher-value daily mineral. Add zinc if your diet is low in it (little red meat or shellfish) or you get run down often, but respect the safe upper limit.',
    guides: ['zma'],
    faqs: [
      {
        q: 'Should I take magnesium or zinc?',
        a: 'Magnesium is the more broadly useful daily mineral for lifters, supporting sleep, muscle function and recovery. Zinc mainly helps if your diet is low in it or you are deficient.',
      },
      {
        q: 'Can I take magnesium and zinc together?',
        a: 'Yes — they are combined in ZMA and often taken together in the evening. Keep zinc around 15 to 30mg, since high doses can interfere with copper absorption.',
      },
    ],
  },
  {
    slug: 'l-citrulline-vs-caffeine',
    a: 'l-citrulline',
    b: 'caffeine',
    metaTitle: 'Citrulline vs Caffeine: Pump or Stimulant? | The Lifting Lab',
    metaDescription:
      'The two headline pre-workout ingredients, one a stimulant and one not. Which you want depends on what you need a pre-workout to do, and whether you train in the evening.',
    intro:
      'The two headline pre-workout ingredients: one is a stimulant, one is not. The real question is what you want your pre-workout to actually do.',
    bestForA:
      'Stim-free pumps, blood flow and a small endurance bump — ideal for evening training or if you are caffeine-sensitive.',
    bestForB:
      'The biggest, best-evidenced boost to output, focus and perceived effort.',
    keyDifference:
      'Caffeine is a central-nervous-system stimulant with strong evidence for performance. L-citrulline is a non-stimulant blood-flow ingredient with moderate evidence for pumps and a minor endurance gain. Caffeine makes you feel switched on; citrulline makes the muscle feel full.',
    together:
      'Yes, and most complete pre-workouts pair them. If caffeine keeps you awake, a citrulline-led stim-free formula still delivers the pump without wrecking your sleep.',
    verdict:
      'Want the single biggest performance lever, pick caffeine. Training late, caffeine-sensitive, or chasing pumps, pick citrulline. They are better together than either one alone.',
    guides: ['pre-workout'],
    faqs: [
      {
        q: 'Is citrulline or caffeine better before a workout?',
        a: 'Caffeine gives the bigger, better-evidenced boost to output and focus. Citrulline is the stim-free option for pumps and blood flow, and the smarter pick for evening training.',
      },
      {
        q: 'Can I take citrulline and caffeine together?',
        a: 'Yes — they are commonly combined in pre-workouts, since one drives central stimulation and the other drives blood flow. Skip the caffeine if you train close to bedtime.',
      },
    ],
  },
  {
    slug: 'beta-alanine-vs-taurine',
    a: 'beta-alanine',
    b: 'taurine',
    metaTitle: 'Beta-Alanine vs Taurine: What Is the Difference? | The Lifting Lab',
    metaDescription:
      'Beta-alanine and taurine both show up in pre-workouts and get muddled together. Both help endurance-style work, but in different ways. Here is how to tell them apart.',
    intro:
      'Two amino acids that show up together in pre-workouts and routinely get muddled. Both help endurance-style work, but through different mechanisms.',
    bestForA:
      'Buffering the acid burn in sustained higher-rep or repeated efforts.',
    bestForB:
      'Cell hydration, endurance and smoothing out stimulant edge — cheap and very well tolerated.',
    keyDifference:
      'Beta-alanine raises muscle carnosine to buffer fatigue, and it causes the harmless tingle many lifters feel. Taurine supports cell volume, hydration and calcium handling, with a milder and broader endurance role. Both are moderate evidence.',
    together:
      'Yes — they are complementary and common in the same formula, and both are non-stimulant, so the pairing is easy on stimulant tolerance.',
    verdict:
      'For the specific burn of high-rep training, beta-alanine has the more targeted case. Taurine is a cheap, well-tolerated all-rounder that pairs alongside rather than competes.',
    guides: ['pre-workout'],
    faqs: [
      {
        q: 'Is beta-alanine or taurine better?',
        a: 'Beta-alanine has the more targeted case for buffering fatigue in higher-rep work. Taurine is a cheap, well-tolerated all-rounder for hydration and endurance that works well alongside it.',
      },
      {
        q: 'Can I take beta-alanine and taurine together?',
        a: 'Yes. Both are non-stimulant amino acids that appear together in many pre-workouts and complement each other rather than overlap.',
      },
    ],
  },
  {
    slug: 'caffeine-vs-l-tyrosine',
    a: 'caffeine',
    b: 'l-tyrosine',
    metaTitle: 'Caffeine vs L-Tyrosine for Focus: Which Works? | The Lifting Lab',
    metaDescription:
      'Both caffeine and L-tyrosine get sold for focus, but they are very different tools. One is proven and reliable, the other is situational. Here is when each one earns its place.',
    intro:
      'Both get sold for focus, but they are very different tools — one is proven and everyday, the other is situational.',
    bestForA:
      'Reliable, proven focus and performance for a normal training day.',
    bestForB:
      'Mental focus under stress or fatigue — deadlines, sleep-deprived sessions, high-pressure days.',
    keyDifference:
      'Caffeine has strong, broad evidence for alertness and output. L-tyrosine has limited evidence and mainly helps sustain focus when you are stressed, cold or sleep-deprived, rather than in rested everyday conditions. Caffeine is the dependable choice; tyrosine is situational.',
    together:
      'They stack fine and often appear together — tyrosine may support the focus that caffeine drives — but keep an eye on your total stimulant load.',
    verdict:
      'For everyday focus, caffeine is the proven pick. Reach for tyrosine as a situational add-on when you are run-down or under pressure, not as a caffeine replacement.',
    guides: ['pre-workout'],
    faqs: [
      {
        q: 'Is caffeine or L-tyrosine better for focus?',
        a: 'Caffeine is the proven, reliable choice for everyday focus and performance. L-tyrosine has weaker evidence and mainly helps when you are stressed, sleep-deprived or fatigued.',
      },
      {
        q: 'Can I take caffeine and L-tyrosine together?',
        a: 'Yes, they are often combined. Tyrosine may support focus under stress while caffeine provides the main boost — just manage your overall stimulant intake.',
      },
    ],
  },
]

export function getIngredientMatchup(slug: string): IngredientMatchup | undefined {
  return INGREDIENT_MATCHUPS.find((m) => m.slug === slug)
}

export const INGREDIENT_MATCHUP_SLUGS = INGREDIENT_MATCHUPS.map((m) => m.slug)

export type ResolvedIngredientMatchup = IngredientMatchup & { ia: Ingredient; ib: Ingredient }

// Resolve a slug to its two ingredients. Returns null if the matchup is unknown
// or references an ingredient that no longer exists, so the route can 404.
export function resolveIngredientMatchup(slug: string): ResolvedIngredientMatchup | null {
  const m = getIngredientMatchup(slug)
  if (!m) return null
  const ia = getIngredient(m.a)
  const ib = getIngredient(m.b)
  if (!ia || !ib) return null
  return { ...m, ia, ib }
}

// All matchups that feature a given ingredient slug (for reciprocal linking on
// the single-ingredient pages).
export function matchupsForIngredient(ingredientSlug: string): IngredientMatchup[] {
  return INGREDIENT_MATCHUPS.filter((m) => m.a === ingredientSlug || m.b === ingredientSlug)
}
