// Supplement myths data — powers the /myths hub. Pure static data, zero DB, so
// the page can never fail at runtime. Every verdict is evidence-based and
// clinician-safe: we debunk marketing claims, we do not give medical advice.
//
// The verdict colours deliberately mirror the site's product scoring language
// (lime = good/true, amber = mixed, red = bad/myth) so the whole brand reads in
// one visual grammar: we score products green/amber/red, and we score the myths
// the same way.

export type Verdict = 'myth' | 'partly' | 'true'

export type Myth = {
  /** URL-safe id, also used as the anchor + React key. */
  id: string
  /** The claim exactly as people say it — the punchy card headline. */
  claim: string
  verdict: Verdict
  /** Short topic tag, e.g. "Creatine", "Protein", "Hormones". */
  topic: string
  /** One-line verdict summary shown on the collapsed card. */
  takeaway: string
  /** 2–4 sentence evidence-based reality, backs the FAQ schema 1:1. */
  reality: string
  /** Optional funnel link to a matching tool / ranking / guide. */
  link?: { label: string; href: string }
}

export const VERDICT_META: Record<
  Verdict,
  { label: string; color: string; noun: string }
> = {
  myth: { label: 'Myth', color: '#e05a2b', noun: 'outright myths' },
  partly: { label: 'Half True', color: '#f5a623', noun: 'half-truths' },
  true: { label: 'True', color: '#a6e22e', noun: 'confirmed true' },
}

