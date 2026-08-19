// Master supplement dosage data — powers the /dosage cheat-sheet hub. Pure
// static data, zero DB, so the page can never fail at runtime. Every entry is
// evidence-based and deliberately clinician-safe: general starting doses for
// healthy adults, with any prescription-only or condition-specific case handed
// back to a clinician.
//
// This fills a real gap and is squarely on-brand: the site has 14 per-supplement
// calculators and ~15 ingredient deep-dives, but NO single scannable "how much
// of everything should I take" reference. "supplement dosage chart", "how much
// creatine/beta-alanine/citrulline to take", "supplement dosing guide UK" are
// huge evergreen queries with no home, and this page becomes the connective
// tissue that links the whole calculator + ingredient estate together.
//
// The tier colours mirror the site's product-scoring language (lime = strong
// evidence, amber = moderate/situational, red = weak) so the whole brand reads
// in one visual grammar: we score products green/amber/red, and we score the
// evidence behind each supplement's dose the same way.

export type DoseTier = 'strong' | 'moderate' | 'weak'

export const TIER_META: Record<DoseTier, { label: string; color: string; blurb: string }> = {
  strong: {
    label: 'Strong Evidence',
    color: '#a6e22e',
    blurb: 'Consistently works at the dose shown in good human trials. Worth taking if it fits your goal.',
  },
  moderate: {
    label: 'Moderate / Situational',
    color: '#f5a623',
    blurb: 'Real but smaller or context-dependent evidence — helps in specific cases or fixes a shortfall, not a must-have.',
  },
  weak: {
    label: 'Weak / Skippable',
    color: '#e05a2b',
    blurb: 'Thin evidence, or redundant once the basics are covered. Rarely worth the money for most people.',
  },
}

export type DoseGroup = 'performance' | 'protein' | 'vitamins' | 'recovery'

export const GROUP_META: Record<DoseGroup, { label: string }> = {
  performance: { label: 'Performance & Pump' },
  protein: { label: 'Protein & Aminos' },
  vitamins: { label: 'Vitamins & Minerals' },
  recovery: { label: 'Recovery & Hormone' },
}

export type DoseItem = {
  /** URL-safe id, also the anchor + React key. */
  id: string
  /** What people search, e.g. "Creatine", "Beta-Alanine". */
  name: string
  /** Short tag shown on the card, e.g. "Ergogenic", "Mineral", "Protein". */
  topic: string
  group: DoseGroup
  tier: DoseTier
  /** The headline number — the effective daily/serving dose. Shown on the card. */
  dose: string
  /** When to take it. Shown on the card. */
  timing: string
  /** Which form to buy / how to read the label. */
  form: string
  /** Honest "more is not better" ceiling line — the differentiator of this page. */
  ceiling: string
  /** 2-4 sentence evidence-based summary; backs the FAQ schema 1:1. */
  detail: string
  /** Funnel link to a matching calculator / ingredient / guide. */
  link?: { label: string; href: string }
}

