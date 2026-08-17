// Sleep & recovery data — powers the /sleep hub. Pure static data, zero DB, so
// the page can never fail at runtime. Every entry is evidence-based and
// deliberately clinician-safe: we rate what the research actually supports for
// sleep and recovery, and we repeatedly defer genuine insomnia and any drug
// interaction to a clinician or pharmacist.
//
// This fills a real gap and is squarely on-brand: sleep is already named the #1
// natural-testosterone lever on /testosterone, yet the site had no dedicated
// sleep surface. "best supplements for sleep UK", "does magnesium help you
// sleep", "is melatonin legal in the UK", "does ashwagandha help sleep" are huge
// evergreen queries only ever touched tangentially inside /side-effects and
// /testosterone.
//
// The tier colours mirror the site's product-scoring language (lime = real
// evidence, amber = weak/situational, red = skip) so the whole brand reads in
// one visual grammar: we score products green/amber/red, and we score the sleep
// claims the same way.

export type SleepVerdict = 'works' | 'maybe' | 'skip'

export const TIER_META: Record<
  SleepVerdict,
  { label: string; color: string; blurb: string }
> = {
  works: {
    label: 'Real Evidence',
    color: '#a6e22e',
    blurb: 'Genuinely helps sleep, or the circadian rhythm behind it — mostly the free habits, plus a couple of supplements used for the right reason.',
  },
  maybe: {
    label: 'Weak / Situational',
    color: '#f5a623',
    blurb: 'Some evidence or a sensible mechanism, but small, mixed, or mainly useful if anxiety or a genuine shortfall is the real problem.',
  },
  skip: {
    label: 'Skip It',
    color: '#e05a2b',
    blurb: 'Poorly absorbed, thin evidence, or a marketing blend. Better sleep is somewhere else on this list.',
  },
}

export type SleepGroup = 'foundations' | 'minerals' | 'calming' | 'hormonal' | 'hyped'

export const GROUP_META: Record<SleepGroup, { label: string }> = {
  foundations: { label: 'Foundations' },
  minerals: { label: 'Minerals' },
  calming: { label: 'Calming Compounds' },
  hormonal: { label: 'Hormonal & Adaptogens' },
  hyped: { label: 'Overhyped' },
}

export type SleepItem = {
  /** URL-safe id, also the anchor + React key. */
  id: string
  /** What people search, e.g. "Melatonin", "Magnesium", "GABA". */
  name: string
  /** Short tag shown on the card, e.g. "Habit", "Mineral", "Amino Acid". */
  topic: string
  group: SleepGroup
  tier: SleepVerdict
  /** One-line summary shown on the collapsed card. */
  headline: string
  /** The marketing pitch, so the honest verdict has something to answer. */
  claim: string
  /** 2-4 sentence evidence-based summary; backs the FAQ schema 1:1. */
  detail: string
  /** Short plain-English "do this" recommendation. */
  bottomLine: string
  /** Natural FAQ question, authored so every card reads well. */
  q: string
  /** Optional funnel link to a matching ingredient / calculator / hub. */
  link?: { label: string; href: string }
}

