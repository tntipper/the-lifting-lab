// Goal-based supplement "stack" guides — the SSG/SEO counterpart to the
// interactive Find My Stack wizard. Each archetype targets a proven head-term
// class ("best supplement stack for muscle building UK 2026") and resolves to a
// recommended set of real, scored products pulled from Supabase at build time.
//
// `categories` is an ordered priority list of Supabase category slugs. The page
// picks one product per category (top-scored, or cheapest-per-serving for a
// budget stack), in priority order, capped at `maxProducts`. Missing categories
// are skipped, so a thin catalogue never produces an empty/short stack error.

import type { Faq } from '@/lib/guides'
import { hasVerifiedCost } from '@/lib/products'

export type StackPick = 'score' | 'budget'

export type StackGuide = {
  slug: string
  eyebrow: string
  h1: string
  metaTitle: string
  metaDescription: string
  intro: string
  paras: string[]
  categories: string[]
  maxProducts: number
  pick: StackPick
  faqs: Faq[]
}

export const STACK_GUIDES: StackGuide[] = [
  {
    slug: 'muscle-building',
    eyebrow: 'Goal · Build Muscle',
    h1: 'Best Supplement Stack for Building Muscle',
    metaTitle: 'Best Supplement Stack for Muscle Building UK 2026 | The Lifting Lab',
    metaDescription:
      'The evidence-based supplement stack for building muscle: protein, creatine and the few extras that actually help. Real UK products ranked by effectiveness.',
    intro:
      'Building muscle comes down to progressive training, enough total protein and a calorie surplus. Supplements cannot replace any of that, but a small, well-chosen stack makes hitting your protein target easier and adds the one or two ingredients with the deepest evidence behind them. This stack keeps it to what works.',
    paras: [
      'Protein is the foundation. A good whey makes it realistic to hit roughly 0.8 to 1g of protein per pound of bodyweight a day, which is the single biggest dietary lever for muscle growth. Everything else in this stack is secondary to getting that right.',
      'Creatine monohydrate is the most studied supplement in sport, reliably improving strength, power and lean mass at 3 to 5g a day. It is also one of the cheapest things you can buy, which makes it a non-negotiable in any muscle-building stack.',
      'Beyond protein and creatine the returns drop off fast. EAAs are useful intra-workout for fasted or long sessions, and a pre-workout can sharpen hard training days, but neither builds muscle on its own. We have ordered the stack so the essentials come first and the optional extras only get added if your budget stretches.',
      'Every product below is the current highest-scoring option in its category, judged purely on how closely its active doses match the evidence-based reference for that ingredient. Swap any pick for an alternative on its category page if you prefer a different brand.',
    ],
    categories: ['whey', 'creatine', 'eaas', 'pre-workout', 'casein'],
    maxProducts: 4,
    pick: 'score',
    faqs: [
      { q: 'What supplements are best for building muscle?', a: 'A quality whey protein and creatine monohydrate (3 to 5g daily) are the two with the strongest evidence. EAAs and a pre-workout are optional extras that support hard training but are not essential.' },
      { q: 'Do I need a pre-workout to build muscle?', a: 'No. A pre-workout can help you train harder on tough days, but muscle growth is driven by progressive training, total protein and a calorie surplus, not by stimulants.' },
      { q: 'How much does a muscle-building stack cost?', a: 'A core stack of whey and creatine can run well under £60 a month. Adding EAAs and a pre-workout pushes it higher; the picks below show current pricing where available.' },
    ],
  },
  {
    slug: 'beginner',
    eyebrow: 'Goal · Just Starting Out',
    h1: 'Best Beginner Supplement Stack',
    metaTitle: 'Best Beginner Supplement Stack UK 2026 | The Lifting Lab',
    metaDescription:
      'New to training? Skip the hype. This beginner supplement stack covers the three things worth buying first, with the best-value UK products ranked.',
    intro:
      'When you are new to the gym it is easy to spend a fortune on supplements that do almost nothing. The honest truth is that beginners need very little: get training and diet consistent first, and let a tiny stack cover the genuine basics. These three are the ones worth buying before anything else.',
    paras: [
      'Whey protein is first because the hardest part of starting out is simply eating enough protein. A shake is the cheapest, most convenient way to top up towards 0.8 to 1g per pound of bodyweight without cooking another meal.',
      'Creatine monohydrate is second because nothing else gives you as much proven benefit for as little money. At 3 to 5g a day it supports strength and recovery, and it is safe for long-term daily use. There is no reason for a beginner to skip it.',
      'Vitamin D rounds out the stack for a simple reason: most people in the UK are low on it, especially over winter, and being deficient affects energy, mood and recovery. It is not a muscle supplement, but correcting a common gap helps everything else work better.',
      'That is genuinely all you need to start. Ignore fat burners, test boosters and 15-ingredient pre-workouts until your training and diet are dialled in. The picks below are the top-scoring options in each of these three categories right now.',
    ],
    categories: ['whey', 'creatine', 'vitamin-d'],
    maxProducts: 3,
    pick: 'score',
    faqs: [
      { q: 'What supplements should a beginner take?', a: 'Start with just three: a whey protein to hit your protein target, creatine monohydrate for strength and recovery, and vitamin D to cover a common UK deficiency. Everything else can wait.' },
      { q: 'Do beginners need pre-workout or fat burners?', a: 'No. Pre-workouts are optional and fat burners are largely a waste of money. Get your training and diet consistent first; they matter far more than any supplement.' },
      { q: 'Is creatine safe for beginners?', a: 'Yes. Creatine monohydrate is one of the most researched and safest supplements available, suitable for daily use at 3 to 5g from the very start of training.' },
    ],
  },
  {
    slug: 'fat-loss',
    eyebrow: 'Goal · Lean Out',
    h1: 'Best Supplement Stack for Fat Loss',
    metaTitle: 'Best Supplement Stack for Fat Loss & Cutting UK 2026 | The Lifting Lab',
    metaDescription:
      'Cutting? Protein and a few low-calorie helpers protect muscle while you lose fat. The honest fat-loss supplement stack, with real UK products ranked.',
    intro:
      'No supplement burns fat in any meaningful way. Fat loss is a calorie deficit, full stop. What a smart stack does on a cut is protect your hard-earned muscle, keep you full, and make low-calorie days easier to stick to. This stack is built around that, not around miracle pills.',
    paras: [
      'Protein matters even more in a deficit, because it preserves muscle while you lose fat and keeps you fuller for fewer calories. A lean whey isolate is ideal here: high protein with minimal carbs and fat, so it fits a tight calorie budget.',
      'EAAs are a useful intra-workout sipper when training fasted or on very low calories, helping protect muscle without adding much to your daily total. Electrolytes help too, since lower food intake often means lower sodium and the flat, drained feeling that comes with it.',
      'A high-protein bar earns its place as a convenient, portion-controlled snack that satisfies cravings without derailing the deficit. Creatine stays in the stack because it does not cause fat gain; any scale bump is water, and it keeps your strength up while calories are low.',
      'What you will not find here are fat burners. The evidence for them is weak, the stimulant doses can be unpleasant, and they distract from the only thing that actually drives fat loss: the deficit. The picks below are the top-scoring options in each supporting category.',
    ],
    categories: ['whey-isolate', 'eaas', 'protein-bar', 'hydration', 'creatine'],
    maxProducts: 4,
    pick: 'score',
    faqs: [
      { q: 'What supplements help with fat loss?', a: 'None burn fat directly. Protein (ideally a lean isolate) preserves muscle and keeps you full in a deficit, while EAAs, electrolytes and a high-protein snack make low-calorie days easier. Fat loss itself comes from a calorie deficit.' },
      { q: 'Should I take fat burners to cut?', a: 'No. Fat burners have weak evidence and often rely on high stimulant doses. Your money is better spent on protein that protects muscle while you lose fat.' },
      { q: 'Should I stop creatine when cutting?', a: 'No. Creatine does not add body fat. Any small weight increase is water, and it helps you hold onto strength while calories are low, so it is worth keeping through a cut.' },
    ],
  },
  {
    slug: 'strength-power',
    eyebrow: 'Goal · Strength & Power',
    h1: 'Best Supplement Stack for Strength & Power',
    metaTitle: 'Best Supplement Stack for Strength & Power UK 2026 | The Lifting Lab',
    metaDescription:
      'Lifting heavy? This strength-focused supplement stack pairs creatine and protein with smart training-day extras. Real UK products ranked by effectiveness.',
    intro:
      'Strength and power are built through heavy, progressive training and good recovery. The supplements that genuinely help are the ones that support force output and let you train hard session after session. This stack leads with creatine, the single best supplement for strength, and backs it with the recovery basics.',
    paras: [
      'Creatine monohydrate is the headline act for strength. By topping up your muscles’ phosphocreatine stores it directly supports short, explosive efforts, which is exactly what heavy lifting demands. At 3 to 5g a day it is the most reliable strength supplement there is.',
      'Protein supports the recovery and muscle repair that underpin getting stronger over time. Even a pure strength athlete needs enough daily protein, and a quality whey is the easiest way to guarantee it without forcing down extra meals.',
      'A well-dosed pre-workout can help on the heaviest training days, with caffeine improving focus and perceived effort under a loaded bar. Keep it sensible: we penalise products that push past 400mg of caffeine, and you do not need a stimulant for every session.',
      'EAAs round things out for hard or longer sessions, supporting muscle through high-volume work. The picks below are the current top-scoring options in each category, chosen on how well their doses match the evidence rather than on marketing.',
    ],
    categories: ['creatine', 'whey', 'pre-workout', 'eaas'],
    maxProducts: 4,
    pick: 'score',
    faqs: [
      { q: 'What is the best supplement for strength?', a: 'Creatine monohydrate. By supporting phosphocreatine stores it improves short, explosive efforts like heavy lifts, with decades of evidence behind it at 3 to 5g a day.' },
      { q: 'Does pre-workout make you stronger?', a: 'Not directly, but a sensibly dosed pre-workout can improve focus and perceived effort on heavy days, which may help you grind out tough sets. Strength gains still come from progressive training.' },
      { q: 'How much protein do I need for strength training?', a: 'Around 0.8 to 1g of protein per pound of bodyweight a day supports recovery and getting stronger over time. A whey shake makes hitting that target easier.' },
    ],
  },
  {
    slug: 'endurance',
    eyebrow: 'Goal · Endurance',
    h1: 'Best Supplement Stack for Endurance',
    metaTitle: 'Best Supplement Stack for Endurance & Cardio UK 2026 | The Lifting Lab',
    metaDescription:
      'Running, cycling or long sessions? This endurance supplement stack covers hydration, intra-workout fuel and recovery. Real UK products ranked.',
    intro:
      'Endurance training places different demands on supplements than lifting does. The priorities are staying hydrated, fuelling long efforts and recovering well enough to train again. This stack is built around fluid and electrolyte balance first, with fuel and protein supporting longer sessions and recovery.',
    paras: [
      'Hydration leads because endurance athletes lose a lot of fluid and sodium through sweat, and performance drops sharply when you are behind. A proper electrolyte product (with a meaningful sodium dose, not just flavour) helps you hold onto water and keep going on long or hot sessions.',
      'An intra-workout drink combining fast carbohydrate and electrolytes is where endurance differs most from gym training: sipping fuel through a long effort maintains output and reduces the muscle breakdown that comes with training on empty. For sessions over an hour this is genuinely useful.',
      'EAAs support muscle through long efforts, particularly when training fasted, and creatine still has a place even for endurance athletes by supporting repeated high-intensity bursts and recovery between them.',
      'Protein closes the loop on recovery, helping you repair and adapt so you can train consistently. The picks below are the top-scoring options in each category, chosen on dosing quality rather than brand.',
    ],
    categories: ['hydration', 'intra-workout', 'eaas', 'creatine', 'whey'],
    maxProducts: 4,
    pick: 'score',
    faqs: [
      { q: 'What supplements are best for endurance?', a: 'Electrolytes for hydration come first, followed by an intra-workout carb-and-electrolyte drink for long sessions. EAAs and protein support recovery, and creatine still helps with repeated high-intensity efforts.' },
      { q: 'Do I need carbs during long cardio?', a: 'For efforts over about an hour, sipping fast carbohydrate helps maintain output and spares muscle. For shorter sessions, hydration and a normal diet are usually enough.' },
      { q: 'Should endurance athletes take creatine?', a: 'Yes, it can help. While best known for strength, creatine supports repeated high-intensity bursts and recovery between them, which benefits many endurance sports.' },
    ],
  },
  {
    slug: 'men-over-40',
    eyebrow: 'Goal · Over 40',
    h1: 'Best Supplement Stack for Men Over 40',
    metaTitle: 'Best Supplement Stack for Men Over 40 UK 2026 | The Lifting Lab',
    metaDescription:
      'Training in your 40s and beyond? This stack focuses on muscle retention, joints, hormones and the nutrients men commonly fall short on. UK products ranked.',
    intro:
      'Training past 40 is less about chasing pumps and more about holding onto muscle, supporting recovery and covering the nutrient gaps that widen with age. Muscle is harder to build and easier to lose, recovery slows, and certain vitamins and minerals become more important. This stack is built around that reality, not around hype.',
    paras: [
      'Protein and creatine do even more heavy lifting as you age. Older muscle is more resistant to protein, so hitting a solid daily target with the help of a good whey matters more, not less. Creatine, meanwhile, supports strength and may help offset age-related muscle loss, making it arguably more valuable after 40 than before.',
      'Vitamin D and omega-3 address two of the most common gaps for men in this age group. Vitamin D supports bone, muscle and mood and is low in most UK adults over winter, while omega-3 supports heart and joint health if you do not eat much oily fish.',
      'Magnesium and ZMA-style support help with sleep and recovery, both of which tend to suffer with age and both of which underpin everything else you do in the gym. Hormone-support products are included for completeness, but with a clear caveat below.',
      'On testosterone: no over-the-counter product reliably raises it in healthy men. The genuine benefit is correcting deficiencies in nutrients like zinc, magnesium and vitamin D. If you suspect genuinely low testosterone through fatigue, low libido or poor recovery, that is a medical matter; get a blood test and speak to a qualified clinician rather than self-treating. The picks below are the top-scoring options in each supporting category.',
    ],
    categories: ['whey', 'creatine', 'vitamin-d', 'omega-3', 'magnesium', 'hormone-support'],
    maxProducts: 5,
    pick: 'score',
    faqs: [
      { q: 'What supplements should men over 40 take?', a: 'Protein and creatine to hold onto muscle, vitamin D and omega-3 to cover common gaps, and magnesium for sleep and recovery. These cover the basics that matter most with age.' },
      { q: 'Do testosterone boosters work for men over 40?', a: 'No over-the-counter product reliably raises testosterone in healthy men. The real benefit is fixing deficiencies in zinc, magnesium and vitamin D. Suspected low testosterone should be assessed by a clinician with a blood test.' },
      { q: 'Is creatine good for older men?', a: 'Yes, arguably more so. Creatine supports strength and may help offset age-related muscle loss, and it remains safe for daily use at 3 to 5g.' },
    ],
  },
  {
    slug: 'everyday-health',
    eyebrow: 'Goal · Health & Wellbeing',
    h1: 'Best Everyday Health & Wellbeing Stack',
    metaTitle: 'Best Everyday Health Supplement Stack UK 2026 | The Lifting Lab',
    metaDescription:
      'Not chasing gains, just better daily health? This wellbeing stack covers the vitamins and minerals UK adults commonly fall short on. Real products ranked.',
    intro:
      'Not everyone is training for muscle. If your goal is simply feeling better day to day, the right approach is to cover the specific nutrients many UK adults are short of, rather than buying a cabinet full of pills that promise vague energy and immunity. This stack sticks to the gaps worth filling.',
    paras: [
      'Vitamin D is the standout for almost everyone in the UK, because limited winter sunlight means deficiency is common, and it affects bone health, immunity, muscle and mood. A daily 1000 to 4000iu dose is a sensible, evidence-backed place to start.',
      'Omega-3 supports heart and brain health and is worth supplementing if you eat little oily fish. Magnesium helps with sleep, muscle function and stress, and many people simply do not get enough from diet, with better-absorbed forms like glycinate worth choosing.',
      'A good multivitamin acts as a backstop against smaller dietary gaps, and a gut or digestion product can help if that is a specific concern for you. The principle throughout is simple: a supplement only helps if you are actually short of what it provides, so target known gaps rather than supplementing by default.',
      'For anything persistent, like ongoing fatigue, a blood test beats guessing. The picks below are the top-scoring options in each category, judged on dosing and form rather than marketing claims.',
    ],
    categories: ['vitamin-d', 'omega-3', 'magnesium', 'multivitamin', 'gut-digestion'],
    maxProducts: 4,
    pick: 'score',
    faqs: [
      { q: 'What supplements should I take for general health?', a: 'Vitamin D is the strongest case for most UK adults, especially in winter. Omega-3 and magnesium help if your diet is short on them, and a multivitamin can backstop smaller gaps. Supplement to fix a known shortfall rather than by default.' },
      { q: 'Can you take too many vitamins?', a: 'Yes. Fat-soluble vitamins like A and E, and minerals like iron, can be harmful in excess. With most nutrients, more than you need offers no extra benefit, so dose sensibly.' },
      { q: 'Do I need a blood test before supplementing?', a: 'For everyday nutrients like vitamin D it is reasonable to supplement sensibly without one. For persistent symptoms or things like iron, a blood test is the smarter route than guessing.' },
    ],
  },
  {
    slug: 'budget',
    eyebrow: 'Goal · Best Value',
    h1: 'Best Budget Supplement Stack',
    metaTitle: 'Best Budget Supplement Stack UK 2026 | The Lifting Lab',
    metaDescription:
      'Great results do not need a big spend. This budget supplement stack picks the best-value protein, creatine and vitamin D by cost per serving. UK products ranked.',
    intro:
      'You do not need to spend a lot to get the benefit supplements actually offer. Most of the results come from a handful of cheap, proven basics, and the marketing markup is on the extras you can skip. This stack picks the best-value option in each essential category by real cost per serving, not by brand.',
    paras: [
      'The three pillars of a value stack are protein, creatine and vitamin D, in that order. They have the strongest evidence per pound spent, and buying them well keeps a complete, effective stack comfortably affordable each month.',
      'For protein, a plain whey concentrate in a large pouch almost always beats fancy formats on cost per gram of protein. We rank by cost per serving where we have the data, so the pick below is the cheapest effective option we currently track, not just the cheapest tub.',
      'Creatine is where budget shoppers win biggest: plain micronised monohydrate in a large bag costs pennies per serving and performs identically to premium-branded versions. There is no need to pay more for exotic forms that the research does not support.',
      'Vitamin D is cheap insurance against a common UK deficiency and rounds out the stack without adding much cost. The picks below are chosen by lowest cost per serving among scored products, falling back to the top-scoring option where price data is not yet available.',
    ],
    categories: ['whey', 'creatine', 'vitamin-d'],
    maxProducts: 3,
    pick: 'budget',
    faqs: [
      { q: 'What is the cheapest effective supplement stack?', a: 'A plain whey concentrate, micronised creatine monohydrate and vitamin D. All three are cheap, proven and cover the basics, and buying by cost per serving keeps the monthly spend low.' },
      { q: 'Is cheap creatine as good as expensive creatine?', a: 'Yes. Plain micronised creatine monohydrate performs the same as premium-branded versions. There is no evidence that costlier forms work better, so it is the best value buy there is.' },
      { q: 'Can I build muscle on a budget?', a: 'Absolutely. Enough total protein, creatine and consistent training do the heavy lifting. The expensive extras add little, so a lean, cheap stack is all most people need.' },
    ],
  },
]