// Ordered so the strongest, highest-search myths lead. Mixes in a couple of
// genuine "True" verdicts so the page reads as honest analysis, not a reflexive
// everything-is-fake wall.
export const MYTHS: Myth[] = [
  {
    id: 'creatine-hair-loss',
    claim: 'Creatine causes hair loss',
    verdict: 'myth',
    topic: 'Creatine',
    takeaway: 'No study has ever shown creatine causes hair loss.',
    reality:
      'This scare traces back to a single 2009 study of rugby players that measured a rise in DHT (a hormone linked to male-pattern baldness) but never measured any actual hair loss — and that DHT rise has not been confirmed by later studies, most of which did not re-measure DHT at all. Across decades of creatine research, hair loss has never been shown. If you are genetically prone to balding it will happen with or without creatine.',
    link: { label: 'Creatine guide', href: '/guide/creatine' },
  },
  {
    id: 'creatine-steroid',
    claim: 'Creatine is a steroid',
    verdict: 'myth',
    topic: 'Creatine',
    takeaway: 'Creatine is an amino-acid compound, not a hormone.',
    reality:
      'Creatine is a compound made from amino acids and stored in your muscles to recycle energy. It has no hormonal action whatsoever, which is why it is legal in every sport and sold in supermarkets. Steroids are synthetic hormones — a completely different class of molecule with completely different effects.',
    link: { label: 'Best creatine 2026', href: '/best/creatine' },
  },
  {
    id: 'creatine-kidneys',
    claim: 'Creatine damages your kidneys',
    verdict: 'myth',
    topic: 'Creatine',
    takeaway: 'No kidney harm in healthy people, even long term.',
    reality:
      'In healthy adults, long-term creatine use has repeatedly been shown to have no harmful effect on kidney function. The confusion comes from creatinine — a harmless breakdown product of creatine that can nudge a kidney blood marker upward without any actual damage. If you have existing kidney disease, clear any supplement with your doctor first.',
    link: { label: 'Creatine guide', href: '/guide/creatine' },
  },
  {
    id: 'creatine-cycling',
    claim: 'You need to cycle creatine on and off',
    verdict: 'myth',
    topic: 'Creatine',
    takeaway: 'Daily forever is fine — cycling just empties your stores.',
    reality:
      'There is no need to cycle creatine. Your muscles simply stay saturated while you take it and slowly return to baseline when you stop, so cycling off just means periodically losing the benefit for no reason. A steady 3 to 5g every day, training or not, is the whole protocol.',
    link: { label: 'Creatine dosage calculator', href: '/calculators/creatine' },
  },
  {
    id: 'anabolic-window',
    claim: 'You must eat protein within 30 minutes of training',
    verdict: 'partly',
    topic: 'Protein',
    takeaway: 'The "window" is hours wide — daily total matters far more.',
    reality:
      'The famous 30-minute anabolic window is far more forgiving than it sounds — research shows protein intake anywhere in the hours around training works well. What actually drives muscle growth is hitting your total daily protein target, spread across the day. A post-workout shake is convenient, not magic, and useless if the day as a whole falls short.',
    link: { label: 'Protein calculator', href: '/calculators/protein' },
  },
  {
    id: 'more-protein-more-muscle',
    claim: 'More protein always means more muscle',
    verdict: 'partly',
    topic: 'Protein',
    takeaway: 'Muscle gain plateaus around 1.6 to 2.2g per kg per day.',
    reality:
      'Protein is essential for building muscle, but the benefit plateaus: most research lands on roughly 1.6 to 2.2g per kg of bodyweight per day as the range that maximises muscle gain. Beyond that, extra protein is not converted into extra muscle — it is simply used for energy or excreted. More scoops past your target is spent money, not spare gains.',
    link: { label: 'Protein calculator', href: '/calculators/protein' },
  },
  {
    id: 'bcaas-build-muscle',
    claim: 'BCAAs build muscle',
    verdict: 'myth',
    topic: 'Aminos',
    takeaway: 'Redundant if you already hit your protein target.',
    reality:
      'Building muscle needs all nine essential amino acids, not just the three branched-chain ones in a BCAA tub. Whey and any complete protein already contain the full set in better ratios, so if you are hitting your daily protein target, a separate BCAA product adds almost nothing. It is one of the most over-sold supplements in the shop.',
    link: { label: 'Build my stack', href: '/wizard' },
  },
  {
    id: 'need-supplements',
    claim: 'You need supplements to build muscle',
    verdict: 'myth',
    topic: 'Training',
    takeaway: 'Food and training do the work — supplements just fill gaps.',
    reality:
      'Muscle is built by progressive training, enough total protein and enough calories — all of which you can get from food. Supplements are convenience and gap-filling, not a requirement: whey makes hitting protein easier, creatine adds a small proven edge, but neither is doing the heavy lifting. Anyone selling a powder as essential for gains is selling the marketing, not the muscle.',
    link: { label: 'Find my stack', href: '/wizard' },
  },
  {
    id: 'test-boosters',
    claim: 'Test boosters raise your testosterone',
    verdict: 'myth',
    topic: 'Hormones',
    takeaway: 'Over-the-counter "test boosters" do not meaningfully raise T.',
    reality:
      'The vast majority of over-the-counter test boosters — tribulus, most proprietary blends — have no meaningful effect on testosterone in men with normal levels. The occasional ingredient (like zinc or vitamin D) only helps if you were genuinely deficient. Genuinely low testosterone is a medical condition diagnosed by blood work and treated by a clinician, not a tub off a shelf.',
    link: { label: 'How we flag overhyped products', href: '/watch-outs' },
  },
  {
    id: 'pre-workout-heart',
    claim: 'Pre-workout is bad for your heart',
    verdict: 'partly',
    topic: 'Pre-Workout',
    takeaway: 'Fine for healthy adults at sensible caffeine doses.',
    reality:
      'A standard pre-workout is mostly caffeine, which is safe for healthy adults at sensible doses. The real risk is stacking too much: a strong scoop plus coffee can push you well past a sensible daily limit, and that is where the jitters and racing heart come from. Keep total caffeine under about 400mg a day, and if you have a heart condition or high blood pressure, check with a doctor first.',
    link: { label: 'Caffeine calculator', href: '/calculators/caffeine' },
  },
  {
    id: 'fat-burners',
    claim: 'Fat burners burn fat',
    verdict: 'myth',
    topic: 'Weight Loss',
    takeaway: 'A calorie deficit burns fat — not the tub.',
    reality:
      'Fat is lost through a sustained calorie deficit, full stop. Thermogenic fat burners lean almost entirely on caffeine for a tiny metabolic bump and an appetite nudge — the rest is proprietary-blend filler with no meaningful effect. You would get the same caffeine from a coffee for a fraction of the price.',
    link: { label: 'Supplement watch-outs', href: '/watch-outs' },
  },
  {
    id: 'whey-kidneys',
    claim: 'Whey protein damages your kidneys',
    verdict: 'myth',
    topic: 'Protein',
    takeaway: 'Safe for healthy people — high protein does not harm kidneys.',
    reality:
      'In people with healthy kidneys, higher-protein diets — including whey — have not been shown to cause kidney damage. This myth comes from advice given to people who already have kidney disease, where protein is genuinely restricted, wrongly generalised to everyone. If your kidneys are healthy, whey is simply a convenient protein source.',
    link: { label: 'Protein calculator', href: '/calculators/protein' },
  },
  {
    id: 'caffeine-works',
    claim: 'Caffeine genuinely boosts training performance',
    verdict: 'true',
    topic: 'Pre-Workout',
    takeaway: 'One of the few supplements with strong evidence behind it.',
    reality:
      'This one is true. Caffeine is among the most well-evidenced ergogenic aids there is, reliably improving strength, endurance and perceived effort at roughly 3 to 6mg per kg of bodyweight taken 45 to 60 minutes before training. It is the ingredient actually doing the work in most pre-workouts — the rest is often window dressing.',
    link: { label: 'Caffeine calculator', href: '/calculators/caffeine' },
  },
  {
    id: 'creatine-proven',
    claim: 'Creatine monohydrate is the most proven supplement there is',
    verdict: 'true',
    topic: 'Creatine',
    takeaway: 'Hundreds of studies, decades of use — it delivers.',
    reality:
      'True. Creatine monohydrate is backed by hundreds of studies over several decades showing genuine gains in strength, power and muscle, with a strong long-term safety record. It is cheap, it works, and the fancy "advanced" forms sold at a premium have never been shown to beat plain monohydrate. If you buy one supplement, this is the one with the evidence.',
    link: { label: 'Best creatine 2026', href: '/best/creatine' },
  },
]

// Verdict tallies for the headline stat and filter chips.
export function verdictCounts(myths: Myth[] = MYTHS): Record<Verdict, number> {
  return myths.reduce(
    (acc, m) => {
      acc[m.verdict] += 1
      return acc
    },
    { myth: 0, partly: 0, true: 0 } as Record<Verdict, number>,
  )
}

// Turn a claim into a natural FAQ question, e.g.
// "Creatine causes hair loss" -> "Is it true that creatine causes hair loss?"
export function claimAsQuestion(claim: string): string {
  const lowered = claim.charAt(0).toLowerCase() + claim.slice(1)
  return `Is it true that ${lowered}?`
}
