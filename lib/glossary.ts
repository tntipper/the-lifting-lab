// Supplement label & jargon glossary — the definitional layer under the whole
// site. The Lifting Lab's thesis is "the label lies; effective dose is what
// matters", and this page names the exact tricks and terms that thesis rests on.
//
// Deliberately DB-FREE and deterministic (pure local data) so the /glossary page
// and its OG card can never fail at runtime. Distinct from:
//   /watch-outs   — which PRODUCTS score badly (rankings)
//   /methodology  — HOW the Effectiveness Match score is built
//   /ingredients  — deep dives on specific COMPOUNDS
//   /guide        — how to BUY a category
// This page defines the VOCABULARY that the rest of the site uses.
//
// Every term links out to the money/authority page that acts on it, so the
// glossary is a topical-authority hub that also funnels.

export type GlossaryTerm = {
  /** Stable anchor id, used for #deep-links and DefinedTerm @id. */
  id: string
  /** Display name. */
  term: string
  /** Common aliases / also-known-as, shown as a subtle tag. */
  aka?: string[]
  /** One-sentence definition — used verbatim in DefinedTerm schema. */
  def: string
  /** Honest, on-brand "why it matters" expansion. No medical claims as fact. */
  why: string
  /** Deep link to the surface that acts on this term. */
  link: { href: string; label: string }
}

export type GlossaryGroup = {
  key: string
  title: string
  blurb: string
  terms: GlossaryTerm[]
}

