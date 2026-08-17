// Natural testosterone-support data — powers the /testosterone hub. Pure static
// data, zero DB, so the page can never fail at runtime. Every entry is
// evidence-based and deliberately clinician-safe: we rate what the research
// actually supports for supporting healthy testosterone, and we repeatedly defer
// genuine low-testosterone symptoms and any TRT question to a clinician.
//
// This fills a real gap and is squarely on-brand for the @dadthletelab TRT
// audience: "how to increase testosterone naturally", "do test boosters work",
// "best testosterone supplements UK", "does ashwagandha raise testosterone" are
// huge evergreen queries and the site touched them only inside /myths and
// /side-effects — there was no dedicated honest hub.
//
// The tier colours mirror the site's product-scoring language (lime = real
// evidence, amber = weak/situational, red = skip) so the whole brand reads in
// one visual grammar: we score products green/amber/red, and we score the
// testosterone claims the same way.

export type TestVerdict = 'works' | 'maybe' | 'skip'

export const TIER_META: Record<
  TestVerdict,
  { label: string; color: string; blurb: string }
> = {
  works: {
    label: 'Real Evidence',
    color: '#a6e22e',
    blurb: 'Genuinely supports healthy testosterone — usually by fixing a deficiency or a lifestyle leak, not by "boosting" a normal level past normal.',
  },
  maybe: {
    label: 'Weak / Situational',
    color: '#f5a623',
    blurb: 'Some evidence or a plausible mechanism, but small, mixed, or only relevant in specific cases. Not a reliable lever.',
  },
  skip: {
    label: 'Skip It',
    color: '#e05a2b',
    blurb: 'Repeatedly fails in decent trials, or is a marketing blend built on the ingredients that already failed. Your money is better spent elsewhere.',
  },
}

export type TestGroup = 'foundations' | 'nutrients' | 'herbals' | 'hyped'

export const GROUP_META: Record<TestGroup, { label: string }> = {
  foundations: { label: 'Foundations' },
  nutrients: { label: 'Vitamins & Minerals' },
  herbals: { label: 'Herbals' },
  hyped: { label: 'Overhyped' },
}

export type TestItem = {
  /** URL-safe id, also the anchor + React key. */
  id: string
  /** What people search, e.g. "Ashwagandha", "Sleep", "Tribulus Terrestris". */
  name: string
  /** Short tag shown on the card, e.g. "Lifestyle", "Mineral", "Herbal". */
  topic: string
  group: TestGroup
  tier: TestVerdict
  /** One-line summary shown on the collapsed card. */
  headline: string
  /** The marketing pitch, so the honest verdict has something to answer. */
  claim: string
  /** 2-4 sentence evidence-based summary; backs the FAQ schema 1:1. */
  detail: string
  /** Short plain-English "do this" recommendation. */
  bottomLine: string
  /** Optional funnel link to a matching ingredient / guide / hub. */
  link?: { label: string; href: string }
}

