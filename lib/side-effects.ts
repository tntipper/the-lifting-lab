// Supplement side-effects & safety data — powers the /side-effects hub. Pure
// static data, zero DB, so the page can never fail at runtime. Every entry is
// evidence-based and clinician-safe: we describe general, well-documented
// tolerability for healthy adults and repeatedly defer real medical questions to
// a qualified clinician. This is information, not medical advice.
//
// The tier colours mirror the site's product-scoring language (lime = good,
// amber = mixed, red = genuine caution) so the whole brand reads in one visual
// grammar: we score products green/amber/red, and we score safety the same way.

export type SafetyTier = 'well-tolerated' | 'use-sensibly' | 'caution'

export const TIER_META: Record<
  SafetyTier,
  { label: string; color: string; noun: string; blurb: string }
> = {
  'well-tolerated': {
    label: 'Well Tolerated',
    color: '#a6e22e',
    noun: 'well tolerated',
    blurb: 'Strong safety record in healthy adults at sensible doses. Side effects are usually mild and dose-related.',
  },
  'use-sensibly': {
    label: 'Use Sensibly',
    color: '#f5a623',
    noun: 'safe used sensibly',
    blurb: 'Generally fine, but with a real dose ceiling or specific groups who should be careful. Read the caveats.',
  },
  caution: {
    label: 'Real Caution',
    color: '#e05a2b',
    noun: 'need genuine caution',
    blurb: 'Meaningful side-effect or quality risk. Often more hype than benefit — weigh it carefully or skip it.',
  },
}

export type Safety = {
  /** URL-safe id, also the anchor + React key. */
  id: string
  /** Supplement name, exactly as searched. */
  name: string
  /** Short topic tag, e.g. "Creatine", "Stimulant", "Vitamin". */
  topic: string
  tier: SafetyTier
  /** One-line summary shown on the collapsed card. */
  headline: string
  /** Common, mild, usually dose-related effects. */
  common: string[]
  /** Rare-but-serious effects, or an honest "none documented" line. */
  serious: string[]
  /** Who should be careful / clear it with a clinician first. */
  avoid: string[]
  /** The sensible-dose framing that keeps side effects minimal. */
  safeDose: string
  /** 2-4 sentence evidence-based summary; backs the FAQ schema 1:1. */
  detail: string
  /** Optional funnel link to a matching tool / ranking / guide. */
  link?: { label: string; href: string }
}

