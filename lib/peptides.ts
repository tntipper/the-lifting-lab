// Peptides data — powers the /peptides hub. Pure static data, zero DB, so the
// page can never fail at runtime. Every entry is evidence-based and deliberately
// clinician-safe: we rate what the research and UK law actually support, we give
// NO dosing or sourcing information for unlicensed injectables, and we repeatedly
// defer any real decision to a doctor or pharmacist.
//
// This fills a genuine gap and is squarely on-brand for the @dadthletelab
// audience (TRT + peptides): "do peptides work", "is BPC-157 legal UK",
// "BPC-157 vs TB-500", "peptides for muscle growth", "collagen peptides benefits"
// are huge evergreen and trending queries, and the site had no dedicated hub —
// the topic was never covered anywhere.
//
// The tier colours mirror the site's product-scoring language (lime = proven and
// legal, amber = early or prescription-only, red = hype / do not self-source) so
// the whole brand reads in one visual grammar: we score products green/amber/red,
// and we score the peptide claims the same way.

export type PepVerdict = 'works' | 'maybe' | 'skip'

export const TIER_META: Record<
  PepVerdict,
  { label: string; color: string; blurb: string }
> = {
  works: {
    label: 'Proven & Legal',
    color: '#a6e22e',
    blurb: 'A genuine, evidence-backed peptide you can actually use — a food-form supplement you can buy off the shelf, with honest limits on what it does.',
  },
  maybe: {
    label: 'Rx / Early',
    color: '#f5a623',
    blurb: 'Either a real medicine that must be prescribed and monitored by a clinician, or something with only preliminary human evidence. Not an off-the-shelf supplement, and never something to self-source from a vial.',
  },
  skip: {
    label: 'Hype / Do Not Self-Source',
    color: '#e05a2b',
    blurb: 'An unlicensed injectable sold online as a "research chemical" — unproven in humans, banned in sport, and illegal to sell for human use in the UK. The hype is far ahead of the evidence and the risk is real.',
  },
}

export type PepGroup = 'food' | 'licensed' | 'research' | 'cosmetic'

export const GROUP_META: Record<PepGroup, { label: string }> = {
  food: { label: 'Food-Form (Supplements)' },
  licensed: { label: 'Licensed Medicines' },
  research: { label: '"Research" Injectables' },
  cosmetic: { label: 'Topical / Cosmetic' },
}

export type PepItem = {
  /** URL-safe id, also the anchor + React key. */
  id: string
  /** What people search, e.g. "BPC-157", "Collagen Peptides", "Semaglutide". */
  name: string
  /** Short tag shown on the card, e.g. "Food-form", "GLP-1 medicine", "Injectable". */
  topic: string
  group: PepGroup
  tier: PepVerdict
  /** One-line summary shown on the collapsed card. */
  headline: string
  /** The marketing pitch, so the honest verdict has something to answer. */
  claim: string
  /** 2-4 sentence evidence-based summary; backs the FAQ schema 1:1. */
  detail: string
  /** Short plain-English "do this" recommendation. */
  bottomLine: string
  /** Explicit FAQ question so the schema reads naturally and backs the detail 1:1. */
  question: string
  /** Optional funnel link to a matching on-site page. */
  link?: { label: string; href: string }
}