// Ordered foundations-first on purpose: the honest message is that the biggest
// levers are not pills. Then nutrients (help mainly if you are short), then the
// herbals, then the overhyped blends the whole category is built on.
export const TEST_ITEMS: TestItem[] = [
  // ---- Foundations: the real levers ----
  {
    id: 'sleep',
    name: 'Sleep',
    topic: 'Lifestyle',
    group: 'foundations',
    tier: 'works',
    headline: 'The single biggest natural lever — most of your testosterone is made while you sleep.',
    claim: 'Rarely sold to you, because nobody profits from it.',
    detail:
      'Testosterone is released largely during sleep, and cutting sleep to around five hours a night has been shown to drop daytime testosterone by roughly 10-15% in healthy young men within a week. That is a bigger swing than almost any supplement on this page will give you. Fixing broken or short sleep is the highest-value, lowest-cost thing most men can do for their hormones, and it costs nothing.',
    bottomLine: 'Get 7-9 hours consistently before you spend a penny on a "booster". No pill offsets chronic short sleep.',
    link: { label: 'Best supplements for sleep', href: '/sleep' },
  },
  {
    id: 'body-fat',
    name: 'Losing Excess Body Fat',
    topic: 'Lifestyle',
    group: 'foundations',
    tier: 'works',
    headline: 'Carrying too much fat lowers testosterone; losing it reliably raises it.',
    claim: 'The lever the supplement aisle would rather you ignored.',
    detail:
      'Excess body fat, especially around the middle, increases the aromatase enzyme that converts testosterone into oestrogen, and higher body fat is strongly linked to lower testosterone. In overweight and obese men, losing fat consistently raises testosterone in the research — sometimes substantially. This is a real, evidence-backed lever, not a marketing claim, and it improves far more than one hormone.',
    bottomLine: 'If you are carrying excess weight, fat loss is one of the most effective natural testosterone moves there is.',
    link: { label: 'TDEE & macro calculator', href: '/calculators/tdee' },
  },
  {
    id: 'resistance-training',
    name: 'Lifting Weights',
    topic: 'Lifestyle',
    group: 'foundations',
    tier: 'works',
    headline: 'Staying trained and lean supports healthy testosterone — chronic overtraining does the opposite.',
    claim: 'Sold indirectly by every "anabolic" supplement riding on the training you already do.',
    detail:
      'Resistance training produces short-term testosterone spikes, and more importantly, staying strong, active and lean supports healthy long-term levels. The flip side matters too: chronic overtraining, under-eating and constant fatigue can suppress testosterone, so more is not always better. Progressive, well-recovered lifting is the foundation the useful supplements sit on top of, not a substitute for.',
    bottomLine: 'Train hard, recover properly, avoid burning the candle at both ends. Sustainable beats maximal.',
    link: { label: 'Best supplements for men over 40', href: '/stacks/men-over-40' },
  },
  {
    id: 'alcohol',
    name: 'Cutting Back on Alcohol',
    topic: 'Lifestyle',
    group: 'foundations',
    tier: 'works',
    headline: 'Heavy, regular drinking suppresses testosterone; easing off lets it recover.',
    claim: 'Never sold, always overlooked.',
    detail:
      'Occasional drinking is not the issue, but heavy and chronic alcohol intake is a well-documented suppressor of testosterone and can also wreck the sleep that produces it. Pulling regular heavy drinking back toward moderate is a genuine, free way to remove a hormonal handbrake. It is far more effective than any tub trying to compensate for it.',
    bottomLine: 'If regular heavy drinking is in the picture, moderating it will do more than most supplements.',
  },

  // ---- Vitamins & minerals: help mainly if you are short ----
  {
    id: 'vitamin-d',
    name: 'Vitamin D',
    topic: 'Vitamin',
    group: 'nutrients',
    tier: 'works',
    headline: 'Worth fixing if you are deficient — which many people in the UK are in winter.',
    claim: 'Sold as a testosterone booster; really a deficiency-correction.',
    detail:
      'Vitamin D acts more like a hormone than a vitamin, and low levels are associated with lower testosterone. Correcting a genuine deficiency may modestly help, and UK winters leave a large share of people short, so it is a sensible baseline supplement for many. The honest caveat is that topping up when you are already replete does little for testosterone — the benefit is in fixing a shortfall, not in taking mega-doses on top of a normal level.',
    bottomLine: 'Reasonable to supplement (often 1000-2000 IU of D3) through winter, especially if you are indoors a lot. It corrects a shortfall rather than pushing a normal level higher.',
    link: { label: 'Vitamin D deep-dive', href: '/ingredients/vitamin-d3' },
  },
  {
    id: 'zinc',
    name: 'Zinc',
    topic: 'Mineral',
    group: 'nutrients',
    tier: 'works',
    headline: 'Real deficiency drags testosterone down — correcting it helps, mega-dosing does not.',
    claim: 'A staple of "test booster" labels, for a grain of truth.',
    detail:
      'Zinc is genuinely involved in testosterone production, and a real zinc deficiency lowers testosterone, so correcting a shortfall — common in heavy sweaters and some vegetarian diets — can help. The catch is the same as vitamin D: once you are replete, taking more does not push testosterone higher, and sustained high-dose zinc can deplete copper. It earns its place only as deficiency insurance, not as a lever to exceed a normal level.',
    bottomLine: 'A sensible daily dose (roughly 10-15mg) is fine as insurance; avoid long-term mega-doses. It fixes a shortfall, it does not supercharge a normal level.',
    link: { label: 'Zinc deep-dive', href: '/ingredients/zinc' },
  },
  {
    id: 'magnesium',
    name: 'Magnesium',
    topic: 'Mineral',
    group: 'nutrients',
    tier: 'maybe',
    headline: 'Modest, mostly if you are deficient or training hard — and worth taking anyway for sleep.',
    claim: 'Bundled into ZMA and sold on a small effect.',
    detail:
      'Magnesium supports hundreds of processes and some studies show a small testosterone benefit, particularly in people who are deficient or training hard. The effect on testosterone itself is modest and inconsistent, so it is not a reliable booster. That said, magnesium is worth taking for many people on its own merits — sleep, muscle function and general shortfall — and better sleep indirectly supports testosterone.',
    bottomLine: 'Reasonable to take (glycinate or citrate) for sleep and general health; treat any testosterone effect as a small bonus, not the reason.',
    link: { label: 'Magnesium deep-dive', href: '/ingredients/magnesium' },
  },
  {
    id: 'boron',
    name: 'Boron',
    topic: 'Mineral',
    group: 'nutrients',
    tier: 'maybe',
    headline: 'Small studies hint at a rise in free testosterone — interesting, not proven.',
    claim: 'A trendy trace mineral in newer booster blends.',
    detail:
      'A handful of small, short studies suggest boron at around 10mg a day may lower SHBG and nudge free testosterone up, which is mechanistically plausible. The evidence base is thin, short-term and not yet convincing enough to call reliable. It is cheap and low-risk at sensible doses, so it sits in "interesting but unproven" rather than "buy with confidence".',
    bottomLine: 'Low-risk and cheap if you want to experiment, but the evidence is too thin to count on. Not a foundation.',
  },

  // ---- Herbals ----
  {
    id: 'ashwagandha',
    name: 'Ashwagandha',
    topic: 'Adaptogen',
    group: 'herbals',
    tier: 'works',
    headline: 'The best-evidenced herbal here — a modest testosterone bump plus real stress and sleep benefits.',
    claim: 'The one herbal that mostly lives up to the marketing.',
    detail:
      'Ashwagandha, especially a standardised root extract like KSM-66, has several human trials showing a modest testosterone increase (often around 10-15%) in stressed, training or subfertile men, alongside clearer benefits for stress, cortisol and sleep. It is the strongest evidence-based pick of the herbals, though the testosterone effect is modest rather than dramatic and studied mostly in men who were stressed or run down to begin with. Buy a named, standardised extract rather than plain root powder so you actually get a known dose.',
    bottomLine: 'The one herbal worth trying: a standardised extract (e.g. KSM-66). Expect a modest bump plus genuine stress and sleep benefits, not a transformation.',
    link: { label: 'Ashwagandha deep-dive', href: '/ingredients/ashwagandha' },
  },
  {
    id: 'tongkat-ali',
    name: 'Tongkat Ali',
    topic: 'Herbal',
    group: 'herbals',
    tier: 'maybe',
    headline: 'Promising for stressed or older men, but quality and evidence are still catching up.',
    claim: 'The current darling of the natural-testosterone crowd.',
    detail:
      'Tongkat Ali (Eurycoma longifolia) has some encouraging research for free testosterone and stress, particularly in older or stressed men, and it is the most interesting of the newer herbals. The evidence is still limited and the market is plagued by adulterated or under-standardised products, so results depend heavily on getting a genuine, well-extracted supplement. It sits above the debunked blends but below the proven levers.',
    bottomLine: 'Worth a look if you want to experiment, but buy a reputable, standardised extract and keep expectations measured. The evidence is promising, not settled.',
  },
  {
    id: 'fenugreek',
    name: 'Fenugreek',
    topic: 'Herbal',
    group: 'herbals',
    tier: 'maybe',
    headline: 'Better evidence for libido than for testosterone itself.',
    claim: 'Sold for testosterone; delivers mostly on desire.',
    detail:
      'Fenugreek has reasonable evidence for improving libido and sexual function, and some studies suggest it helps maintain free testosterone, but the effect on testosterone levels themselves is mixed and generally small. If your main goal is drive rather than a lab number, it is one of the more defensible herbal choices. As a lever to raise measured testosterone, it is unreliable.',
    bottomLine: 'A fair pick if libido is the goal; do not expect it to move your testosterone number much.',
  },
  {
    id: 'maca',
    name: 'Maca',
    topic: 'Herbal',
    group: 'herbals',
    tier: 'skip',
    headline: 'Can help libido — but it does not raise testosterone, despite the shelf placement.',
    claim: 'Filed next to the test boosters; it is not one.',
    detail:
      'Maca has some evidence for improving libido and mood, which is genuinely why some people like it. What it does not do, in the research, is raise testosterone — its libido effect appears to work through other pathways. So it is a poor choice if your specific goal is boosting testosterone, even though it is often marketed and shelved as if it were a hormone booster.',
    bottomLine: 'Fine for libido if that is your aim, but do not buy it expecting a testosterone increase. For that goal, skip it.',
  },

  // ---- Overhyped: the ingredients the category is built on ----
  {
    id: 'tribulus',
    name: 'Tribulus Terrestris',
    topic: 'Herbal',
    group: 'hyped',
    tier: 'skip',
    headline: 'The classic "test booster" ingredient that repeatedly fails to raise testosterone in trials.',
    claim: 'The original test-booster hero. It does not deliver.',
    detail:
      'Tribulus terrestris is one of the most common ingredients in testosterone-boosting supplements and one of the most consistently debunked: controlled trials repeatedly show it does not raise testosterone in healthy men. Any libido effect it may have does not run through testosterone. It survives on legacy marketing, not results, and is a reliable sign a "booster" blend is padding rather than substance.',
    bottomLine: 'Skip it, and treat its presence on a label as a red flag for the whole product.',
    link: { label: 'Supplement myths, debunked', href: '/myths' },
  },
  {
    id: 'daa',
    name: 'D-Aspartic Acid (DAA)',
    topic: 'Amino Acid',
    group: 'hyped',
    tier: 'skip',
    headline: 'One promising early study, then larger trials found nothing — or the opposite.',
    claim: 'Sold on a single 2009 study the sequels could not back up.',
    detail:
      'D-aspartic acid got its reputation from an early short study showing a testosterone rise, but larger and longer follow-ups in resistance-trained men found no benefit, and some even reported a decrease. That pattern — one exciting result that fails to replicate — is exactly why it no longer holds up. It is a staple of booster blends purely because of the original headline.',
    bottomLine: 'Skip it. The weight of the evidence turned against it once the bigger trials came in.',
  },
  {
    id: 'test-booster-blends',
    name: '"Testosterone Booster" Blends',
    topic: 'Blend',
    group: 'hyped',
    tier: 'skip',
    headline: 'Usually the failed ingredients — tribulus, DAA, maca — bundled and underdosed behind a bold label.',
    claim: 'The whole product category, in one tub.',
    detail:
      'Most off-the-shelf "testosterone boosters" are proprietary blends of exactly the ingredients that do not reliably work — tribulus, D-aspartic acid, maca — often underdosed and hidden inside a proprietary blend so you cannot see how little of each you get. Where they include something useful like zinc or ashwagandha, it is usually cheaper and better dosed to buy on its own. You pay a premium for a bold label and a mix engineered for margin, not results.',
    bottomLine: 'Skip the blends. If you want the few things that help, buy the single proven ingredients at proper doses instead.',
    link: { label: 'Underdosed products to skip', href: '/watch-outs' },
  },
  {
    id: 'dhea',
    name: 'DHEA',
    topic: 'Hormone',
    group: 'hyped',
    tier: 'skip',
    headline: 'An actual hormone precursor — not an OTC supplement to self-source in the UK.',
    claim: 'Sold freely abroad; a different matter here.',
    detail:
      'DHEA is a genuine hormone precursor, not a herb or a nutrient, and that is exactly why it should not be treated like an off-the-shelf supplement. In the UK it is not sold as a general over-the-counter supplement, it is banned in sport under WADA, and self-dosing a hormone precursor without monitoring can have real effects on your own hormone balance. Any use belongs under a clinician who can test and monitor, not on a whim from an overseas website.',
    bottomLine: 'Do not self-source it. If DHEA is genuinely relevant to you, that is a conversation for a doctor, not a supplement purchase.',
  },
]

// Tallies for the headline stat + the honest "how many actually work" line.
export function itemCount(): number {
  return TEST_ITEMS.length
}

export function tierCount(tier: TestVerdict): number {
  return TEST_ITEMS.filter((i) => i.tier === tier).length
}

// Items in a given group (or all).
export function itemsInGroup(group: TestGroup | 'all'): TestItem[] {
  return group === 'all' ? TEST_ITEMS : TEST_ITEMS.filter((i) => i.group === group)
}

// Natural FAQ question for an item, e.g.
// "Ashwagandha" -> "Does ashwagandha boost testosterone?"
// Lifestyle foundations read naturally too ("Does sleep boost testosterone?").
export function testQuestion(name: string): string {
  const n = name.replace(/^"|"$/g, '')
  return `Does ${n.toLowerCase()} boost testosterone?`
}