// Ordered so the highest-search, highest-value supplements lead. Mixes the
// well-tolerated staples with the genuinely caution-worthy categories so the
// page reads as honest safety analysis, not a reflexive everything-is-fine wall.
export const SAFETY: Safety[] = [
  {
    id: 'creatine',
    name: 'Creatine',
    topic: 'Creatine',
    tier: 'well-tolerated',
    headline: 'One of the most-studied supplements there is — and one of the safest.',
    common: [
      'A small scale weight bump in the first weeks (water drawn into muscle, not fat)',
      'Occasional stomach upset if a big dose is taken at once on an empty stomach',
    ],
    serious: ['None shown in healthy adults across decades of long-term research'],
    avoid: ['Existing kidney disease — clear any supplement with your doctor first'],
    safeDose: '3 to 5g a day, every day. A loading phase is optional and only speeds up saturation, it is not required.',
    detail:
      'Creatine monohydrate has one of the strongest safety records of any supplement, with hundreds of studies and decades of use showing no harm to kidneys or liver in healthy people. The only common effect is a small early weight gain from water held inside the muscle, and mild stomach upset if you take a large dose at once rather than splitting it or taking it with food. If you already have kidney disease, check with your doctor before starting.',
    link: { label: 'Creatine dosage calculator', href: '/calculators/creatine' },
  },
  {
    id: 'pre-workout',
    name: 'Pre-workout',
    topic: 'Stimulant',
    tier: 'use-sensibly',
    headline: 'Mostly caffeine — safe for healthy adults, easy to overdo.',
    common: [
      'Jitters, anxiety and a racing heart from the caffeine',
      'Insomnia if taken too close to bed',
      'An energy crash a few hours later',
      'Harmless skin tingling from beta-alanine (paraesthesia)',
    ],
    serious: [
      'High blood pressure and cardiovascular strain when doses are stacked too high',
      'Genuine risk for people with existing heart conditions',
    ],
    avoid: [
      'Heart conditions or high blood pressure — check with a doctor first',
      'Anxiety disorders, and pregnancy (keep total caffeine low)',
      'Evening training if you value your sleep',
    ],
    safeDose: 'Keep total caffeine from all sources under about 400mg a day for healthy adults. One sensible scoop 45 to 60 minutes before training.',
    detail:
      'A standard pre-workout is mostly caffeine, which is safe for healthy adults at sensible doses. The problems come from stacking too much — a strong scoop plus coffee can push you well past a sensible caffeine limit, which is where the jitters, racing heart and poor sleep come from. The beta-alanine tingle is harmless. If you have a heart condition or high blood pressure, treat pre-workout with caution and speak to a clinician first.',
    link: { label: 'Caffeine calculator', href: '/calculators/caffeine' },
  },
  {
    id: 'whey-protein',
    name: 'Whey protein',
    topic: 'Protein',
    tier: 'well-tolerated',
    headline: 'Safe for healthy people — most complaints are just lactose.',
    common: [
      'Bloating, gas or loose stool — usually the lactose in cheaper concentrates',
      'Switching to a whey isolate removes most of the lactose and the symptoms',
    ],
    serious: ['None in healthy people; a true milk allergy is a separate, medical issue'],
    avoid: [
      'A diagnosed milk or dairy allergy — use a plant protein instead',
      'Severe lactose intolerance — choose whey isolate or a non-dairy protein',
    ],
    safeDose: 'Use it to top up your daily protein target (roughly 1.6 to 2.2g per kg of bodyweight), not on top of an already-met target.',
    detail:
      'For people with healthy kidneys, whey protein is simply a convenient protein source and has not been shown to cause harm. The usual complaints — bloating, gas, loose stool — are almost always the lactose in cheaper whey concentrate, and switching to a whey isolate (very low lactose) resolves most of them. A genuine milk allergy is different from lactose intolerance and means avoiding whey altogether.',
    link: { label: 'Protein calculator', href: '/calculators/protein' },
  },
  {
    id: 'ashwagandha',
    name: 'Ashwagandha',
    topic: 'Adaptogen',
    tier: 'use-sensibly',
    headline: 'Popular for stress and sleep, but with real caveats worth knowing.',
    common: ['Drowsiness', 'Stomach upset or nausea', 'A calm, sometimes flat mood'],
    serious: [
      'Rare reports of liver injury',
      'Can raise thyroid hormone levels and disturb existing thyroid conditions',
    ],
    avoid: [
      'Pregnancy and breastfeeding',
      'Thyroid conditions, autoimmune disease and liver conditions',
      'Two weeks before any planned surgery, and alongside sedatives or thyroid medication',
    ],
    safeDose: 'Studies typically use 300 to 600mg a day of a standardised root extract, taken for a defined period rather than indefinitely.',
    detail:
      'Ashwagandha is generally well tolerated short-term and is studied for stress and sleep, but it is not risk-free. It commonly causes drowsiness and stomach upset, there are rare reports of liver injury, and it can raise thyroid hormone — a problem if you have a thyroid condition. Because it can interact with sedatives, thyroid and blood-sugar medication and is not advised in pregnancy, treat it as something to clear with a clinician rather than a casual add-on.',
    link: { label: 'See what we flag', href: '/watch-outs' },
  },
  {
    id: 'fat-burners',
    name: 'Fat burners / thermogenics',
    topic: 'Weight Loss',
    tier: 'caution',
    headline: 'Poor risk-to-reward — usually just expensive, high-dose stimulants.',
    common: [
      'Jitters, anxiety and a racing heart',
      'Insomnia and an afternoon crash',
      'Digestive upset and headaches',
    ],
    serious: [
      'Proprietary stimulant blends have been linked to serious cardiovascular events',
      'Banned or undisclosed stimulants (like DMAA) still turn up in this category',
    ],
    avoid: [
      'Anyone with a heart condition or high blood pressure',
      'Honestly, most people — the benefit is tiny and the ingredients are opaque',
    ],
    safeDose: 'There is no dose that makes a proprietary stimulant blend a good idea. Fat is lost through a sustained calorie deficit, not a tub.',
    detail:
      'Thermogenic fat burners lean almost entirely on caffeine for a tiny metabolic bump, wrapped in a proprietary blend you cannot fully see. The side effects are the usual high-stimulant set — jitters, insomnia, raised heart rate — and the opaque blends have been linked to serious cardiovascular events, with banned stimulants still surfacing in the category. You would get the same caffeine from a coffee for a fraction of the price and none of the mystery.',
    link: { label: 'Supplement watch-outs', href: '/watch-outs' },
  },
  {
    id: 'vitamin-d',
    name: 'Vitamin D',
    topic: 'Vitamin',
    tier: 'use-sensibly',
    headline: 'Worth taking for most in the UK — but do not megadose it.',
    common: ['None at sensible doses'],
    serious: [
      'Toxicity from chronic megadosing raises blood calcium (hypercalcaemia), which can damage kidneys',
    ],
    avoid: [
      'Do not take very high doses long-term without a blood test and medical guidance',
      'Sarcoidosis and some kidney conditions — check with a clinician',
    ],
    safeDose: 'UK guidance is 10 micrograms (400 IU) a day, especially in winter. Up to 100 micrograms (4000 IU) a day is generally considered a safe upper limit for adults.',
    detail:
      'Vitamin D is one of the few supplements broadly worth taking in the UK, where low winter sunlight leaves many people short, and at sensible doses it has essentially no side effects. The risk is entirely at the top end: chronically megadosing far beyond the safe upper limit can raise blood calcium to harmful levels. Take a normal daily dose, and if you want to use high doses to correct a deficiency, do it on the back of a blood test and medical advice.',
    link: { label: 'Build my stack', href: '/wizard' },
  },
  {
    id: 'beta-alanine',
    name: 'Beta-alanine',
    topic: 'Pre-Workout',
    tier: 'well-tolerated',
    headline: 'That tingle is harmless — the ingredient itself is very safe.',
    common: [
      'Paraesthesia: a harmless tingling or flushing of the skin, usually face, neck and hands',
      'The tingle fades and can be controlled by splitting the daily dose',
    ],
    serious: ['None documented at standard supplement doses'],
    avoid: ['No specific groups at normal doses, though there is little data in pregnancy'],
    safeDose: '4 to 6g a day. Splitting it into smaller doses through the day keeps the tingle in check while it saturates over a few weeks.',
    detail:
      'Beta-alanine is well tolerated and its one notable effect — a tingling or flushing of the skin called paraesthesia — is completely harmless, just startling the first time. It comes on within minutes of a larger dose and can be avoided by splitting the daily amount into smaller servings or using a sustained-release form. There are no documented serious effects at standard supplement doses.',
    link: { label: 'Beta-alanine calculator', href: '/calculators/beta-alanine' },
  },
  {
    id: 'magnesium',
    name: 'Magnesium / ZMA',
    topic: 'Mineral',
    tier: 'use-sensibly',
    headline: 'Useful for many, but the wrong form sends you to the toilet.',
    common: [
      'Loose stools or diarrhoea, especially from magnesium oxide',
      'Gentler forms like citrate, glycinate or malate are easier on the gut',
    ],
    serious: ['Dangerous build-up is essentially only a risk with impaired kidney function'],
    avoid: [
      'Kidney disease — magnesium can accumulate; clear it with a doctor',
      'It can interact with some antibiotics and blood-pressure medication',
    ],
    safeDose: 'Most supplements provide 200 to 400mg of elemental magnesium a day. If you get loose stools, lower the dose or switch to a chelated form.',
    detail:
      'Magnesium is genuinely useful for many people and side effects are usually limited to loose stools or diarrhoea, driven mostly by cheap, poorly-absorbed magnesium oxide — switching to citrate, glycinate or malate normally fixes it. Serious build-up is only really a concern if your kidneys are impaired, since healthy kidneys clear the excess. It can also interact with some antibiotics and blood-pressure drugs, so mention it to your pharmacist if you take either.',
    link: { label: 'Build my stack', href: '/wizard' },
  },
  {
    id: 'omega-3',
    name: 'Omega-3 / fish oil',
    topic: 'Fatty Acid',
    tier: 'well-tolerated',
    headline: 'Very safe — the worst most people get is fishy burps.',
    common: ['Fishy aftertaste or burps', 'Mild stomach upset or loose stool at higher doses'],
    serious: ['Very high doses can slightly thin the blood'],
    avoid: [
      'On blood-thinning medication — mention high-dose fish oil to your doctor',
      'Around planned surgery, high doses may be paused on medical advice',
    ],
    safeDose: 'A common target is around 1 to 2g of combined EPA and DHA a day. Taking it with food and choosing a quality oil reduces the fishy burps.',
    detail:
      'Omega-3 fish oil is very well tolerated, with side effects usually limited to fishy burps and mild stomach upset that improve if you take it with food or use a fresh, quality oil. At very high doses it can have a mild blood-thinning effect, which only matters if you already take blood-thinning medication or are heading for surgery. For almost everyone else it is a low-risk supplement.',
    link: { label: 'Build my stack', href: '/wizard' },
  },
  {
    id: 'melatonin',
    name: 'Melatonin',
    topic: 'Sleep',
    tier: 'use-sensibly',
    headline: 'Prescription-only in the UK — and best used briefly, not nightly.',
    common: ['Morning grogginess', 'Vivid dreams', 'Daytime drowsiness if the dose is too high'],
    serious: ['Uncommon, but it can interact with several medications'],
    avoid: [
      'Pregnancy and breastfeeding',
      'Anyone on medication — check for interactions with a pharmacist',
    ],
    safeDose: 'In the UK melatonin is a prescription-only medicine, so the right dose and duration are a matter for your GP rather than an over-the-counter guess.',
    detail:
      'Melatonin is generally low-risk short-term, with side effects usually limited to morning grogginess and vivid dreams, and it works best for shifting sleep timing (like jet lag) rather than as a nightly sedative. Importantly, in the UK it is a prescription-only medicine, unlike in the US where it is sold freely — so if you want to use it, that is a conversation with your GP, who can also check it against any medication you take.',
    link: { label: 'Supplement timing planner', href: '/calculators/timing' },
  },
  {
    id: 'l-citrulline',
    name: 'L-citrulline',
    topic: 'Pre-Workout',
    tier: 'well-tolerated',
    headline: 'A very safe pump ingredient with few downsides.',
    common: ['Mild stomach discomfort, mostly at higher citrulline-malate doses'],
    serious: ['None documented at standard doses'],
    avoid: ['On blood-pressure medication — it mildly lowers blood pressure, so mention it'],
    safeDose: '6 to 8g of L-citrulline about 45 to 60 minutes before training. Pure L-citrulline is gentler on the stomach than large malate doses.',
    detail:
      'L-citrulline is one of the better-tolerated pre-workout ingredients, with the only common complaint being mild stomach discomfort at the larger citrulline-malate doses. It has a mild blood-pressure-lowering effect, which is generally welcome but worth mentioning if you already take blood-pressure medication. There are no documented serious effects at standard doses.',
    link: { label: 'Citrulline calculator', href: '/calculators/citrulline' },
  },
  {
    id: 'bcaas',
    name: 'BCAAs / EAAs',
    topic: 'Aminos',
    tier: 'well-tolerated',
    headline: 'Safe to take — the real cost is your wallet, not your health.',
    common: ['Minimal; occasional mild stomach upset'],
    serious: ['None documented at supplement doses'],
    avoid: ['No specific safety group; simply redundant if you already hit your protein target'],
    safeDose: 'There is no need to dose them at all if your daily protein is on point — whey and any complete protein already contain the full amino profile.',
    detail:
      'BCAAs and EAAs are safe, with side effects rarely amounting to more than occasional mild stomach upset. The honest catch is not a health one: if you already hit your daily protein target, a separate amino product adds almost nothing, because complete proteins like whey already supply the full set in better ratios. It is one of the most over-sold supplements in the shop — safe, but usually a waste of money.',
    link: { label: 'Build my stack', href: '/wizard' },
  },
  {
    id: 'multivitamin',
    name: 'Multivitamin',
    topic: 'Vitamin',
    tier: 'well-tolerated',
    headline: 'Low-risk insurance — just do not double up on fat-soluble vitamins.',
    common: [
      'Nausea if taken on an empty stomach',
      'Harmless bright-yellow urine from B vitamins',
    ],
    serious: ['Risk comes only from megadosing fat-soluble vitamins (A, D, E, K) or iron'],
    avoid: [
      'Stacking several products that all contain the same nutrients',
      'Extra iron unless you have been told you are deficient',
    ],
    safeDose: 'A standard once-daily multivitamin taken with food. Avoid layering multiple supplements that repeat the same vitamins and minerals.',
    detail:
      'A standard multivitamin is low-risk and mainly acts as insurance against dietary gaps, with side effects usually limited to nausea on an empty stomach and harmless yellow urine from B vitamins. The real risk is doubling up: fat-soluble vitamins (A, D, E and K) and iron accumulate in the body, so stacking several products that each contain them is where problems start. Take one product with food and check your labels are not repeating the same nutrients.',
    link: { label: 'Build my stack', href: '/wizard' },
  },
  {
    id: 'electrolytes',
    name: 'Electrolytes',
    topic: 'Hydration',
    tier: 'well-tolerated',
    headline: 'Safe for most — the one thing to watch is the sodium load.',
    common: ['None for most people at normal use'],
    serious: [
      'High sodium is a concern if you have high blood pressure',
      'Potassium is only dangerous with impaired kidney function',
    ],
    avoid: [
      'High blood pressure — watch the sodium content',
      'Kidney disease — potassium can build up; check with a doctor',
    ],
    safeDose: 'Match intake to how much you actually sweat. Everyday, lightly-active people rarely need a full high-sodium sachet on top of a normal diet.',
    detail:
      'Electrolyte supplements are safe and useful when you genuinely sweat a lot, and side effects are uncommon for most people. The two things to watch are the sodium load, which matters if you have high blood pressure, and potassium, which is only a real risk if your kidneys are impaired. For everyday, lightly-active people, a full high-sodium sachet is often more than the body needs.',
    link: { label: 'Build my stack', href: '/wizard' },
  },
  {
    id: 'test-boosters',
    name: 'Test boosters',
    topic: 'Hormones',
    tier: 'caution',
    headline: 'Mostly inert — the danger is what they distract you from.',
    common: ['Often none, because most do very little'],
    serious: [
      'Opaque proprietary blends can contain undisclosed or unlisted ingredients',
      'Relying on one can delay proper investigation of genuinely low testosterone',
    ],
    avoid: [
      'Anyone hoping to fix real symptoms — get a blood test, not a tub',
      'Blends that hide their doses behind a "proprietary" label',
    ],
    safeDose: 'No over-the-counter dose meaningfully raises testosterone in men with normal levels. The occasional useful ingredient (zinc, vitamin D) only helps if you were deficient.',
    detail:
      'Most over-the-counter test boosters have no meaningful effect on testosterone in men with normal levels, so the biggest problem is rarely a direct side effect — it is the opaque proprietary blends that can hide undisclosed ingredients, and the false reassurance that stops people investigating a real issue. Genuinely low testosterone is a medical condition diagnosed by blood work and treated by a clinician. If you have the symptoms, that is the route, not a tub off a shelf.',
    link: { label: 'How we flag overhyped products', href: '/watch-outs' },
  },
]

// Tier tallies for the headline stat and filter chips.
export function tierCounts(items: Safety[] = SAFETY): Record<SafetyTier, number> {
  return items.reduce(
    (acc, s) => {
      acc[s.tier] += 1
      return acc
    },
    { 'well-tolerated': 0, 'use-sensibly': 0, caution: 0 } as Record<SafetyTier, number>,
  )
}

// Natural FAQ question for a supplement, e.g.
// "Creatine" -> "What are the side effects of creatine, and is it safe?"
export function safetyQuestion(name: string): string {
  return `What are the side effects of ${name.toLowerCase()}, and is it safe?`
}