// Ordered by evidence within each group so the things that actually work lead.
export const DOSE_ITEMS: DoseItem[] = [
  // ---- Performance & Pump ----
  {
    id: 'creatine',
    name: 'Creatine',
    topic: 'Ergogenic',
    group: 'performance',
    tier: 'strong',
    dose: '3–5 g/day',
    timing: 'Any time, every day',
    form: 'Monohydrate (Creapure if you want certified). Ignore pricier "advanced" forms — none beat monohydrate.',
    ceiling: 'Flat dose — it does not scale with bodyweight, and more than 5 g/day just passes through you.',
    detail:
      'Creatine monohydrate is the most-researched sports supplement there is, and the maintenance dose is a flat 3 to 5 grams every day regardless of your size. An optional loading phase of about 20 g/day (4 x 5 g) for 5 to 7 days fills your muscle stores faster, but you reach the same end point either way. Consistency matters far more than timing — take it whenever you will remember.',
    link: { label: 'Creatine dosage calculator', href: '/calculators/creatine' },
  },
  {
    id: 'caffeine',
    name: 'Caffeine',
    topic: 'Stimulant',
    group: 'performance',
    tier: 'strong',
    dose: '3–6 mg/kg (~150–400 mg)',
    timing: '30–60 min pre-workout',
    form: 'Anhydrous (powder/capsule) or a dialled pre-workout. Know your total from coffee too.',
    ceiling: 'Past ~400 mg in one hit the jitters, blood-pressure bump and wrecked sleep outweigh the gains.',
    detail:
      'Caffeine is the one pre-workout ingredient that reliably improves performance, in the studied range of roughly 3 to 6 mg per kg of bodyweight taken 30 to 60 minutes before training. We treat 400 mg in a single serving as the ceiling, and EFSA puts the safe daily limit for healthy adults at 400 mg from all sources. If you train in the evening, caffeine has a 5 to 6 hour half-life and will cost you sleep — switch to stim-free.',
    link: { label: 'Caffeine calculator', href: '/calculators/caffeine' },
  },
  {
    id: 'beta-alanine',
    name: 'Beta-Alanine',
    topic: 'Ergogenic',
    group: 'performance',
    tier: 'strong',
    dose: '3.2–6.4 g/day',
    timing: 'Any time — split to limit the tingle',
    form: 'Plain beta-alanine powder, or sustained-release if the paraesthesia bothers you.',
    ceiling: 'It saturates like creatine — one big dose does nothing acute, and above ~6.4 g/day adds only tingling.',
    detail:
      'Beta-alanine raises muscle carnosine over 2 to 4 weeks, which buffers fatigue in efforts lasting roughly 1 to 4 minutes. The ISSN puts the effective dose at 3.2 to 6.4 g/day, best split into smaller servings to control the harmless pins-and-needles (paraesthesia). Like creatine it is cumulative, not acute — the time of day is irrelevant, only the daily total over weeks. Most pre-workouts underdose it, so a standalone tub is usually the honest way to hit the number.',
    link: { label: 'Beta-alanine calculator', href: '/calculators/beta-alanine' },
  },
  {
    id: 'l-citrulline',
    name: 'L-Citrulline',
    topic: 'Pump',
    group: 'performance',
    tier: 'moderate',
    dose: '6–8 g pure (or ~10 g malate)',
    timing: '45–60 min pre-workout',
    form: 'Pure L-citrulline, or citrulline malate 2:1 (≈67% citrulline — so 10 g malate ≈ 6.7 g citrulline).',
    ceiling: 'A per-session dose, not cumulative — doubling it just wastes powder rather than doubling the pump.',
    detail:
      'L-citrulline raises nitric oxide to support blood flow and "pump", with modest evidence for endurance and reduced soreness. The effective dose is 6 to 8 g of pure L-citrulline, or around 9 to 12 g of citrulline malate (which is only about two-thirds citrulline, so it takes more to reach the same citrulline dose), taken 45 to 60 minutes before training. It is acute like caffeine, not saturating like creatine. Watch pre-workout labels: a 2:1 malate blend at "6 g" only gives you around 4 g of actual citrulline.',
    link: { label: 'Citrulline calculator', href: '/calculators/citrulline' },
  },
  {
    id: 'betaine',
    name: 'Betaine',
    topic: 'Ergogenic',
    group: 'performance',
    tier: 'moderate',
    dose: '2.5 g/day',
    timing: 'Any time, daily',
    form: 'Betaine anhydrous (trimethylglycine). Often underdosed inside pre-workout blends.',
    ceiling: 'The trialled dose is a flat 2.5 g — there is no evidence that stacking more does anything extra.',
    detail:
      'Betaine anhydrous has a reasonable body of evidence for small improvements in power and strength at a consistent 2.5 g/day, taken daily rather than only pre-workout. It is one of the more credible "secondary" pre-workout actives. The catch is that most blends include a fraction of the studied dose, so check the label — if it is not close to 2.5 g, you are not getting the effect that was tested.',
    link: { label: 'Betaine deep-dive', href: '/ingredients/betaine-anhydrous' },
  },
  {
    id: 'l-theanine',
    name: 'L-Theanine',
    topic: 'Nootropic',
    group: 'performance',
    tier: 'moderate',
    dose: '100–200 mg',
    timing: 'With your caffeine',
    form: 'Pair roughly 1:1 to 2:1 with caffeine to smooth the jitters.',
    ceiling: 'It is a companion to caffeine, not a stimulant itself — more will not add energy.',
    detail:
      'L-theanine is an amino acid from tea that takes the edge off caffeine — pairing 100 to 200 mg with your caffeine dose (roughly 1:1 to 2:1) can give a calmer, smoother focus with fewer jitters. On its own it does nothing for performance; its whole value is as a caffeine companion. It is cheap, safe and one of the few "focus" ingredients with sensible evidence behind it.',
    link: { label: 'L-theanine deep-dive', href: '/ingredients/l-theanine' },
  },
  {
    id: 'taurine',
    name: 'Taurine',
    topic: 'Ergogenic',
    group: 'performance',
    tier: 'moderate',
    dose: '1–2 g',
    timing: 'Pre-workout',
    form: 'Plain taurine powder; a common (usually underdosed) pre-workout filler.',
    ceiling: 'Above ~2 g the evidence flattens out — a bigger scoop does not buy more endurance.',
    detail:
      'Taurine has modest evidence for endurance and cellular hydration at 1 to 2 g, usually taken pre-workout. It is safe and inexpensive, but the effect is small and it is frequently sprinkled into pre-workouts at token amounts. Treat it as a minor, nice-to-have active rather than a reason to buy a product.',
    link: { label: 'Taurine deep-dive', href: '/ingredients/taurine' },
  },
  {
    id: 'l-tyrosine',
    name: 'L-Tyrosine',
    topic: 'Nootropic',
    group: 'performance',
    tier: 'weak',
    dose: '500–2000 mg',
    timing: '30–60 min pre-workout',
    form: 'Plain L-tyrosine. N-acetyl-tyrosine (NALT) is poorly absorbed — the plain form is better.',
    ceiling: 'Only shows an effect under real stress or sleep loss — on a normal day it does little.',
    detail:
      'L-tyrosine is a precursor to focus-related neurotransmitters, and the evidence mostly shows it helping cognition under acute stress, sleep deprivation or cold — not in a well-rested lifter on a normal day. Doses in studies range widely from 500 mg up to around 2 g. It is safe but situational, so treat any pre-workout focus benefit as minor.',
    link: { label: 'L-tyrosine deep-dive', href: '/ingredients/l-tyrosine' },
  },
  {
    id: 'electrolytes',
    name: 'Electrolytes',
    topic: 'Hydration',
    group: 'performance',
    tier: 'moderate',
    dose: '~300–700 mg sodium / hr sweating',
    timing: 'During long or hot sessions',
    form: 'A sodium-led electrolyte mix. Sugar-free is fine; you mainly need the sodium.',
    ceiling: 'For a short indoor session with water to hand, you almost certainly do not need them.',
    detail:
      'Electrolytes matter when you are actually losing a lot through sweat — long sessions, heat, or heavy sweaters — where replacing sodium (roughly 300 to 700 mg per hour, more for salty sweaters) helps maintain performance and hydration. For a normal hour in an air-conditioned gym with a water bottle, plain water and a normal diet cover it. It is a situational tool, not a daily essential.',
    link: { label: 'Electrolytes deep-dive', href: '/ingredients/electrolytes' },
  },

  // ---- Protein & Aminos ----
  {
    id: 'whey-protein',
    name: 'Whey Protein',
    topic: 'Protein',
    group: 'protein',
    tier: 'strong',
    dose: '20–40 g/serving',
    timing: 'Any time — total daily protein is what counts',
    form: 'Concentrate for value, isolate if lactose-sensitive or cutting hard. Avoid amino-spiked blends.',
    ceiling: 'A shake past ~40 g is fine but not "more anabolic" — total daily protein (1.6–2.2 g/kg) drives growth.',
    detail:
      'Whey is simply a convenient way to hit your daily protein target of roughly 1.6 to 2.2 g per kg of bodyweight, which is what actually drives muscle — not any magic in the powder. A 20 to 40 g serving delivers the ~2 to 3 g of leucine that maximally triggers muscle protein synthesis. The "anabolic window" is far wider than the industry implies: spread protein across the day and total intake matters more than timing any single shake.',
    link: { label: 'Protein calculator', href: '/calculators/protein' },
  },
  {
    id: 'casein',
    name: 'Casein',
    topic: 'Protein',
    group: 'protein',
    tier: 'moderate',
    dose: '20–40 g',
    timing: 'Before bed / long gaps',
    form: 'Micellar casein for the slow release. A cheaper Greek yoghurt does a similar job.',
    ceiling: 'The slow-digesting angle is real but minor — if your daily protein is high, casein is optional.',
    detail:
      'Casein digests slowly, giving a longer, lower amino-acid drip than whey, which is why it is often taken before bed or before a long gap without food. The evidence for a meaningful overnight-recovery edge is modest — total daily protein still does most of the work. It is a reasonable convenience for hitting your target, not a supplement that unlocks anything whey cannot.',
    link: { label: 'Casein guide', href: '/guide/casein' },
  },
  {
    id: 'eaas',
    name: 'EAAs',
    topic: 'Amino Acids',
    group: 'protein',
    tier: 'moderate',
    dose: '6–15 g',
    timing: 'Fasted training / low-protein days',
    form: 'A full EAA blend (all nine essentials), not a BCAA-only product.',
    ceiling: 'If you already hit your daily protein target, whole protein makes EAAs redundant.',
    detail:
      'Essential amino acids provide the full set of building blocks for muscle protein synthesis, and 6 to 15 g can be useful if you train fasted or struggle to hit your protein target. The important caveat: for anyone eating enough total protein, a normal meal or whey shake already supplies all the EAAs, making a separate product redundant. They earn their place only in specific low-protein or fasted situations.',
    link: { label: 'EAAs guide', href: '/guide/eaas' },
  },
  {
    id: 'leucine',
    name: 'Leucine',
    topic: 'Amino Acid',
    group: 'protein',
    tier: 'weak',
    dose: '2–3 g (per protein feed)',
    timing: 'With a low-protein meal',
    form: 'Usually unnecessary as a standalone — a proper protein serving already contains it.',
    ceiling: 'Leucine alone triggers the signal but cannot build muscle without the other aminos present.',
    detail:
      'Leucine is the amino acid that flips the "build muscle" switch, and about 2 to 3 g per feed maximises that signal. But flipping the switch without the other amino acids present does not build much — which is why a whole 20 to 40 g protein serving (already rich in leucine) beats dosing leucine on its own. As a standalone it is rarely worth buying; it makes sense only to top up a genuinely low-protein plant meal.',
    link: { label: 'Leucine deep-dive', href: '/ingredients/leucine' },
  },
  {
    id: 'bcaas',
    name: 'BCAAs',
    topic: 'Amino Acids',
    group: 'protein',
    tier: 'weak',
    dose: '5–10 g',
    timing: '—',
    form: 'Largely superseded by EAAs, which include the BCAAs plus the rest.',
    ceiling: 'Missing 6 of the 9 essential aminos, so they cannot maximise muscle protein synthesis on their own.',
    detail:
      'BCAAs (leucine, isoleucine, valine) were a huge seller, but the evidence has moved on: with only three of the nine essential amino acids, they cannot sustain muscle protein synthesis by themselves, and for anyone eating adequate protein they add nothing. If you want an intra-workout amino product, a full EAA blend is the better buy. For most people BCAAs are money better spent on whole protein.',
    link: { label: 'Supplement myths, debunked', href: '/myths' },
  },
  {
    id: 'glutamine',
    name: 'Glutamine',
    topic: 'Amino Acid',
    group: 'protein',
    tier: 'weak',
    dose: '5 g (commonly sold)',
    timing: '—',
    form: 'Widely sold, weakly supported for training in healthy, well-fed lifters.',
    ceiling: 'Your body makes plenty and your diet supplies more — extra rarely shows a training benefit.',
    detail:
      'Glutamine is a staple on supplement shelves, usually at around 5 g, but for healthy, well-nourished lifters the training evidence is thin — it does not reliably improve muscle growth, recovery or immunity in that group. It has legitimate uses in clinical settings, which is a different context entirely. For the average gym-goer it is one of the easiest supplements to cut.',
    link: { label: 'Underdosed products to skip', href: '/watch-outs' },
  },

  // ---- Vitamins & Minerals ----
  {
    id: 'vitamin-d3',
    name: 'Vitamin D3',
    topic: 'Vitamin',
    group: 'vitamins',
    tier: 'strong',
    dose: '1000–2000 IU (25–50 µg)/day',
    timing: 'With a meal containing fat',
    form: 'D3 (cholecalciferol) over D2. The UK advises 10 µg (400 IU) minimum through winter.',
    ceiling: 'Correcting a shortfall helps; megadosing on top of a normal level does not, and very high intakes can harm.',
    detail:
      'Vitamin D acts more like a hormone than a vitamin, and a large share of people in the UK run low over winter, which is why supplementing 1000 to 2000 IU (25 to 50 µg) of D3 daily is sensible baseline insurance. The benefit is in correcting a genuine shortfall — for bone, immune and general health — not in "boosting" an already-normal level. Long-term high doses can push blood calcium too high, so more is not better; if in doubt, a blood test settles it.',
    link: { label: 'Vitamin D3 deep-dive', href: '/ingredients/vitamin-d3' },
  },
  {
    id: 'omega-3',
    name: 'Omega-3 (Fish Oil)',
    topic: 'Fatty Acid',
    group: 'vitamins',
    tier: 'moderate',
    dose: '1–2 g combined EPA+DHA/day',
    timing: 'With a meal',
    form: 'Read the EPA+DHA numbers, not the total fish-oil weight — that is where cheap products hide.',
    ceiling: 'Beyond ~3 g EPA+DHA there is little added benefit for general health, and blood-thinning rises.',
    detail:
      'The useful part of fish oil is the EPA and DHA, and 1 to 2 g combined per day covers most general-health and anti-inflammatory goals, especially if you rarely eat oily fish. The trap is the label: a "1000 mg fish oil" capsule may contain only 300 mg of actual EPA+DHA, so read those two numbers directly. Very high intakes offer little extra and can thin the blood, so there is no need to megadose.',
    link: { label: 'Browse omega-3 & health', href: '/products?category=omega-3' },
  },
  {
    id: 'zinc',
    name: 'Zinc',
    topic: 'Mineral',
    group: 'vitamins',
    tier: 'moderate',
    dose: '10–15 mg/day (insurance)',
    timing: 'With food (not alongside iron/calcium)',
    form: 'Zinc picolinate, citrate or gluconate. Avoid taking with a high-calcium meal.',
    ceiling: 'The safe upper limit is ~40 mg/day — sustained megadoses deplete copper and upset your gut.',
    detail:
      'Zinc is genuinely involved in testosterone, immunity and recovery, and correcting a real deficiency (common in heavy sweaters and some plant-based diets) helps. A sensible 10 to 15 mg/day covers most people as insurance. Once you are replete, more does nothing extra, and sustained doses near or above the 40 mg upper limit can deplete copper and cause nausea — so this is a shortfall-fixer, not a lever to exceed normal.',
    link: { label: 'Zinc deep-dive', href: '/ingredients/zinc' },
  },
  {
    id: 'magnesium',
    name: 'Magnesium',
    topic: 'Mineral',
    group: 'vitamins',
    tier: 'moderate',
    dose: '200–400 mg elemental/day',
    timing: 'Evening',
    form: 'Glycinate or citrate (well absorbed, gentle). Oxide is cheap but poorly absorbed and laxative.',
    ceiling: 'Above ~400 mg from supplements the main result is loose stools, not extra benefit.',
    detail:
      'Magnesium supports muscle function, sleep and hundreds of enzyme reactions, and many people fall short of the target intake. Supplementing 200 to 400 mg of elemental magnesium in the evening is reasonable, particularly for sleep and if you train hard. Choose the form carefully — glycinate or citrate are well absorbed, whereas cheap oxide is mostly a laxative. Going higher tends to loosen your bowels rather than help.',
    link: { label: 'Magnesium deep-dive', href: '/ingredients/magnesium' },
  },
  {
    id: 'multivitamin',
    name: 'Multivitamin',
    topic: 'Vitamin',
    group: 'vitamins',
    tier: 'weak',
    dose: '1 serving/day',
    timing: 'With a meal',
    form: 'A sensible one-a-day at around 100% RDA — not a mega-dosed "sports" formula.',
    ceiling: 'It is dietary insurance, not a performance supplement — it will not do anything you can feel.',
    detail:
      'A basic multivitamin is cheap insurance against small dietary gaps, which is a fair reason to take one, but it is not a performance supplement and you will not feel it working. Beware mega-dosed "athlete" formulas: hitting several hundred percent of the RDA on fat-soluble vitamins or minerals is pointless at best. A good diet remains the real multivitamin; the tub just covers the edges.',
    link: { label: 'Multivitamin guide', href: '/guide/multivitamin' },
  },
  {
    id: 'vitamin-c',
    name: 'Vitamin C',
    topic: 'Vitamin',
    group: 'vitamins',
    tier: 'weak',
    dose: '~200 mg/day is plenty',
    timing: 'With a meal',
    form: 'Any standard vitamin C. There is no need for high-dose "immune" tubs.',
    ceiling: 'Above ~200 mg absorption falls off and the excess is simply urinated out.',
    detail:
      'Vitamin C is essential, but the body becomes saturated at modest intakes — around 200 mg a day covers requirements for most people, and higher doses are largely excreted. The gram-dose "immune-boosting" products are mostly expensive urine. There is even a theoretical case that very high antioxidant doses could blunt some training adaptations, so there is no reason to megadose it.',
    link: { label: 'Vitamin guide', href: '/guide/vitamin' },
  },

  // ---- Recovery & Hormone ----
  {
    id: 'ashwagandha',
    name: 'Ashwagandha',
    topic: 'Adaptogen',
    group: 'recovery',
    tier: 'moderate',
    dose: '300–600 mg standardised/day',
    timing: 'Daily (many prefer evening)',
    form: 'A named, standardised root extract (e.g. KSM-66) — not plain root powder at an unknown dose.',
    ceiling: 'The trialled range tops out around 600 mg — piling on more has not been shown to add benefit.',
    detail:
      'Ashwagandha is the best-evidenced herbal here, with human trials showing reduced stress and cortisol, better sleep, and a modest testosterone bump — mostly in people who were stressed or run down to begin with. The studied dose is 300 to 600 mg/day of a standardised root extract like KSM-66. Buy a named extract so you actually get the dose that was tested, and expect a modest, genuine effect rather than a transformation.',
    link: { label: 'Ashwagandha deep-dive', href: '/ingredients/ashwagandha' },
  },
  {
    id: 'collagen',
    name: 'Collagen',
    topic: 'Connective Tissue',
    group: 'recovery',
    tier: 'moderate',
    dose: '15 g + vitamin C',
    timing: '30–60 min before training/rehab',
    form: 'Hydrolysed collagen peptides, taken with vitamin C to support synthesis.',
    ceiling: 'Not a muscle protein — count it toward tendons/joints, not your daily protein target.',
    detail:
      'For tendon, ligament and joint support there is growing evidence that 15 g of hydrolysed collagen with vitamin C, taken 30 to 60 minutes before loading the tissue, can help connective-tissue synthesis. Note it is a low-quality muscle protein (missing key aminos), so it does not count toward your muscle-building protein target — it is a joint tool, not a whey substitute. Reasonable if you have niggles; optional otherwise.',
    link: { label: 'Browse recovery & health', href: '/products?category=joint-health' },
  },
  {
    id: 'melatonin',
    name: 'Melatonin',
    topic: 'Sleep',
    group: 'recovery',
    tier: 'moderate',
    dose: '0.5–2 mg (UK: prescription only)',
    timing: '30–60 min before bed',
    form: 'In the UK melatonin is a prescription-only medicine — not an over-the-counter supplement.',
    ceiling: 'For sleep, lower doses (0.5–1 mg) often work as well as higher ones — bigger is not better.',
    detail:
      'Melatonin can help with sleep timing and jet lag, and the evidence favours low doses (0.5 to 2 mg) taken 30 to 60 minutes before bed over the large doses sold abroad. Important for UK readers: melatonin is a prescription-only medicine here, not something to buy over the counter or import casually — that is a conversation for your GP or pharmacist. Nail sleep hygiene first; it does more than any pill.',
    link: { label: 'Supplements for sleep', href: '/sleep' },
  },
]

// ---- Helpers (mirror the testosterone/side-effects hubs) ----

export function itemCount(): number {
  return DOSE_ITEMS.length
}

export function tierCount(tier: DoseTier): number {
  return DOSE_ITEMS.filter((i) => i.tier === tier).length
}

export function itemsInGroup(group: DoseGroup | 'all'): DoseItem[] {
  return group === 'all' ? DOSE_ITEMS : DOSE_ITEMS.filter((i) => i.group === group)
}

// Natural FAQ question for an item, e.g.
// "Creatine" -> "How much creatine should I take?"
export function doseQuestion(name: string): string {
  const n = name.replace(/\s*\(.*\)\s*/g, '').trim()
  return `How much ${n.toLowerCase()} should I take?`
}