// Ordered proven-and-legal first on purpose: the honest message is that the only
// peptides worth buying off a shelf are the food-form ones, the powerful ones are
// prescription medicines that belong with a doctor, and everything injectable in a
// vial online is unlicensed grey-market territory.
export const PEP_ITEMS: PepItem[] = [
  // ---- Food-form: the ones that are actually proven and legal ----
  {
    id: 'collagen-peptides',
    question: 'Do collagen peptides actually work, and what for?',
    name: 'Collagen Peptides',
    topic: 'Food-form',
    group: 'food',
    tier: 'works',
    headline: 'A real, legal supplement with decent evidence for skin, and some for joints and tendons — not for building muscle.',
    claim: 'Sold as an anti-ageing, joint-saving, muscle-building all-rounder.',
    detail:
      'Hydrolysed collagen is just collagen protein broken into small, easily absorbed peptides, and it is a legitimate over-the-counter supplement. The evidence is genuinely reasonable for skin elasticity and hydration, and there is some support for joint comfort and tendon or ligament recovery, especially when taken with vitamin C around loading. What it does not do is build muscle any better than a good complete protein — collagen is a poor muscle-building protein because it lacks enough leucine. Treat it as a targeted connective-tissue and skin supplement, not a mass-builder.',
    bottomLine: 'A fair buy for skin, joints and tendon support at roughly 10-15g a day with vitamin C. For actual muscle, spend on whey or a complete protein instead.',
    link: { label: 'See the best-scored proteins', href: '/best/whey' },
  },
  {
    id: 'protein-hydrolysate',
    question: 'Are whey and EAA hydrolysate "peptides" worth paying more for?',
    name: 'Whey & EAA Hydrolysates',
    topic: 'Food-form',
    group: 'food',
    tier: 'works',
    headline: 'The "protein peptides" on your tub label — just pre-digested protein, absorbed fast, no magic.',
    claim: 'Marketed as premium "peptide" protein that builds muscle faster.',
    detail:
      'When a label boasts "whey peptides" or "hydrolysed protein", it simply means the protein has been partly broken into peptides so it digests and absorbs a little faster. It is real, safe and food-form, and it works exactly as well as ordinary quality protein for building muscle — the faster absorption is a minor, mostly irrelevant edge for most people, and hydrolysates cost more. This is the one place "peptides" on a supplement label is completely honest and completely unremarkable.',
    bottomLine: 'Fine to use, not worth paying a premium for. Total daily protein and leucine matter far more than whether it is hydrolysed.',
    link: { label: 'True cost of every protein', href: '/protein-value' },
  },

  // ---- Licensed medicines: real, powerful, but clinician-only ----
  {
    id: 'glp1-semaglutide-tirzepatide',
    question: 'Do GLP-1 peptides like semaglutide and tirzepatide work, and are they legal in the UK?',
    name: 'GLP-1s (Semaglutide, Tirzepatide)',
    topic: 'GLP-1 medicine',
    group: 'licensed',
    tier: 'maybe',
    headline: 'The peptides that genuinely transform body composition — but they are prescription medicines, not vials to self-source.',
    claim: 'Sold in grey-market vials as a shortcut to the celebrity fat-loss jab.',
    detail:
      'GLP-1 and dual GLP-1/GIP receptor agonists such as semaglutide (Wegovy, Ozempic) and tirzepatide (Mounjaro) are the one peptide class that reliably and powerfully changes body composition, with large trials behind them. That is exactly why they are licensed prescription medicines that must be assessed, prescribed and monitored by a clinician: they have real side effects, need dose titration, and are not appropriate for everyone. The vials sold online without a prescription are a different and dangerous world — frequently underdosed, mislabelled or counterfeit, with no medical oversight. The drug is real; buying it off a website is not the way to use it.',
    bottomLine: 'If this class is right for you, it is a conversation with a doctor or a regulated weight-management service, never a purchase from an unregulated vial seller.',
  },
  {
    id: 'pt-141',
    question: 'Is PT-141 (bremelanotide) a safe over-the-counter libido peptide?',
    name: 'PT-141 (Bremelanotide)',
    topic: 'Prescription-only',
    group: 'licensed',
    tier: 'maybe',
    headline: 'A licensed libido medicine in some countries — prescription territory here, not a supplement.',
    claim: 'Sold online as an OTC "libido peptide".',
    detail:
      'Bremelanotide (PT-141) is a melanocortin-receptor peptide licensed in the US as an on-demand treatment for low sexual desire in some women, so unlike the "research" peptides it does have a genuine medical identity. It can raise blood pressure and cause nausea and flushing, which is precisely why it belongs under a prescriber, not on a self-injected schedule from an unregulated vial. In the UK it is prescription territory, not an over-the-counter supplement.',
    bottomLine: 'Not a supplement. Any use is a medical decision for a clinician who can assess suitability and monitor blood pressure.',
  },

  // ---- "Research" injectables: the hyped grey-market vials ----
  {
    id: 'bpc-157',
    question: 'Does BPC-157 work, and is it legal in the UK?',
    name: 'BPC-157',
    topic: 'Injectable',
    group: 'research',
    tier: 'skip',
    headline: 'Huge recovery hype, but the evidence is almost entirely in rats — unlicensed, unproven in humans, and banned in sport.',
    claim: 'Marketed as a miracle healing peptide for tendons, gut and injuries.',
    detail:
      'BPC-157 is genuinely interesting in preclinical work — rodent studies show tendon, muscle and gut healing effects — which is why it is everywhere online. But there are essentially no published human trials proving it is safe or effective, its long-term safety is unknown, and it is not a licensed medicine anywhere. In the UK it cannot legally be sold for human consumption and is marketed as a "research chemical not for human use", and WADA added it to the banned list in 2022. Interesting science is not the same as a proven, legal product you should be injecting.',
    bottomLine: 'The animal data is intriguing but it is unproven in humans, unlicensed and banned in sport. Do not self-source or inject it; if you have a stubborn injury, see a physio or doctor.',
    link: { label: 'What actually helps recovery', href: '/testosterone' },
  },
  {
    id: 'tb-500',
    question: 'Does TB-500 work, and is it legal?',
    name: 'TB-500 (Thymosin Beta-4)',
    topic: 'Injectable',
    group: 'research',
    tier: 'skip',
    headline: 'The other "healing" peptide — same story as BPC-157: animal data only, unlicensed, WADA-banned.',
    claim: 'Sold alongside BPC-157 as a recovery and injury-repair stack.',
    detail:
      'TB-500 is a synthetic version of a fragment of thymosin beta-4, promoted for tissue repair and recovery, usually paired with BPC-157. As with BPC-157, the supportive evidence is preclinical and animal-based, human trials proving benefit and safety are lacking, and it is not a licensed medicine. It is sold as a research chemical rather than a product for human use, and it is prohibited in sport by WADA. The marketing is confident; the human evidence is not there.',
    bottomLine: 'Unproven in humans, unlicensed and banned in sport. Not something to self-inject — real recovery comes from load management, sleep, protein and professional rehab.',
  },
  {
    id: 'ghrp-ghrh-secretagogues',
    question: 'Do GH secretagogues like ipamorelin and CJC-1295 work, and are they safe?',
    name: 'GH Secretagogues (Ipamorelin, CJC-1295)',
    topic: 'Injectable',
    group: 'research',
    tier: 'skip',
    headline: 'Peptides that nudge your own growth hormone up — real hormonal effects, unproven physique benefits, and banned in sport.',
    claim: 'Sold as a safer, "natural" way to get growth-hormone benefits for muscle and fat loss.',
    detail:
      'Growth-hormone secretagogues such as ipamorelin, CJC-1295, sermorelin and the GHRP family do genuinely stimulate your pituitary to release more growth hormone, so they are not inert. But raising GH and IGF-1 is not a free lunch — it can affect blood sugar, cause water retention and joint aches, and the physique benefits people are sold have not been shown to outweigh the risks in healthy adults. They are unlicensed for this use, sold as research chemicals, and prohibited in sport. Manipulating your endocrine system from an unregulated vial without monitoring is a genuinely risky thing to do.',
    bottomLine: 'Real hormonal effects, unproven and unlicensed benefits, banned in sport. Not a self-source supplement — hormone manipulation belongs with an endocrinologist, if at all.',
  },
  {
    id: 'igf-1-lr3',
    question: 'Is IGF-1 LR3 safe to use for muscle growth?',
    name: 'IGF-1 LR3',
    topic: 'Injectable',
    group: 'research',
    tier: 'skip',
    headline: 'A potent growth-factor analogue — powerful, poorly understood in this context, and one of the riskier things sold online.',
    claim: 'Sold as a direct anabolic for localised muscle growth.',
    detail:
      'IGF-1 LR3 is a modified, long-acting version of insulin-like growth factor 1, a powerful growth factor. It is emphatically not a casual supplement: growth-factor manipulation carries serious theoretical risks, including effects on blood sugar and concerns about promoting abnormal cell growth, and there is no safe, evidence-based self-dosing protocol for physique use. It is unlicensed, sold as a research chemical, and banned in sport. This is among the least sensible things in the whole peptide space to self-source.',
    bottomLine: 'Powerful, poorly justified for physique use, and genuinely risky. Do not self-source or inject it.',
  },

  // ---- Topical / cosmetic ----
  {
    id: 'copper-peptides',
    question: 'Do copper peptides (GHK-Cu) work?',
    name: 'Copper Peptides (GHK-Cu)',
    topic: 'Topical',
    group: 'cosmetic',
    tier: 'maybe',
    headline: 'A legitimate cosmetic skincare ingredient applied to the skin — not a recovery or muscle peptide.',
    claim: 'Sold as an anti-ageing and hair-regrowth "peptide".',
    detail:
      'GHK-Cu is a copper-binding peptide used topically in serums, with some reasonable evidence for skin appearance and wound-related benefits when applied to the skin. As a low-risk cosmetic ingredient it is a fair enough thing to try in a serum. What it is not is a fitness, recovery or muscle peptide, and the injectable versions sold for those purposes fall back into the unlicensed research-chemical category with none of the topical evidence to support them.',
    bottomLine: 'Fine as a topical skincare ingredient if you like it. Ignore any injectable version and any muscle or recovery claims.',
  },
  {
    id: 'melanotan-2',
    question: 'Is Melanotan II safe?',
    name: 'Melanotan II',
    topic: 'Injectable',
    group: 'cosmetic',
    tier: 'skip',
    headline: 'The injectable "tanning peptide" — the UK medicines regulator has specifically warned against it.',
    claim: 'Sold as a quick injectable tan with a libido bonus.',
    detail:
      'Melanotan II is an injectable peptide used to darken skin, and it is one of the few peptides the UK medicines regulator (the MHRA) has issued specific safety warnings about. It is unlicensed, its purity and contents from grey-market sellers are unknown, and reported effects include nausea, blood-pressure changes and concerns about changes to moles and skin lesions. There is no version of this that counts as a sensible supplement decision.',
    bottomLine: 'Actively warned against by the MHRA. Do not use it — for a tan, use topical products; for anything else, see a clinician.',
  },
]

// Tallies for the headline stat + the honest "how many are actually worth it" line.
export function itemCount(): number {
  return PEP_ITEMS.length
}

export function tierCount(tier: PepVerdict): number {
  return PEP_ITEMS.filter((i) => i.tier === tier).length
}

// Items in a given group (or all).
export function itemsInGroup(group: PepGroup | 'all'): PepItem[] {
  return group === 'all' ? PEP_ITEMS : PEP_ITEMS.filter((i) => i.group === group)
}
