// Supplement "which form" comparison data — powers the /forms hub. Pure static
// data, zero DB, so the page can never fail at runtime. Every entry is
// evidence-based and clinician-safe: we compare the common FORMS of the same
// core supplement (monohydrate vs HCL, glycinate vs oxide, isolate vs
// concentrate) and say which is worth buying — we do not give medical advice.
//
// This fills a real gap: /ingredients-vs compares DIFFERENT ingredients against
// each other; nothing on the site yet answers the huge evergreen "which form of
// X should I buy" queries (creatine monohydrate vs hcl, magnesium glycinate vs
// citrate, whey isolate vs concentrate, vitamin d2 vs d3, ksm-66 vs sensoril).
//
// The verdict colours mirror the site's product-scoring language (lime = buy,
// amber = situational, red = skip) so the whole brand reads in one visual
// grammar: we score products green/amber/red, and we score forms the same way.

export type FormVerdict = 'best' | 'fine' | 'skip'

export const VERDICT_META: Record<
  FormVerdict,
  { label: string; color: string; blurb: string }
> = {
  best: {
    label: 'Best Buy',
    color: '#a6e22e',
    blurb: 'The form worth paying for — best absorbed, best evidence, or best value for money.',
  },
  fine: {
    label: 'Situational',
    color: '#f5a623',
    blurb: 'Works fine, but only the smart pick for a specific reason — a budget, a sensitivity, or a niche goal.',
  },
  skip: {
    label: 'Skip',
    color: '#e05a2b',
    blurb: 'Poorly absorbed, overpriced, or marketing dressed up as an upgrade. There is a better version of the same thing.',
  },
}

export type FormGroup = 'protein' | 'performance' | 'vitamins-minerals' | 'herbals'

export const GROUP_META: Record<FormGroup, { label: string }> = {
  protein: { label: 'Protein' },
  performance: { label: 'Performance' },
  'vitamins-minerals': { label: 'Vitamins & Minerals' },
  herbals: { label: 'Herbals & Health' },
}

export type FormOption = {
  /** Form name, exactly as it appears on a label, e.g. "Monohydrate". */
  name: string
  verdict: FormVerdict
  /** One-line verdict on this specific form. */
  note: string
}

export type FormFamily = {
  /** URL-safe id, also the anchor + React key. */
  id: string
  /** Supplement family, exactly as searched, e.g. "Creatine". */
  name: string
  /** Short topic tag shown on the card, e.g. "Creatine", "Protein", "Mineral". */
  topic: string
  group: FormGroup
  /** One-line summary shown on the collapsed card. */
  headline: string
  /** The form to actually buy — the headline answer. */
  pick: string
  /** Every common form, ordered best first. */
  options: FormOption[]
  /** Short plain-English "buy this" recommendation. */
  bottomLine: string
  /** 2-4 sentence evidence-based summary; backs the FAQ schema 1:1. */
  detail: string
  /** Optional funnel link to a matching tool / ranking / guide. */
  link?: { label: string; href: string }
}