const STACK_BY_SLUG: Record<string, StackGuide> = Object.fromEntries(
  STACK_GUIDES.map((s) => [s.slug, s]),
)

export function getStackGuide(slug: string): StackGuide | undefined {
  return STACK_BY_SLUG[slug]
}

export const STACK_SLUGS = STACK_GUIDES.map((s) => s.slug)

// Pure selection: given products already grouped by category, resolve the stack's
// ordered picks. For a 'budget' stack we prefer the lowest cost-per-serving scored
// product in each category (falling back to top score when no price data exists);
// otherwise we take the highest-scored product. Categories with no product are
// skipped, and the result is capped at maxProducts.
export function selectStack<
  P extends { id: string; category: string; score: number | null; cost_per_serving: number | null },
>(byCategory: Map<string, P[]>, stack: StackGuide): P[] {
  const picks: P[] = []
  for (const cat of stack.categories) {
    if (picks.length >= stack.maxProducts) break
    const inCat = byCategory.get(cat)
    if (!inCat || inCat.length === 0) continue
    let best: P | undefined
    if (stack.pick === 'budget') {
      // Only a verified, positive cost may win a budget pick (TLL-P0-3).
      const priced = inCat.filter((p) => hasVerifiedCost(p) && p.score != null)
      if (priced.length > 0) {
        best = priced.reduce((a, b) =>
          (a.cost_per_serving as number) <= (b.cost_per_serving as number) ? a : b,
        )
      }
    }
    if (!best) {
      const scored = inCat.filter((p) => p.score != null)
      if (scored.length === 0) continue
      best = scored.reduce((a, b) => ((a.score as number) >= (b.score as number) ? a : b))
    }
    picks.push(best)
  }
  return picks
}