// Ordered foundations-first on purpose: the honest message is that the biggest
// levers are free habits, not pills. Then the minerals, the calming compounds,
// the genuinely hormonal options, then the overhyped blends to skip.
export const SLEEP_ITEMS: SleepItem[] = [
  // ---- Foundations: the real levers, and they are free ----
  {
    id: 'sleep-schedule',
    name: 'A Consistent Sleep Schedule',
    topic: 'Habit',
    group: 'foundations',
    tier: 'works',
    headline: 'The single biggest lever — a fixed wake time anchors everything else.',
    claim: 'Rarely sold to you, because nobody profits from it.',
    detail:
      'Your body clock runs on regularity, and the most reliable way to sleep better is to keep a consistent wake time seven days a week, even after a bad night. A steady schedule strengthens the natural rise and fall of melatonin and body temperature that make you sleepy at the right time. No supplement on this page will out-perform simply going to bed and, crucially, waking up at roughly the same time every day.',
    bottomLine: 'Anchor your wake time first. It is free, it is the strongest lever, and it makes every supplement below matter less.',
    q: 'Does a consistent sleep schedule improve sleep?',
  },
  {
    id: 'caffeine-timing',
    name: 'Caffeine Timing',
    topic: 'Habit',
    group: 'foundations',
    tier: 'works',
    headline: 'Caffeine has a long half-life — an afternoon coffee is still in you at bedtime.',
    claim: 'The problem the "PM formula" pretends to solve for you.',
    detail:
      'Caffeine has a half-life of roughly five to six hours, so a quarter of a mid-afternoon dose can still be circulating when you try to sleep. Even when it does not stop you falling asleep, late caffeine measurably reduces deep sleep, so you wake less rested. Cutting your last caffeine to around eight to ten hours before bed is one of the highest-value changes a heavy pre-workout or coffee drinker can make.',
    bottomLine: 'Set a caffeine cut-off (early afternoon for most people). It does more for sleep than any night-time capsule.',
    link: { label: 'Caffeine half-life calculator', href: '/calculators/caffeine' },
    q: 'Does caffeine timing affect sleep?',
  },
  {
    id: 'alcohol',
    name: 'Cutting Alcohol Before Bed',
    topic: 'Habit',
    group: 'foundations',
    tier: 'works',
    headline: 'A nightcap knocks you out, then wrecks the second half of the night.',
    claim: 'Marketed as a wind-down; it is the opposite.',
    detail:
      'Alcohol is a sedative, so it can help you fall asleep faster, but that is where the benefit ends. As it clears overnight it fragments the second half of your sleep and suppresses REM, which is why a few drinks so often means waking at 3am unrefreshed. Removing alcohol close to bedtime is one of the clearest, best-evidenced ways to sleep more deeply.',
    bottomLine: 'A nightcap is not a sleep aid. Keeping alcohol away from bedtime reliably improves how deep and unbroken your sleep is.',
    q: 'Does alcohol before bed help you sleep?',
  },
  {
    id: 'light',
    name: 'Light & Screens',
    topic: 'Habit',
    group: 'foundations',
    tier: 'works',
    headline: 'Bright evening light delays melatonin; morning daylight sets the clock.',
    claim: 'The reason a "blue-light blocker" supplement makes no sense.',
    detail:
      'Light is the master signal for your body clock: bright light in the evening, including from phones and bright rooms, delays melatonin release and pushes your sleep later. The flip side is that getting daylight early in the day helps anchor the rhythm so you feel sleepy at a sensible hour. Dimming lights in the last hour and keeping the bedroom dark and cool does more than any pill aimed at the same problem.',
    bottomLine: 'Bright light in the morning, dim and screen-light in the evening, dark cool room. Cheap, and genuinely effective.',
    q: 'Does light and screen time affect sleep?',
  },

  // ---- Minerals ----
  {
    id: 'magnesium',
    name: 'Magnesium',
    topic: 'Mineral',
    group: 'minerals',
    tier: 'maybe',
    headline: 'Modest and mostly if you are short — but glycinate is a low-risk, worthwhile pick.',
    claim: 'The internet’s favourite sleep mineral, slightly oversold.',
    detail:
      'Magnesium is involved in the nervous-system pathways that help you relax, and the evidence for sleep is real but modest, strongest in older adults or people who are genuinely low. It is not a sedative and it will not knock out a wired mind on its own. That said, it is cheap, well tolerated in the glycinate or citrate form, and many people are short on it, so it is a reasonable low-risk thing to take for sleep and general health rather than a dramatic fix.',
    bottomLine: 'Worth trying, ideally magnesium glycinate before bed. Expect a gentle nudge, not a knockout, and more if you were low to begin with.',
    link: { label: 'Magnesium deep-dive', href: '/ingredients/magnesium' },
    q: 'Does magnesium help you sleep?',
  },
  {
    id: 'zma',
    name: 'ZMA',
    topic: 'Blend',
    group: 'minerals',
    tier: 'maybe',
    headline: 'Zinc, magnesium and B6 in one tub — any sleep benefit is really the magnesium.',
    claim: 'Sold for recovery, testosterone and sleep all at once.',
    detail:
      'ZMA is a fixed blend of zinc, magnesium and vitamin B6, marketed heavily for recovery, testosterone and sleep. The testosterone claims do not hold up unless you were deficient, and any sleep benefit is essentially down to its magnesium content. If sleep is your goal you can usually get the same effect more cheaply and at a better dose by buying magnesium glycinate on its own.',
    bottomLine: 'No magic in the blend. For sleep specifically, plain magnesium is usually the cheaper, better-dosed choice.',
    link: { label: 'Best supplements for men over 40', href: '/stacks/men-over-40' },
    q: 'Does ZMA help you sleep?',
  },

  // ---- Calming compounds ----
  {
    id: 'l-theanine',
    name: 'L-Theanine',
    topic: 'Amino Acid',
    group: 'calming',
    tier: 'maybe',
    headline: 'Best for a wired, anxious mind rather than as a knockout sleep aid.',
    claim: 'The "calm without sedation" amino acid.',
    detail:
      'L-theanine, the amino acid from green tea, promotes a relaxed-but-alert state and has reasonable evidence for reducing anxiety and stress, which can indirectly help if a racing mind is what keeps you awake. It is not a sedative and the direct evidence for it improving sleep itself is modest. It is very well tolerated, so it is a sensible, low-risk option for people whose sleep problem is really an over-active mind at bedtime.',
    bottomLine: 'A fair pick if anxiety or an over-thinking brain is the issue (often 100-200mg). Do not expect it to sedate you.',
    link: { label: 'L-theanine deep-dive', href: '/ingredients/l-theanine' },
    q: 'Does L-theanine help you sleep?',
  },
  {
    id: 'glycine',
    name: 'Glycine',
    topic: 'Amino Acid',
    group: 'calming',
    tier: 'maybe',
    headline: 'A cheap amino acid with small but genuinely promising sleep-quality data.',
    claim: 'The underrated one you have probably not heard sold.',
    detail:
      'Glycine is a simple amino acid, and a handful of small studies suggest that around 3g before bed can improve subjective sleep quality and how quickly people fall asleep, partly by gently lowering core body temperature. The evidence base is small and early rather than settled, but it is cheap, safe and low-risk. It sits in "promising and worth an experiment" rather than "proven".',
    bottomLine: 'Low-risk and cheap to trial at ~3g before bed. Encouraging early evidence, but do not treat it as a sure thing.',
    q: 'Does glycine help you sleep?',
  },
  {
    id: 'apigenin',
    name: 'Apigenin & Chamomile',
    topic: 'Flavonoid',
    group: 'calming',
    tier: 'maybe',
    headline: 'The mild calming compound in chamomile tea — gentle, low-risk, not powerful.',
    claim: 'The wellness-influencer bedtime staple.',
    detail:
      'Apigenin is a flavonoid found in chamomile that interacts mildly with the same calming receptors as some sedatives, which is the basis for chamomile tea’s traditional bedtime reputation. The human evidence is limited and the effect is mild, so it is more of a gentle wind-down aid than a reliable sleep supplement. It is low-risk, so it is fine as part of a relaxing routine, just do not expect much on its own.',
    bottomLine: 'Pleasant and low-risk as part of a wind-down. Treat any effect as gentle rather than something to rely on.',
    q: 'Does apigenin or chamomile help you sleep?',
  },
  {
    id: 'tart-cherry',
    name: 'Montmorency Tart Cherry',
    topic: 'Fruit Extract',
    group: 'calming',
    tier: 'maybe',
    headline: 'A small natural melatonin hit plus recovery polyphenols — modest, on-brand for lifters.',
    claim: 'Sold as a natural sleep-and-recovery two-for-one.',
    detail:
      'Montmorency tart cherry contains a small amount of natural melatonin plus anti-inflammatory polyphenols, and small studies suggest modest improvements in sleep time and quality, alongside some evidence for reduced muscle soreness after training. The effects are modest and the studies small, but the recovery angle makes it genuinely on-brand for lifters. It is a reasonable, food-based option rather than a heavy hitter.',
    bottomLine: 'A defensible natural pick if you like the recovery angle too. Modest effect; concentrate or juice both work.',
    q: 'Does tart cherry help you sleep?',
  },
  {
    id: 'valerian',
    name: 'Valerian',
    topic: 'Herbal',
    group: 'calming',
    tier: 'maybe',
    headline: 'A traditional sleep herb with genuinely mixed, inconsistent evidence.',
    claim: 'The classic herbal sleep remedy.',
    detail:
      'Valerian root is one of the oldest herbal sleep remedies, and some people do report it helps them relax and drift off. The trouble is the research is inconsistent: some studies show a small benefit, many show nothing beyond placebo, and product potency varies a lot between brands. It is generally well tolerated short-term, so it is not unreasonable to try, but the evidence does not let us promise it will work.',
    bottomLine: 'Worth a short trial if you like herbals, but manage expectations. The evidence is genuinely mixed.',
    q: 'Does valerian help you sleep?',
  },

  // ---- Hormonal & adaptogens ----
  {
    id: 'melatonin',
    name: 'Melatonin',
    topic: 'Hormone',
    group: 'hormonal',
    tier: 'works',
    headline: 'Genuinely effective for timing problems — but prescription-only in the UK.',
    claim: 'The one everyone brings back from the US in bulk.',
    detail:
      'Melatonin is the hormone that signals night to your body, and it has solid evidence for circadian problems such as jet lag, shift work and delayed sleep phase, where a small, correctly-timed dose (often 0.5-1mg) shifts the clock. It is far less impressive for ordinary insomnia, where it mainly helps you fall asleep a little faster. The key UK point: melatonin is a prescription-only medicine here, not an over-the-counter supplement, so this is a conversation for a GP or pharmacist rather than an overseas order.',
    bottomLine: 'Real, but for timing issues, and it is prescription-only in the UK. Talk to a GP or pharmacist rather than self-sourcing it.',
    link: { label: 'Supplement side effects & safety', href: '/side-effects' },
    q: 'Does melatonin help you sleep, and is it legal in the UK?',
  },
  {
    id: 'ashwagandha',
    name: 'Ashwagandha',
    topic: 'Adaptogen',
    group: 'hormonal',
    tier: 'works',
    headline: 'The best-evidenced supplement here for stress-driven poor sleep.',
    claim: 'The adaptogen that mostly lives up to the hype.',
    detail:
      'Ashwagandha, especially a standardised root extract like KSM-66, has several human trials showing improved sleep onset and quality alongside lower stress and cortisol, and it is the strongest evidence-based supplement on this list. It works best where stress and an over-active mind are what wreck your sleep, rather than as a pure sedative. Buy a named, standardised extract so you actually get a known dose, and note it also carries a modest testosterone benefit in stressed men.',
    bottomLine: 'The pick worth trying if stress drives your poor sleep: a standardised extract (e.g. KSM-66). Solid, if modest, evidence.',
    link: { label: 'Ashwagandha deep-dive', href: '/ingredients/ashwagandha' },
    q: 'Does ashwagandha help you sleep?',
  },

  // ---- Overhyped: skip ----
  {
    id: 'gaba',
    name: 'GABA',
    topic: 'Amino Acid',
    group: 'hyped',
    tier: 'skip',
    headline: 'It is your main calming brain chemical — but the pill barely reaches your brain.',
    claim: 'Sounds perfect on the label; falls at the first hurdle.',
    detail:
      'GABA is the brain’s primary calming neurotransmitter, which is why a GABA supplement sounds like it should work. The problem is that oral GABA does not cross the blood-brain barrier well, so very little of what you swallow reaches the brain where it would matter. The human sleep evidence is correspondingly weak, and any calm people feel is likely small or indirect. Your money goes further elsewhere on this page.',
    bottomLine: 'Skip it. The mechanism sounds ideal but oral GABA barely gets to your brain, and the evidence shows it.',
    q: 'Does a GABA supplement help you sleep?',
  },
  {
    id: '5-htp',
    name: '5-HTP',
    topic: 'Amino Acid',
    group: 'hyped',
    tier: 'skip',
    headline: 'Thin sleep evidence and a real interaction risk with antidepressants — clinician territory.',
    claim: 'Sold as a natural serotonin and sleep booster.',
    detail:
      '5-HTP is a serotonin precursor marketed for mood and sleep, but the direct evidence that it improves sleep is thin. More importantly, it raises serotonin, so combining it with antidepressants such as SSRIs or other serotonergic drugs carries a genuine risk of serotonin syndrome, which can be dangerous. Because of that interaction risk it is not a casual supplement to self-experiment with, and anyone on medication should not touch it without a clinician.',
    bottomLine: 'Skip it for sleep, especially if you take any antidepressant. If you think it is relevant, that is a doctor or pharmacist conversation, not a self-purchase.',
    link: { label: 'Supplement side effects & safety', href: '/side-effects' },
    q: 'Is 5-HTP safe and effective for sleep?',
  },
  {
    id: 'pm-blends',
    name: '"Night-Time" & PM Blends',
    topic: 'Blend',
    group: 'hyped',
    tier: 'skip',
    headline: 'Usually underdosed odds-and-ends, sometimes bolted onto a "night-time fat burner".',
    claim: 'One tub that promises sleep, recovery and fat loss overnight.',
    detail:
      'Most "night-time", "PM" or "sleep and recover" tubs are proprietary blends of exactly the modest or failed ingredients here, often underdosed and hidden so you cannot see how little of each you get. The worst are "night-time fat burners" that pair a token sleep ingredient with stimulant-free filler and an overnight-fat-loss claim that does not stand up. Where they contain something useful like magnesium or ashwagandha, it is cheaper and better dosed to buy that on its own.',
    bottomLine: 'Skip the blends. Buy the one or two things that actually help at a proper dose instead of paying for a bold label.',
    link: { label: 'Underdosed products to skip', href: '/watch-outs' },
    q: 'Are night-time or PM sleep blends worth it?',
  },
]

// Tallies for the headline stat + the honest "how many actually work" line.
export function itemCount(): number {
  return SLEEP_ITEMS.length
}

export function tierCount(tier: SleepVerdict): number {
  return SLEEP_ITEMS.filter((i) => i.tier === tier).length
}

// Items in a given group (or all).
export function itemsInGroup(group: SleepGroup | 'all'): SleepItem[] {
  return group === 'all' ? SLEEP_ITEMS : SLEEP_ITEMS.filter((i) => i.group === group)
}