// Ordered so the highest-search families lead. Creatine, whey, magnesium and
// vitamin D forms are among the biggest "which form" queries in the niche.
export const FORMS: FormFamily[] = [
  {
    id: 'creatine',
    name: 'Creatine',
    topic: 'Creatine',
    group: 'performance',
    headline: 'Plain monohydrate wins — the fancy forms are just pricier water.',
    pick: 'Monohydrate',
    options: [
      { name: 'Monohydrate', verdict: 'best', note: 'The most-studied form by a mile, cheap, and it works. This is the default answer.' },
      { name: 'Creapure (monohydrate)', verdict: 'best', note: 'Same molecule, a German purity brand. A fair small premium if you want the certification — no extra effect.' },
      { name: 'Micronised', verdict: 'best', note: 'Just monohydrate ground finer so it mixes better. Same results, slightly nicer to drink.' },
      { name: 'Hydrochloride (HCL)', verdict: 'fine', note: 'More soluble, so a smaller scoop — but no proven advantage over monohydrate, at a higher price.' },
      { name: 'Kre-Alkalyn / buffered', verdict: 'skip', note: 'Marketed as "no bloat, no loading". Head-to-head studies show it is no better than monohydrate, for more money.' },
      { name: 'Ethyl ester', verdict: 'skip', note: 'Breaks down to creatinine in the gut; research shows it is worse than plain monohydrate.' },
    ],
    bottomLine: 'Buy plain creatine monohydrate. Micronised or Creapure are the same thing if you want a nicer mix or a purity stamp. Everything sold as an "advanced" form is a downgrade in value.',
    detail:
      'For creatine the honest answer is that the cheapest form is the best form. Creatine monohydrate has hundreds of studies behind it and is the reference every other form is measured against — and in head-to-head trials HCL, Kre-Alkalyn and ethyl ester have never beaten it. Micronised monohydrate and Creapure are still just monohydrate, ground finer or purity-certified, so they are perfectly good; you are only paying for mixability or a brand stamp. Anything sold as a next-generation upgrade is almost always a worse deal for the same effect.',
    link: { label: 'Creatine dosage calculator', href: '/calculators/creatine' },
  },
  {
    id: 'whey-protein',
    name: 'Whey Protein',
    topic: 'Protein',
    group: 'protein',
    headline: 'Concentrate is the value king; pay up for isolate only if lactose is a problem.',
    pick: 'Concentrate',
    options: [
      { name: 'Concentrate', verdict: 'best', note: 'Best protein-per-pound. 70-80% protein with a little more carbs and fat — fine for almost everyone.' },
      { name: 'Isolate', verdict: 'fine', note: 'More filtered, ~90% protein, very low lactose. Worth it if concentrate bloats you or you want leaner macros.' },
      { name: 'Native whey', verdict: 'fine', note: 'Filtered from milk rather than cheese-making. Premium and marginal — nice, not necessary.' },
      { name: 'Hydrolysate', verdict: 'skip', note: 'Pre-digested for slightly faster absorption. Costs a lot more for a benefit you will not feel.' },
    ],
    bottomLine: 'Buy concentrate to hit your protein cheaply. Switch to isolate only if you are lactose-sensitive or want the leanest possible macros. Skip hydrolysate unless money is no object.',
    detail:
      'The three whey forms differ mostly in how much they are filtered, not in how well they build muscle — total daily protein is what matters. Concentrate gives you the most protein per pound and suits most people. Isolate is more filtered to around 90% protein with very little lactose, so it is the right pick if concentrate leaves you bloated or you want the leanest macros. Hydrolysate is pre-broken-down for faster absorption, but the real-world difference is tiny and rarely worth the price jump.',
    link: { label: 'Protein value ranking', href: '/protein-value' },
  },
  {
    id: 'magnesium',
    name: 'Magnesium',
    topic: 'Mineral',
    group: 'vitamins-minerals',
    headline: 'Glycinate for sleep and comfort, citrate on a budget — never oxide.',
    pick: 'Glycinate (bisglycinate)',
    options: [
      { name: 'Glycinate / bisglycinate', verdict: 'best', note: 'Well absorbed and gentle on the gut. The go-to for relaxation, sleep and daily topping-up.' },
      { name: 'Citrate', verdict: 'best', note: 'Well absorbed and cheap. Mildly laxative, which is a plus if constipation is the issue.' },
      { name: 'Malate', verdict: 'fine', note: 'Absorbable and popular for daytime use; a fine choice, just usually pricier than citrate.' },
      { name: 'L-threonate', verdict: 'fine', note: 'Marketed for the brain. Genuinely expensive and the human evidence is still thin — a niche buy.' },
      { name: 'Oxide', verdict: 'skip', note: 'Cheap filler in most tablets but very poorly absorbed — mostly a laxative, not a magnesium top-up.' },
    ],
    bottomLine: 'Buy magnesium glycinate for sleep and comfort, or citrate if you want the same absorption cheaper (and do not mind the laxative edge). Avoid the oxide that fills most supermarket tablets.',
    detail:
      'Magnesium forms differ hugely in how much your body actually absorbs. Glycinate (bisglycinate) is well absorbed and easy on the stomach, which makes it the popular pick for relaxation and sleep. Citrate is also well absorbed and cheaper, with a mild laxative effect that can be a bonus or a nuisance depending on you. Oxide, the form in most cheap tablets, is very poorly absorbed and mostly acts as a laxative, so a high number on the label does not mean you get much magnesium.',
  },
  {
    id: 'vitamin-d',
    name: 'Vitamin D',
    topic: 'Vitamin',
    group: 'vitamins-minerals',
    headline: 'D3 raises your levels better than D2 — get D3, ideally with K2.',
    pick: 'D3 (cholecalciferol)',
    options: [
      { name: 'D3 (cholecalciferol)', verdict: 'best', note: 'The form your skin makes from sunlight. Raises and holds blood levels more effectively than D2.' },
      { name: 'D3 + K2', verdict: 'best', note: 'A sensible pairing; K2 helps direct calcium to bone. A reasonable upgrade, not essential.' },
      { name: 'D2 (ergocalciferol)', verdict: 'skip', note: 'Plant-derived and used in some prescriptions, but weaker at raising blood levels. Only pick it if you need vegan and cannot get vegan D3.' },
    ],
    bottomLine: 'Buy vitamin D3. A D3 + K2 combo is a fine upgrade. Only choose D2 if a strict vegan option is essential and lichen-derived D3 is not available.',
    detail:
      'Vitamin D comes as D2 (ergocalciferol) and D3 (cholecalciferol), and they are not equal. D3 is the form your body makes from sunlight and it raises and maintains blood levels more effectively than D2, which is why D3 is the standard recommendation. Pairing D3 with K2 is a popular, sensible combination for directing calcium toward bone, though it is an optional upgrade rather than a must. Vegans can now get D3 from lichen, so D2 is rarely the best choice.',
    link: { label: 'Best vitamin D products', href: '/best' },
  },
  {
    id: 'citrulline',
    name: 'L-Citrulline',
    topic: 'Pre-workout',
    group: 'performance',
    headline: 'Both forms work — just match the dose to the one on the label.',
    pick: 'L-citrulline (or 2:1 malate)',
    options: [
      { name: 'L-citrulline (pure)', verdict: 'best', note: 'Straight citrulline. Aim for 6-8g. Cleaner label maths than the malate blend.' },
      { name: 'Citrulline malate 2:1', verdict: 'best', note: 'Citrulline bonded to malic acid; the form in most pump studies. Needs ~8g to hit the same citrulline dose.' },
      { name: 'Citrulline malate 1:1', verdict: 'fine', note: 'Half the ratio, so you need even more powder for the same citrulline. Check the label carefully.' },
    ],
    bottomLine: 'Buy whichever is cheaper per gram of actual citrulline. For pure L-citrulline aim for 6-8g; for 2:1 malate aim for about 8g. Watch out for pre-workouts that under-dose it.',
    detail:
      'L-citrulline and citrulline malate both work for blood flow and pumps — the catch is the dose, not the form. Pure L-citrulline is dosed at roughly 6-8g. Citrulline malate is citrulline bonded to malic acid, so a 2:1 product needs around 8g to deliver the same citrulline, and a 1:1 product needs more still. The common mistake is buying by headline grams without checking how much is actually citrulline, which is exactly how many pre-workouts under-deliver.',
    link: { label: 'Citrulline dosage calculator', href: '/calculators/citrulline' },
  },
  {
    id: 'zinc',
    name: 'Zinc',
    topic: 'Mineral',
    group: 'vitamins-minerals',
    headline: 'Picolinate or bisglycinate absorb well — oxide barely does.',
    pick: 'Picolinate or bisglycinate',
    options: [
      { name: 'Picolinate', verdict: 'best', note: 'Well absorbed and widely available. A safe default for topping up zinc.' },
      { name: 'Bisglycinate', verdict: 'best', note: 'Also well absorbed and gentle on an empty stomach.' },
      { name: 'Citrate', verdict: 'fine', note: 'Decent absorption and cheap — a perfectly reasonable budget choice.' },
      { name: 'Gluconate', verdict: 'fine', note: 'The common lozenge form. Fine, absorption is middling.' },
      { name: 'Oxide', verdict: 'skip', note: 'Cheap and poorly absorbed — high on the label, low in your bloodstream.' },
    ],
    bottomLine: 'Buy zinc picolinate or bisglycinate. Citrate is a fine cheaper option. Skip zinc oxide, and do not take high-dose zinc long-term without balancing copper.',
    detail:
      'Like magnesium, zinc absorption depends heavily on the form. Picolinate and bisglycinate are well absorbed and make good everyday choices, while citrate and gluconate are reasonable and cheaper. Oxide is the cheap filler form and is poorly absorbed, so it flatters the label more than your blood levels. One caution that applies to every form: sustained high-dose zinc can deplete copper, so keep doses sensible rather than mega.',
  },
  {
    id: 'ashwagandha',
    name: 'Ashwagandha',
    topic: 'Adaptogen',
    group: 'herbals',
    headline: 'Buy a named, standardised root extract — KSM-66 or Sensoril, not "root powder".',
    pick: 'KSM-66',
    options: [
      { name: 'KSM-66', verdict: 'best', note: 'A standardised root extract with the most human trials for stress and strength. The default evidence-based pick.' },
      { name: 'Sensoril', verdict: 'fine', note: 'A root-and-leaf extract standardised higher; studied more for stress/sleep, often at lower doses.' },
      { name: 'Generic standardised root extract', verdict: 'fine', note: 'Fine if it states the withanolide percentage and dose — just less directly studied than the branded ones.' },
      { name: 'Plain root powder', verdict: 'skip', note: 'Unstandardised, so the active content is a guess. You cannot dose it reliably.' },
    ],
    bottomLine: 'Buy a standardised root extract — KSM-66 is the most-studied, Sensoril is a fine alternative. Avoid plain unstandardised root powder where you have no idea of the active dose.',
    detail:
      'With ashwagandha the form that matters is standardisation, not brand loyalty. KSM-66 is a root-only extract with the largest bank of human trials for stress, sleep and strength, which makes it the safest evidence-based choice. Sensoril is a root-and-leaf extract standardised to a higher withanolide content and studied more for stress and sleep, usually at smaller doses. Plain root powder is not standardised, so you cannot know the active content, and any extract that hides its withanolide percentage should be treated the same way.',
  },
  {
    id: 'omega-3',
    name: 'Omega-3 (Fish Oil)',
    topic: 'Health',
    group: 'vitamins-minerals',
    headline: 'What matters is EPA/DHA per capsule — triglyceride form absorbs a little better.',
    pick: 'Triglyceride form',
    options: [
      { name: 'Triglyceride (rTG/natural)', verdict: 'best', note: 'The natural form; absorbed slightly better. Look for high EPA+DHA per capsule, not just "fish oil mg".' },
      { name: 'Ethyl ester (EE)', verdict: 'fine', note: 'Cheaper and concentrated; absorption is a touch lower but fine taken with a fatty meal.' },
      { name: 'Krill oil (phospholipid)', verdict: 'fine', note: 'Well absorbed but low total EPA/DHA per capsule at a high price — you pay a lot per gram.' },
      { name: 'Cod liver oil', verdict: 'fine', note: 'Also carries vitamins A and D, so watch total vitamin A if you take a lot.' },
    ],
    bottomLine: 'Buy on EPA + DHA content per serving first. Triglyceride form absorbs slightly better; ethyl ester is fine with food. Krill is well absorbed but expensive per gram of omega-3.',
    detail:
      'For fish oil the headline number should be the combined EPA and DHA per serving, not the total "fish oil" milligrams, because a big capsule can hide a small omega-3 dose. Among forms, the natural triglyceride (rTG) form is absorbed a little better, while the cheaper ethyl ester form is slightly lower but perfectly usable when taken with a fatty meal. Krill oil is well absorbed but delivers relatively little EPA and DHA per capsule for the price, so it works out expensive per gram of actual omega-3.',
  },
  {
    id: 'curcumin',
    name: 'Curcumin (Turmeric)',
    topic: 'Herbal',
    group: 'herbals',
    headline: 'Plain turmeric barely absorbs — you need piperine or a delivery form.',
    pick: 'Curcumin + piperine (or phytosome)',
    options: [
      { name: 'Curcumin + piperine', verdict: 'best', note: 'Black-pepper extract sharply raises absorption. The cheapest way to make curcumin actually work.' },
      { name: 'Phytosome (Meriva) / liposomal', verdict: 'best', note: 'Formulated for far higher absorption; more expensive but well studied.' },
      { name: 'Plain turmeric powder', verdict: 'skip', note: 'Very poorly absorbed on its own. Great in cooking, weak as a supplement without a helper.' },
    ],
    bottomLine: 'Buy curcumin with piperine (black pepper) or a phytosome/liposomal formula. Plain turmeric capsules with no absorption enhancer are largely a waste.',
    detail:
      'Curcumin, the active compound in turmeric, is famously badly absorbed on its own, which is the whole story with this supplement. Adding piperine from black pepper dramatically increases how much reaches your bloodstream, and it is the cheapest effective fix. Specialised delivery forms such as phytosome (Meriva) or liposomal curcumin achieve even higher absorption and are well studied, at a higher price. A plain turmeric capsule with no enhancer is the one form to avoid, because most of it simply passes through.',
  },
  {
    id: 'caffeine',
    name: 'Caffeine',
    topic: 'Stimulant',
    group: 'performance',
    headline: 'Anhydrous is the reliable workhorse; slow-release smooths the crash.',
    pick: 'Caffeine anhydrous',
    options: [
      { name: 'Anhydrous', verdict: 'best', note: 'Dried caffeine powder — precise, cheap and the form used in most performance research.' },
      { name: 'Natural (coffee/green tea)', verdict: 'fine', note: 'Perfectly good; the dose is just less exact than a measured capsule.' },
      { name: 'Di-caffeine malate / slow-release', verdict: 'fine', note: 'Marketed for smoother, longer energy. Pleasant for some, but a small premium for a modest effect.' },
    ],
    bottomLine: 'Buy caffeine anhydrous for precise, cheap dosing (aim for about 3mg per kg pre-training). Slow-release forms are a nice-to-have if the crash bothers you, not a necessity.',
    detail:
      'Caffeine anhydrous is simply dried caffeine, and because it is precise and cheap it is the form used in most performance studies — an effective dose is around 3mg per kilo of bodyweight before training. Natural sources like coffee and green tea work identically; you just have less control over the exact dose. Blended forms such as di-caffeine malate or slow-release caffeine are marketed for smoother, longer-lasting energy with less of a crash, which some people like, but the effect is modest for the extra cost.',
    link: { label: 'Caffeine dose calculator', href: '/calculators/caffeine' },
  },
  {
    id: 'collagen',
    name: 'Collagen',
    topic: 'Protein',
    group: 'protein',
    headline: 'Hydrolysed peptides dissolve and absorb best — pair with vitamin C.',
    pick: 'Hydrolysed peptides',
    options: [
      { name: 'Hydrolysed peptides', verdict: 'best', note: 'Broken into small peptides so it mixes into anything cold and absorbs readily. The default for skin and joints.' },
      { name: 'Gelatin', verdict: 'fine', note: 'The same collagen, less processed; only dissolves in hot liquid and gels when cool. Cheaper, less convenient.' },
      { name: 'Undenatured type II (UC-II)', verdict: 'fine', note: 'A different, low-dose approach aimed specifically at joints — not a general collagen top-up.' },
    ],
    bottomLine: 'Buy hydrolysed collagen peptides for skin, hair and connective tissue, ideally with vitamin C. Gelatin is the same protein if you do not mind it only mixing hot. UC-II is a separate joint-specific product.',
    detail:
      'Collagen peptides and gelatin are the same protein at different processing stages: hydrolysed peptides are broken into small pieces that dissolve in cold drinks and absorb easily, which is why they are the convenient default. Gelatin is less processed, only dissolves in hot liquid and sets as it cools, so it is cheaper but fiddlier. Undenatured type II collagen (UC-II) is a different, low-dose product aimed specifically at joint tolerance rather than general collagen supply. Taking collagen with vitamin C supports the body making its own collagen.',
  },
  {
    id: 'b12',
    name: 'Vitamin B12',
    topic: 'Vitamin',
    group: 'vitamins-minerals',
    headline: 'Both forms fix a shortfall — methylcobalamin is the popular active pick.',
    pick: 'Methylcobalamin',
    options: [
      { name: 'Methylcobalamin', verdict: 'best', note: 'A ready-to-use active form. Popular choice, especially for vegans topping up B12.' },
      { name: 'Cyanocobalamin', verdict: 'fine', note: 'Cheap, extremely stable, and your body converts it fine. The form used in most large studies.' },
      { name: 'Adenosyl / hydroxocobalamin', verdict: 'fine', note: 'Other active forms; perfectly good, just less common on shelves.' },
    ],
    bottomLine: 'Buy methylcobalamin if you want a ready-active form; cyanocobalamin is cheaper, stable and works just as well for most people. Both correct a dietary shortfall.',
    detail:
      'For most people the difference between B12 forms is smaller than the internet suggests. Methylcobalamin is a ready-to-use active form and a popular pick, particularly among vegans. Cyanocobalamin is cheap, very stable and readily converted by the body, which is why it appears in most large clinical studies. Unless you have a specific medical reason, either corrects a dietary shortfall; genuine B12 deficiency from absorption problems is a medical issue that may need injections, and that is a conversation for a clinician.',
  },
]

// Family tallies for the headline stat.
export function formCount(): number {
  return FORMS.length
}

export function optionCount(): number {
  return FORMS.reduce((n, f) => n + f.options.length, 0)
}

// Families in a given group (or all).
export function familiesInGroup(group: FormGroup | 'all'): FormFamily[] {
  return group === 'all' ? FORMS : FORMS.filter((f) => f.group === group)
}

// Natural FAQ question for a family, e.g.
// "Creatine" -> "Which form of creatine is best?"
export function formsQuestion(name: string): string {
  return `Which form of ${name.toLowerCase()} is best?`
}