export const GLOSSARY: GlossaryGroup[] = [
  {
    key: 'label-tricks',
    title: 'Label tricks & red flags',
    blurb:
      'The tactics the industry uses to look stronger on the tub than it is in the scoop. Spot these and half the market falls away.',
    terms: [
      {
        id: 'proprietary-blend',
        term: 'Proprietary blend',
        aka: ['prop blend', 'matrix', 'complex'],
        def: 'A group of ingredients listed under one combined weight so the individual doses are hidden.',
        why: 'If a "3,000mg blend" lists six ingredients, you have no idea whether the one that works is at a clinical dose or a sprinkle. A blend is not automatically bad, but it removes your ability to check the dose — which is exactly why underdosed products use it. We treat a hidden dose as an unproven dose.',
        link: { href: '/watch-outs', label: 'See flagged products' },
      },
      {
        id: 'amino-spiking',
        term: 'Amino spiking',
        aka: ['nitrogen spiking', 'protein spiking'],
        def: 'Adding cheap free-form aminos (glycine, taurine, glutamine) so a protein powder tests as higher protein than it really delivers.',
        why: 'Standard protein tests measure nitrogen, and cheap aminos are nitrogen-dense. A tub can claim 25g "protein" while the actual muscle-building whey is well under that. The tell is a long free-amino list near the top of the ingredients and a suspiciously cheap price per real gram of protein.',
        link: { href: '/protein-value', label: 'Protein by true cost' },
      },
      {
        id: 'fairy-dusting',
        term: 'Fairy dusting',
        aka: ['pixie-dusting', 'underdosing'],
        def: 'Including a proven ingredient at a token amount — enough to name it on the label, too little to do anything.',
        why: 'The star ingredient gets a headline on the front, then appears at 10-20% of the studied dose. It reads great and costs the brand almost nothing. Our Effectiveness Match score exists to catch exactly this: it compares the actual label dose to the evidence-based reference, not to the marketing.',
        link: { href: '/methodology', label: 'How we score' },
      },
      {
        id: 'up-to-dosing',
        term: '"Up to" / "contains" claims',
        def: 'Vague wording ("up to 200mg", "contains caffeine") that implies a dose without committing to one.',
        why: '"Up to" is a ceiling, not a serving. "Contains" tells you a molecule is present, not how much. Treat any active without a specific milligram figure per serving as an unknown, and an unknown as underdosed until proven otherwise.',
        link: { href: '/methodology', label: 'How we score' },
      },
      {
        id: 'serving-size-inflation',
        term: 'Serving-size games',
        aka: ['serving inflation'],
        def: 'Quoting doses across two or three scoops, or shrinking the scoop, to make a tub look better value or better dosed than it is.',
        why: 'A "full dose" spread over 3 scoops means a tub lasts a third as long, so the real cost per effective serving triples. We normalise everything to cost per full effective serving so a big cheap tub with tiny scoops cannot hide.',
        link: { href: '/value', label: 'Best by true cost' },
      },
      {
        id: 'filler',
        term: 'Fillers & bulking agents',
        aka: ['maltodextrin filler', 'non-actives'],
        def: 'Cheap non-active ingredients (often maltodextrin) used to add volume, weight or a bigger-looking scoop.',
        why: 'Not all fillers are sinister — flow agents and flavouring are normal. It becomes a red flag when cheap carbs pad the scoop so the tub feels substantial while the actives stay thin. Read the order of the ingredient list: it runs heaviest-first.',
        link: { href: '/watch-outs', label: 'See flagged products' },
      },
    ],
  },
  {
    key: 'dosing',
    title: 'Dosing & effectiveness',
    blurb: 'The concepts our whole scoring engine is built on. This is where "does it actually work" gets decided.',
    terms: [
      {
        id: 'clinical-dose',
        term: 'Clinical / effective dose',
        aka: ['evidence-based dose', 'reference dose'],
        def: 'The amount of an ingredient shown in human studies to produce the effect it is sold for.',
        why: 'This is the number that matters. A product can contain the right ingredients and still do nothing if they sit below their clinical dose. Every category on the site has an evidence-based reference range, and we score products against it.',
        link: { href: '/methodology', label: 'The reference doses' },
      },
      {
        id: 'effectiveness-match',
        term: 'Effectiveness Match',
        aka: ['the score', 'match score'],
        def: 'The Lifting Lab 0-100 score for how closely a product’s active doses match the evidence-based clinical reference for its category.',
        why: 'Green (70+) means the doses line up with the evidence. Amber (50-69) is partial. Red (under 50) is underdosed or padded. It is an editorial opinion built from the label, not a safety rating or a claim a product is defective.',
        link: { href: '/best', label: 'The highest scorers' },
      },
      {
        id: 'true-cost',
        term: 'True cost / cost per serving',
        aka: ['cost per effective serving'],
        def: 'Price divided by the number of full, effective servings in the tub — not the sticker price.',
        why: 'A £20 tub that gives 15 real servings is dearer than a £35 tub that gives 40. Sticker price and even price-per-100g both lie once doses and scoop sizes differ. Cost per effective serving is the only fair way to compare value.',
        link: { href: '/cheapest', label: 'Cheapest per serving' },
      },
      {
        id: 'loading-phase',
        term: 'Loading phase',
        def: 'A short period of higher doses (classically creatine at ~20g/day for 5-7 days) to saturate stores faster.',
        why: 'Loading gets you to full effect in about a week instead of three to four. It is optional — a steady 3-5g/day of creatine reaches the same place, just slower. Skipping it is fine; it is not a requirement, despite what the tub often implies.',
        link: { href: '/calculators/creatine', label: 'Creatine dose calculator' },
      },
      {
        id: 'saturation-supplement',
        term: 'Saturation supplement',
        def: 'A supplement (creatine, beta-alanine) that works by building up in the body over weeks, not by an acute per-dose hit.',
        why: 'For these, timing of day is irrelevant — total daily intake over weeks is all that counts. Anyone selling you a precise "take it exactly pre-workout" ritual for creatine is selling a myth. Contrast with caffeine or citrulline, which are acute and genuinely time-sensitive.',
        link: { href: '/ingredients/creatine-monohydrate', label: 'Creatine deep dive' },
      },
      {
        id: 'ergogenic',
        term: 'Ergogenic aid',
        def: 'A substance that genuinely improves training performance, backed by human evidence.',
        why: 'A short list actually earns this word: caffeine, creatine, beta-alanine, citrulline and a few more. Most of a pre-workout label is flavour, stimulant feel and marketing around those few. Knowing the real ergogenics lets you ignore the rest.',
        link: { href: '/strongest-pre-workout', label: 'Strongest pre-workouts' },
      },
      {
        id: 'stimulant-tolerance',
        term: 'Stimulant tolerance',
        aka: ['caffeine habituation'],
        def: 'The reduced effect you feel from caffeine and other stimulants as your body adapts to regular use.',
        why: 'The "my pre-workout stopped hitting" effect is real. It is why chasing ever-bigger stim doses is a losing game and why a periodic deload from caffeine restores the effect better than more scoops. Dose by bodyweight, not by feel.',
        link: { href: '/calculators/caffeine', label: 'Caffeine calculator' },
      },
    ],
  },
  {
    key: 'protein',
    title: 'Protein science',
    blurb: 'Concentrate, isolate, DIAAS, leucine threshold — the terms that decide whether a protein is worth its price.',
    terms: [
      {
        id: 'whey-concentrate',
        term: 'Whey concentrate (WPC)',
        def: 'The least-processed, most affordable whey — typically 70-80% protein with some lactose and fat.',
        why: 'For most people concentrate is the sensible default: high quality protein at the best price per gram. You only need to move up to isolate for a specific reason (lactose sensitivity, very lean macros).',
        link: { href: '/guide/whey', label: 'Whey buyer’s guide' },
      },
      {
        id: 'whey-isolate',
        term: 'Whey isolate (WPI)',
        def: 'Whey filtered further to ~90%+ protein with minimal lactose, carbs and fat.',
        why: 'Genuinely useful if you are lactose-sensitive or counting every macro. But it costs more per gram, and paying an isolate premium you do not need is one of the commonest ways lifters overspend. Judge it on cost per gram of protein, not the word "isolate".',
        link: { href: '/guide/whey-isolate', label: 'Isolate buyer’s guide' },
      },
      {
        id: 'whey-hydrolysate',
        term: 'Whey hydrolysate (WPH)',
        aka: ['hydrolyzed whey'],
        def: 'Whey pre-broken into shorter peptide chains for faster absorption.',
        why: 'Absorbs marginally faster and costs materially more. For the vast majority of people the real-world difference over concentrate or isolate does not justify the price. A premium looking for a problem.',
        link: { href: '/guide/whey', label: 'Whey buyer’s guide' },
      },
      {
        id: 'casein',
        term: 'Casein',
        def: 'The slow-digesting milk protein that releases amino acids gradually over several hours.',
        why: 'Useful before a long gap without food (overnight) where a slow drip suits. It is not "better" than whey — just slower. The overnight-anabolism marketing is far bigger than the actual effect.',
        link: { href: '/guide/casein', label: 'Casein buyer’s guide' },
      },
      {
        id: 'bcaa-vs-eaa',
        term: 'BCAAs vs EAAs',
        def: 'BCAAs are 3 of the 9 essential amino acids; EAAs are the full set your body cannot make.',
        why: 'BCAAs were a huge seller and are largely redundant if you eat enough total protein — muscle protein synthesis needs all nine EAAs, not three. If you already hit your protein target, an EAA/BCAA tub is usually money better spent on whey.',
        link: { href: '/guide/eaas', label: 'EAA buyer’s guide' },
      },
      {
        id: 'leucine-threshold',
        term: 'Leucine threshold',
        def: 'The roughly 2.5-3g of leucine in a serving that acts as the trigger for muscle protein synthesis.',
        why: 'Leucine is the "on switch". A good whey serving clears the threshold on its own; a cheap amino-spiked or plant blend may not, which is why leucine content matters more than headline protein grams for a muscle-building goal.',
        link: { href: '/ingredients/leucine', label: 'Leucine deep dive' },
      },
      {
        id: 'diaas-pdcaas',
        term: 'DIAAS & PDCAAS',
        aka: ['protein quality score'],
        def: 'Standardised scores for protein quality — how complete and digestible a protein is (DIAAS is the newer, more accurate one).',
        why: 'Two "25g protein" scoops are not equal if one is whey (high DIAAS, complete) and one is a cheap plant blend (lower, incomplete). Quality scores are why a slightly dearer complete protein can be better value than a cheap incomplete one.',
        link: { href: '/protein-value', label: 'Protein by true cost' },
      },
      {
        id: 'complete-protein',
        term: 'Complete protein',
        def: 'A protein containing all nine essential amino acids in useful amounts.',
        why: 'Whey, casein, egg and soy are complete; most single plant sources are not, which is why plant blends combine sources. If a protein is not complete, its headline gram count overstates what it does for muscle.',
        link: { href: '/guide/whey', label: 'Whey buyer’s guide' },
      },
    ],
  },
  {
    key: 'forms',
    title: 'Forms & bioavailability',
    blurb: 'Why the exact chemical form on the label changes the real dose you absorb — and where paying for a fancy form is a waste.',
    terms: [
      {
        id: 'bioavailability',
        term: 'Bioavailability',
        def: 'The proportion of an ingredient your body actually absorbs and uses, versus what is on the label.',
        why: 'A high label dose in a poorly absorbed form can deliver less than a smaller dose in a good one. It cuts both ways: it justifies some premium forms, and it is also the excuse used to sell expensive forms that add nothing over the cheap standard.',
        link: { href: '/ingredients/magnesium', label: 'Magnesium forms' },
      },
      {
        id: 'creatine-forms',
        term: 'Creatine monohydrate vs "advanced" forms',
        aka: ['creatine HCL', 'kre-alkalyn'],
        def: 'Monohydrate is the cheap, most-studied form; HCL, kre-alkalyn and others are pricier variants marketed as superior.',
        why: 'Monohydrate is the gold standard, full stop — decades of evidence, cheapest per gram. The "advanced" forms charge more to solve problems (bloating, absorption) that monohydrate largely does not have. Pay for monohydrate and save the difference.',
        link: { href: '/ingredients/creatine-monohydrate', label: 'Creatine deep dive' },
      },
      {
        id: 'citrulline-malate',
        term: 'Citrulline malate vs L-citrulline',
        def: 'L-citrulline is the pure active; citrulline malate is L-citrulline bound to malic acid (a 2:1 blend is only ~67% actual citrulline).',
        why: 'This is a classic hidden-dose trap. A pre-workout claiming "6g citrulline malate 2:1" gives only about 4g of the active L-citrulline — under the effective dose. Always convert the form to the real active amount before trusting the number.',
        link: { href: '/calculators/citrulline', label: 'Citrulline calculator' },
      },
      {
        id: 'chelated-minerals',
        term: 'Chelated minerals',
        aka: ['bisglycinate', 'citrate'],
        def: 'Minerals bound to amino acids or organic acids (e.g. magnesium bisglycinate, zinc citrate) for better absorption and gentler digestion.',
        why: 'Here the premium form often is worth it: cheap oxide forms are poorly absorbed and can upset the gut. When comparing a mineral supplement, the form on the label matters as much as the milligram figure.',
        link: { href: '/ingredients/magnesium', label: 'Magnesium forms' },
      },
      {
        id: 'sustained-release',
        term: 'Sustained / buffered release',
        def: 'A formulation designed to release an ingredient slowly, often to reduce side effects (e.g. sustained-release beta-alanine to cut the tingle).',
        why: 'Occasionally useful for tolerability, like softening the beta-alanine tingle. But it is also a common upsell — check whether the slow-release version still hits the full daily dose, or just splits an underdose more smoothly.',
        link: { href: '/ingredients/beta-alanine', label: 'Beta-alanine deep dive' },
      },
    ],
  },
  {
    key: 'testing',
    title: 'Certifications & testing',
    blurb: 'What the badges on the tub actually mean — and which ones matter if you are drug-tested or just want a clean product.',
    terms: [
      {
        id: 'informed-sport',
        term: 'Informed Sport',
        def: 'A certification where every batch is tested for banned substances by LGC, aimed at drug-tested athletes.',
        why: 'The gold standard for banned-substance assurance because it is batch-by-batch, not a one-off. If you are tested (military, competition, some professions) this is the badge to look for. For everyone else it is reassurance, not a necessity.',
        link: { href: '/methodology', label: 'How we assess quality' },
      },
      {
        id: 'informed-choice',
        term: 'Informed Choice',
        def: 'A related LGC certification that tests products regularly for banned substances (retail-focused rather than batch-by-batch).',
        why: 'A step below Informed Sport in rigour but still meaningful. Know the difference: "Choice" is periodic sampling, "Sport" is every batch — the distinction matters if a failed test ends your career.',
        link: { href: '/methodology', label: 'How we assess quality' },
      },
      {
        id: 'third-party-tested',
        term: 'Third-party tested',
        def: 'The product is verified by an independent lab, not just the brand’s own quality control.',
        why: 'A genuinely good sign — but "third-party tested" is unregulated wording. Ask what was tested (label accuracy? banned substances? heavy metals?) and by whom. A named certifier beats a vague claim on the tub.',
        link: { href: '/methodology', label: 'How we assess quality' },
      },
      {
        id: 'gmp',
        term: 'GMP (Good Manufacturing Practice)',
        def: 'A manufacturing quality standard covering how a facility makes and controls its products.',
        why: 'Baseline reassurance about the factory, not proof the formula is dosed well or the label is accurate. A GMP tub can still be fairy-dusted. Useful floor, not a substitute for checking the doses.',
        link: { href: '/methodology', label: 'How we assess quality' },
      },
    ],
  },
]

export function glossaryTermCount(): number {
  return GLOSSARY.reduce((n, g) => n + g.terms.length, 0)
}
