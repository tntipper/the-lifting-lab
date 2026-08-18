// Educational content for /ingredients/[slug] SEO pages.
// These target the ingredient-level query class ("what is beta-alanine",
// "citrulline dosage", "is caffeine safe") that the category guides do not
// directly serve. Content is deterministic and local (no DB dependency), so
// the pages always render; only the "top products" strip reads Supabase.
//
// `productCategory` and `relatedGuides` use the live category/guide slugs so
// each ingredient page funnels into the existing browse + guide surfaces.

export type IngredientFaq = { q: string; a: string }

// Honest signal of how strong the evidence is for the headline benefit.
export type EvidenceLevel = 'Strong' | 'Moderate' | 'Limited'

export type Ingredient = {
  slug: string
  name: string
  aka?: string[]
  oneLiner: string
  evidence: EvidenceLevel
  metaTitle: string
  metaDescription: string
  whatItIs: string
  howItWorks: string
  dose: string
  safety: string
  foundIn: string
  relatedGuides: string[] // guide slugs
  productCategory?: string // category slug to pull a top-products strip
  faqs: IngredientFaq[]
}

export const INGREDIENTS: Ingredient[] = [
  {
    slug: 'caffeine',
    name: 'Caffeine',
    aka: ['caffeine anhydrous', '1,3,7-trimethylxanthine'],
    oneLiner: 'The most reliable performance stimulant — effective for focus, output and perceived effort.',
    evidence: 'Strong',
    metaTitle: 'Caffeine for Training: Dose, Safety and Timing | The Lifting Lab',
    metaDescription:
      'How much caffeine actually works, the safe upper limit, and why over 400mg per serving gets penalised. An evidence-based UK guide for lifters.',
    whatItIs:
      'Caffeine is a natural stimulant and by far the most-studied performance aid in sport. It is the active ingredient that does the heavy lifting in most pre-workouts, fat-burners and energy products, and it is the reason a strong coffee before training feels the way it does.',
    howItWorks:
      'Caffeine blocks adenosine, the brain chemical that builds up and makes you feel tired, so you perceive effort as lower and can push harder for longer. It reliably improves focus, alertness, endurance and strength output, which is why it is one of the few supplement ingredients with genuinely strong evidence behind it.',
    dose:
      'The effective range is roughly 3 to 6mg per kg of bodyweight, taken 30 to 60 minutes before training. For an 80kg person that is about 240 to 480mg. We heavily penalise products that pack more than 400mg into a single serving, because past that point side effects (jitters, racing heart, crashed sleep) tend to outweigh any extra benefit.',
    safety:
      'Health bodies put the safe daily ceiling for most healthy adults at around 400mg from all sources. Tolerance builds quickly, sensitivity varies a lot between people, and caffeine within about 8 to 10 hours of bed can wreck sleep quality. If you train in the evening, a stim-free pre-workout is the smarter call.',
    foundIn: 'Pre-workouts, fat-burners, energy drinks and some intra-workout formulas.',
    relatedGuides: ['pre-workout', 'post-workout'],
    productCategory: 'pre-workout',
    faqs: [
      { q: 'How much caffeine should I take before a workout?', a: 'Around 3 to 6mg per kg of bodyweight, taken 30 to 60 minutes before training. We penalise pre-workouts that exceed 400mg per serving.' },
      { q: 'Is 400mg of caffeine too much?', a: '400mg is roughly the safe daily ceiling for most healthy adults from all sources, so a single serving at that level leaves no room for coffee or other sources. We mark products above it down.' },
      { q: 'Does caffeine tolerance build up?', a: 'Yes, quite quickly. Many lifters cycle off for a week or two periodically, or keep the dose modest, to keep it effective.' },
    ],
  },
  {
    slug: 'creatine-monohydrate',
    name: 'Creatine Monohydrate',
    aka: ['creatine', 'Creapure'],
    oneLiner: 'The most proven strength and lean-mass supplement there is — and one of the cheapest.',
    evidence: 'Strong',
    metaTitle: 'Creatine Monohydrate: Dose, Loading and Forms | The Lifting Lab',
    metaDescription:
      'How much creatine to take, whether to load, and why monohydrate beats the fancy forms. A clear, evidence-based UK ingredient guide.',
    whatItIs:
      'Creatine is a compound your body makes and stores in muscle to fuel short, explosive efforts. Supplementing tops up those stores beyond what diet alone provides. Monohydrate is the original, best-evidenced and cheapest form, and Creapure is a high-purity certified version of it.',
    howItWorks:
      'Creatine helps regenerate ATP, the immediate energy currency for heavy lifts and sprints, so you can squeeze out extra reps and recover faster between sets. Over time that extra training volume translates into more strength and lean mass. It also pulls a little water into the muscle, which is harmless and part of how it works.',
    dose:
      '3 to 5g of creatine monohydrate every day, indefinitely. Timing does not matter, so take it whenever you will remember. An optional loading phase of around 20g a day (split into four doses) for the first week saturates your muscles faster; skip it and you reach the same level in three to four weeks.',
    safety:
      'Creatine is one of the safest supplements studied, with decades of data in healthy people. It does not damage the kidneys in those with normal kidney function. The only common complaint is minor stomach upset if a big dose is taken on an empty stomach, which splitting the dose fixes.',
    foundIn: 'Standalone creatine powders and capsules, plus many pre- and post-workout blends.',
    relatedGuides: ['creatine', 'post-workout'],
    productCategory: 'creatine',
    faqs: [
      { q: 'Do I need to load creatine?', a: 'No. Loading (around 20g a day for a week) saturates muscles faster, but 3 to 5g daily reaches the same level in three to four weeks.' },
      { q: 'Is creatine monohydrate better than HCl or other forms?', a: 'For most people, yes on value. Monohydrate has the deepest evidence base and is far cheaper; the fancier forms rarely justify their premium.' },
      { q: 'Is Creapure worth paying more for?', a: 'Creapure is a high-purity certified monohydrate and a reliable quality marker, but standard micronised monohydrate from a reputable brand works just as well for less.' },
    ],
  },
  {
    slug: 'l-citrulline',
    name: 'L-Citrulline',
    aka: ['citrulline', 'citrulline malate'],
    oneLiner: 'The pump and blood-flow ingredient with real evidence — when it is dosed properly.',
    evidence: 'Moderate',
    metaTitle: 'L-Citrulline and Citrulline Malate: Dose Guide | The Lifting Lab',
    metaDescription:
      'How much citrulline you actually need for a pump, the difference between L-citrulline and citrulline malate, and why most pre-workouts under-dose it.',
    whatItIs:
      'Citrulline is an amino acid that the body converts into arginine and then nitric oxide, which widens blood vessels. It comes as pure L-citrulline or as citrulline malate (citrulline bound to malic acid). It is the ingredient behind the "pump" claim on most pre-workout labels.',
    howItWorks:
      'By raising nitric oxide, citrulline improves blood flow to working muscles, which can enhance the training pump and may modestly reduce fatigue and muscle soreness. The evidence is reasonable but not overwhelming, and it depends entirely on getting a real dose rather than the token sprinkle many products use.',
    dose:
      'Aim for 6 to 8g of pure L-citrulline, or around 9 to 12g of citrulline malate (which is only about two-thirds citrulline by weight, so you need more to reach the same citrulline dose), taken 30 to 60 minutes pre-workout. A huge number of pre-workouts list citrulline but dose it well below this, which is exactly the kind of under-dosing our scoring penalises.',
    safety:
      'Citrulline is well tolerated even at higher doses, with no meaningful safety concerns for healthy people. It is gentler on the stomach than arginine, which is one reason it has largely replaced it in modern formulas.',
    foundIn: 'Pre-workouts, pump/nitric-oxide products and some intra-workout drinks.',
    relatedGuides: ['pre-workout', 'intra-workout'],
    productCategory: 'pre-workout',
    faqs: [
      { q: 'How much citrulline should a pre-workout have?', a: 'Around 6 to 8g of pure L-citrulline, or 9 to 12g of citrulline malate. Many products under-dose it well below this.' },
      { q: 'Is L-citrulline or citrulline malate better?', a: 'Both work. Citrulline malate is only part citrulline by weight, so you need a higher total to match the same pure L-citrulline dose.' },
      { q: 'Does citrulline actually give a pump?', a: 'It can, by raising nitric oxide and blood flow, but only at a proper dose. Under-dosed citrulline does little.' },
    ],
  },
  {
    slug: 'beta-alanine',
    name: 'Beta-Alanine',
    oneLiner: 'Buffers fatigue in higher-rep work — and causes the harmless tingling many lifters feel.',
    evidence: 'Moderate',
    metaTitle: 'Beta-Alanine: Dose, Tingling and Benefits | The Lifting Lab',
    metaDescription:
      'What beta-alanine does, why it makes your skin tingle, the evidence-based daily dose, and which products dose it properly. A UK ingredient guide.',
    whatItIs:
      'Beta-alanine is an amino acid that the body uses to build carnosine, a compound stored in muscle that buffers acid build-up during hard exercise. It is a staple of pre-workouts and is responsible for the tingling skin sensation (paraesthesia) that many people notice.',
    howItWorks:
      'During higher-rep, sustained efforts (roughly the 1 to 4 minute range), acid builds up and contributes to that burning fatigue. More muscle carnosine buffers some of that acid, letting you grind out a few extra reps. The benefit is modest and specific to that effort range; it does little for one-rep-max strength or short sprints.',
    dose:
      'The effective approach is 3.2 to 6.4g per day, taken consistently for weeks, because the benefit comes from gradually building up muscle carnosine rather than from any single dose. Splitting it into smaller doses through the day reduces the tingling. A single pre-workout serving does not work on its own.',
    safety:
      'Beta-alanine is safe at recommended doses. The tingling sensation is harmless and fades as you get used to it or if you split the dose. It is not a sign of anything working better or worse.',
    foundIn: 'Pre-workouts, endurance products and some intra-workout formulas.',
    relatedGuides: ['pre-workout'],
    productCategory: 'pre-workout',
    faqs: [
      { q: 'How much beta-alanine should I take?', a: 'Around 3.2 to 6.4g per day, taken consistently for several weeks. The benefit comes from building up muscle carnosine over time, not from a single dose.' },
      { q: 'Why does beta-alanine make me tingle?', a: 'The tingling (paraesthesia) is a harmless, temporary nerve sensation caused by the dose. Splitting it into smaller amounts through the day reduces it.' },
      { q: 'Does beta-alanine work from one pre-workout serving?', a: 'No. It needs daily, consistent intake over weeks to raise muscle carnosine. A single serving on the day does little.' },
    ],
  },
  {
    slug: 'l-theanine',
    name: 'L-Theanine',
    oneLiner: 'Pairs with caffeine to keep the focus and lose the jitters.',
    evidence: 'Moderate',
    metaTitle: 'L-Theanine and Caffeine: The Focus Stack | The Lifting Lab',
    metaDescription:
      'Why L-theanine is paired with caffeine, the smart ratio to look for, and how it smooths out stimulant jitters. An evidence-based UK ingredient guide.',
    whatItIs:
      'L-theanine is an amino acid found naturally in tea. On its own it promotes a calm, relaxed-but-alert state without sedation. In supplements its main job is as a partner to caffeine, taking the edge off the stimulant without dulling the focus.',
    howItWorks:
      'Caffeine sharpens alertness but can bring jitters, anxiety and a sharper crash. L-theanine appears to smooth those rough edges, producing cleaner, calmer focus when the two are combined. The pairing has reasonable evidence for attention and reduced stimulant side effects, which is why well-formulated pre-workouts include it.',
    dose:
      'A common, sensible approach is roughly a 1:1 to 2:1 ratio of L-theanine to caffeine, for example 100 to 200mg of L-theanine alongside 100 to 200mg of caffeine. It is one of the cheaper actives, so there is little excuse for a product to skimp on it.',
    safety:
      'L-theanine is very well tolerated with no significant safety concerns at typical doses. It is non-stimulating and will not keep you awake; if anything it is sometimes used to aid relaxation.',
    foundIn: 'Pre-workouts (with caffeine), nootropic and focus blends.',
    relatedGuides: ['pre-workout'],
    productCategory: 'pre-workout',
    faqs: [
      { q: 'What does L-theanine do in a pre-workout?', a: 'It pairs with caffeine to give cleaner, calmer focus and reduce jitters and the post-stimulant crash.' },
      { q: 'What is the best theanine to caffeine ratio?', a: 'Roughly 1:1 to 2:1 theanine to caffeine, for example 100 to 200mg of each, is the commonly used range.' },
      { q: 'Will L-theanine make me sleepy?', a: 'No. It promotes calm, alert focus rather than sedation, which is why it works so well alongside a stimulant.' },
    ],
  },
  {
    slug: 'betaine-anhydrous',
    name: 'Betaine Anhydrous',
    aka: ['betaine', 'trimethylglycine', 'TMG'],
    oneLiner: 'An under-rated power and output ingredient with a small but real evidence base.',
    evidence: 'Moderate',
    metaTitle: 'Betaine Anhydrous (TMG): Dose and Benefits | The Lifting Lab',
    metaDescription:
      'What betaine anhydrous does for power output, the evidence-based 2.5g dose, and why it is often under-dosed in pre-workouts. A UK ingredient guide.',
    whatItIs:
      'Betaine anhydrous, also called trimethylglycine or TMG, is a compound derived from beetroot. It plays a role in cellular hydration and in methylation processes in the body. In sports supplements it is included for a modest boost to strength and power output.',
    howItWorks:
      'The leading theories are that betaine acts as an osmolyte (helping cells hold water and resist stress) and supports creatine synthesis. Several studies show small improvements in power and training volume. The effect is real but modest, and it depends on a proper dose rather than the trace amounts some labels carry.',
    dose:
      'The studied dose is around 2.5g per day, taken consistently. As with beta-alanine, the benefit appears to build with regular use rather than from a single serving. Check that a pre-workout actually lists 2.5g rather than burying a token amount in a blend.',
    safety:
      'Betaine is well tolerated at the typical 2.5g dose. Higher doses can cause stomach upset or a fishy body odour in some people. It has a long history of food and supplement use.',
    foundIn: 'Pre-workouts and strength/power formulas.',
    relatedGuides: ['pre-workout'],
    productCategory: 'pre-workout',
    faqs: [
      { q: 'How much betaine anhydrous should I take?', a: 'Around 2.5g per day, taken consistently. Many pre-workouts under-dose it below this level.' },
      { q: 'What does betaine do for lifting?', a: 'It offers a small but real boost to power output and training volume, likely via cellular hydration and supporting creatine synthesis.' },
      { q: 'Is betaine the same as TMG?', a: 'Yes. Betaine anhydrous and trimethylglycine (TMG) are the same compound.' },
    ],
  },
  {
    slug: 'taurine',
    name: 'Taurine',
    oneLiner: 'A cheap, well-tolerated amino acid for endurance, hydration and stimulant smoothing.',
    evidence: 'Moderate',
    metaTitle: 'Taurine: What It Does and How Much to Take | The Lifting Lab',
    metaDescription:
      'What taurine does in pre-workouts and energy drinks, the typical 1 to 2g dose, and whether it is worth looking for. An evidence-based UK ingredient guide.',
    whatItIs:
      'Taurine is an amino acid involved in hydration, cell function and the nervous system. It is a common ingredient in pre-workouts, intra-workout drinks and energy products, and it is one of the cheaper actives on a label.',
    howItWorks:
      'Taurine helps regulate fluid balance within cells and has antioxidant properties. The evidence points to small benefits for endurance performance and possibly for taking the edge off caffeine, though the effects are modest. It is rarely the star of a formula but is a sensible, low-cost supporting ingredient.',
    dose:
      'Typical effective doses sit around 1 to 2g, taken pre-workout or alongside a session. It is water-soluble and well absorbed, and stacks comfortably with caffeine and other pre-workout actives.',
    safety:
      'Taurine is very safe and well tolerated, even at doses well above the typical range. Despite the urban myth, the taurine in energy drinks is synthetic and not derived from animals.',
    foundIn: 'Pre-workouts, intra-workout drinks and energy products.',
    relatedGuides: ['pre-workout', 'intra-workout'],
    productCategory: 'pre-workout',
    faqs: [
      { q: 'How much taurine should I take?', a: 'Around 1 to 2g, taken pre-workout or alongside training, is the typical effective range.' },
      { q: 'What does taurine do?', a: 'It supports cellular hydration and antioxidant function, with modest evidence for endurance and for smoothing stimulant effects.' },
      { q: 'Is taurine safe?', a: 'Yes, it is very well tolerated, including at doses above the usual range. The taurine in supplements is synthetic.' },
    ],
  },
  {
    slug: 'leucine',
    name: 'Leucine',
    oneLiner: 'The amino acid that flips the switch on muscle protein synthesis.',
    evidence: 'Strong',
    metaTitle: 'Leucine: The Muscle-Building Trigger | The Lifting Lab',
    metaDescription:
      'Why leucine is the key amino acid for muscle growth, how much you need per dose, and why EAAs beat BCAAs. An evidence-based UK ingredient guide.',
    whatItIs:
      'Leucine is one of the nine essential amino acids and the most important of the three branched-chain amino acids (BCAAs). It is the single amino acid most directly responsible for switching on muscle protein synthesis, the process that builds and repairs muscle.',
    howItWorks:
      'Leucine acts as the trigger that signals the body to start building muscle protein after you eat protein or train. Hitting a meaningful leucine threshold in a meal or shake maximises that signal. This is why a complete protein or a full EAA blend matters: leucine flips the switch, but the other essential amino acids are the building blocks it needs to finish the job.',
    dose:
      'Around 2 to 3g of leucine per serving is the threshold that robustly stimulates muscle protein synthesis. You get this naturally from roughly 20 to 25g of a quality protein like whey, so most people who hit their protein target do not need to supplement leucine separately.',
    safety:
      'Leucine and the other amino acids are safe at normal supplemental doses. Taking large amounts of isolated leucine or BCAAs without the other essential aminos is simply wasteful rather than dangerous, because the body cannot build muscle from leucine alone.',
    foundIn: 'Whey and other complete proteins, EAA blends and (less usefully) BCAA products.',
    relatedGuides: ['eaas', 'whey'],
    productCategory: 'eaas',
    faqs: [
      { q: 'How much leucine do I need?', a: 'Around 2 to 3g per serving maximises the muscle-building signal. You get that from roughly 20 to 25g of a quality protein like whey.' },
      { q: 'Should I supplement leucine on its own?', a: 'Usually not. Leucine triggers muscle protein synthesis but needs the other essential amino acids as building blocks, so a complete protein or full EAA blend is better.' },
      { q: 'Are BCAAs enough for muscle growth?', a: 'No. BCAAs provide leucine but lack the other six essential amino acids needed to actually build muscle, so a full EAA blend or whole protein is superior.' },
    ],
  },
  {
    slug: 'whey-protein',
    name: 'Whey Protein',
    aka: ['whey concentrate', 'whey isolate'],
    oneLiner: 'The fast-digesting, complete protein that makes hitting your daily target easy.',
    evidence: 'Strong',
    metaTitle: 'Whey Protein: Concentrate vs Isolate and Dosing | The Lifting Lab',
    metaDescription:
      'How much whey protein per serving, concentrate vs isolate, and how to spot amino-spiking. An evidence-based UK ingredient guide for lifters.',
    whatItIs:
      'Whey is the protein fraction of milk, separated during cheese-making and dried into a powder. It is a complete protein, meaning it contains all nine essential amino acids, and it digests quickly. It comes as concentrate (around 70 to 80% protein), isolate (90%+ protein) and hydrolysate (pre-digested).',
    howItWorks:
      'Whey supplies a fast, high-quality hit of amino acids, including plenty of leucine, which makes it excellent for hitting your daily protein target and supporting muscle repair around training. For building muscle, total daily protein matters most; whey is simply the most convenient and cost-effective way to top it up.',
    dose:
      'A typical scoop delivers 20 to 25g of protein (isolate can reach 25 to 27g). Across the day, aim for roughly 0.8 to 1g of protein per pound of bodyweight from all sources. Use whey to fill the gaps rather than as your only protein.',
    safety:
      'Whey is safe for the vast majority of people. Those who are lactose-intolerant may prefer isolate (lower lactose) or struggle with concentrate. The real label trap is amino-spiking: cheap free-form aminos added to inflate the protein figure, which we score zero on purity.',
    foundIn: 'Whey concentrate, isolate and hydrolysate powders, and many protein bars and RTDs.',
    relatedGuides: ['whey', 'whey-isolate'],
    productCategory: 'whey',
    faqs: [
      { q: 'How much protein is in a whey scoop?', a: 'Typically 20 to 25g for concentrate and 25 to 27g for isolate, with isolate carrying fewer carbs and less fat.' },
      { q: 'Concentrate or isolate?', a: 'Concentrate is the best value for most people. Isolate is worth the premium mainly if you are lactose-sensitive or tightly managing calories.' },
      { q: 'What is amino-spiking in whey?', a: 'Adding cheap free-form aminos to inflate the label protein figure. It misleads buyers, so we score amino-spiked products zero on purity.' },
    ],
  },
  {
    slug: 'ashwagandha',
    name: 'Ashwagandha',
    aka: ['KSM-66', 'Sensoril', 'Withania somnifera'],
    oneLiner: 'The best-studied adaptogen — real evidence for stress, with modest effects on recovery.',
    evidence: 'Moderate',
    metaTitle: 'Ashwagandha: Dose, Benefits and the Evidence | The Lifting Lab',
    metaDescription:
      'What ashwagandha really does for stress, sleep and testosterone, the standardised dose to look for, and when to see a clinician. A UK ingredient guide.',
    whatItIs:
      'Ashwagandha is a herb used in traditional medicine and now one of the most-studied adaptogens. Quality products use standardised extracts such as KSM-66 or Sensoril, which guarantee a consistent level of the active withanolides rather than relying on vague raw-root amounts.',
    howItWorks:
      'The strongest evidence is for reducing stress and anxiety markers, including lowering cortisol in stressed individuals. There is weaker, more mixed evidence for modest improvements in sleep, recovery and testosterone. It is a supportive ingredient for stress and wellbeing rather than a dramatic performance enhancer.',
    dose:
      'Look for a standardised extract: roughly 300 to 600mg per day of KSM-66 is the most commonly studied. The standardisation matters more than the headline milligrams, because raw-root products vary wildly in potency.',
    safety:
      'Ashwagandha is generally well tolerated short-term. There have been rare reports of liver issues, and it can interact with thyroid, sedative and immune-related medications, and is not advised in pregnancy. Anyone on medication or with a health condition should check with a clinician first.',
    foundIn: 'Hormone-support and testosterone-support products, stress and sleep formulas.',
    relatedGuides: ['hormone-support'],
    productCategory: 'hormone-support',
    faqs: [
      { q: 'How much ashwagandha should I take?', a: 'Around 300 to 600mg per day of a standardised extract such as KSM-66. Standardisation matters more than the raw milligram figure.' },
      { q: 'Does ashwagandha boost testosterone?', a: 'The evidence is modest and mixed. Its strongest, best-supported effect is reducing stress and cortisol, with smaller possible effects on testosterone and recovery.' },
      { q: 'Is ashwagandha safe?', a: 'It is generally well tolerated short-term, but there are rare liver reports and medication interactions. Check with a clinician if you take medication or have a health condition.' },
    ],
  },
  {
    slug: 'magnesium',
    name: 'Magnesium',
    aka: ['magnesium glycinate', 'magnesium citrate', 'magnesium bisglycinate'],
    oneLiner: 'A commonly-short mineral for sleep, muscle function and recovery — if the form is right.',
    evidence: 'Moderate',
    metaTitle: 'Magnesium: Best Form, Dose and Benefits | The Lifting Lab',
    metaDescription:
      'Which magnesium form to choose (glycinate vs oxide), how much to take, and what it actually helps with. An evidence-based UK ingredient guide.',
    whatItIs:
      'Magnesium is an essential mineral involved in hundreds of bodily processes, including muscle and nerve function, energy production and sleep. Many active people and those eating a typical Western diet fall a little short of the recommended intake, which is where supplementing can help.',
    howItWorks:
      'Because magnesium is used in so many systems, correcting a shortfall can support sleep quality, muscle relaxation and recovery. The key word is correcting: if your levels are already adequate, extra magnesium does little. The form matters a lot for both absorption and stomach comfort.',
    dose:
      'Typical supplemental doses are around 200 to 400mg of elemental magnesium per day. Choose a well-absorbed, gentle form such as glycinate (bisglycinate) or citrate; cheap magnesium oxide is poorly absorbed and more likely to cause loose stools. Taking it in the evening suits its calming effect.',
    safety:
      'Food magnesium is safe, but high supplemental doses, especially of poorly-absorbed forms, commonly cause diarrhoea. People with kidney problems should be cautious and seek medical advice, as they clear magnesium less effectively.',
    foundIn: 'Standalone magnesium, ZMA products, multivitamins and sleep/recovery formulas.',
    relatedGuides: ['zma', 'vitamin'],
    productCategory: 'zma',
    faqs: [
      { q: 'What is the best form of magnesium?', a: 'Glycinate (bisglycinate) or citrate are well absorbed and gentle. Cheap magnesium oxide is poorly absorbed and more likely to upset the stomach.' },
      { q: 'How much magnesium should I take?', a: 'Around 200 to 400mg of elemental magnesium per day from supplements is typical. Many people take it in the evening for its calming effect.' },
      { q: 'Does magnesium help sleep?', a: 'It can, particularly if you are short of it. Correcting a shortfall supports muscle relaxation and sleep quality; topping up when already adequate does little.' },
    ],
  },
  {
    slug: 'zinc',
    name: 'Zinc',
    oneLiner: 'An essential mineral for immunity and testosterone — useful mainly when you are low.',
    evidence: 'Moderate',
    metaTitle: 'Zinc: Dose, Benefits and Safe Upper Limit | The Lifting Lab',
    metaDescription:
      'What zinc does for immunity and testosterone, the sensible dose, and why too much backfires by blocking copper. An evidence-based UK ingredient guide.',
    whatItIs:
      'Zinc is an essential mineral your body cannot store well, so you need a steady dietary supply. It supports immune function, wound healing, testosterone production and many enzymes. Hard training and heavy sweating can increase losses, so some active people run a little low.',
    howItWorks:
      'Like most minerals, zinc helps when it corrects a deficiency. In people who are short of it, restoring zinc supports normal immune function and testosterone production; in those who already have enough, extra zinc does not push hormones higher. This is why ZMA-style products help some lifters and not others.',
    dose:
      'A sensible supplemental dose is around 10 to 25mg per day. More is not better: the recognised upper limit for long-term intake is about 40mg per day from all sources, and chronically high zinc interferes with copper absorption and can cause deficiency over time.',
    safety:
      'Short courses of higher zinc (for example for a cold) are common, but sustained high doses risk copper deficiency, so stay within sensible limits long-term. Zinc on an empty stomach can cause nausea; take it with food if that happens.',
    foundIn: 'ZMA products, multivitamins, immune formulas and some hormone-support blends.',
    relatedGuides: ['zma', 'hormone-support'],
    productCategory: 'zma',
    faqs: [
      { q: 'How much zinc should I take per day?', a: 'Around 10 to 25mg from supplements is sensible. Keep total long-term intake at or below roughly 40mg per day to avoid blocking copper.' },
      { q: 'Does zinc raise testosterone?', a: 'Mainly only if you are deficient. Correcting a zinc shortfall supports normal testosterone; topping up when already adequate does not raise it further.' },
      { q: 'Can you take too much zinc?', a: 'Yes. Sustained high doses interfere with copper absorption and can cause a copper deficiency, so stay within the upper limit.' },
    ],
  },
  {
    slug: 'l-tyrosine',
    name: 'L-Tyrosine',
    aka: ['tyrosine', 'N-acetyl-L-tyrosine'],
    oneLiner: 'An amino acid for focus under stress — most useful when you are fatigued or pushed hard.',
    evidence: 'Limited',
    metaTitle: 'L-Tyrosine: Focus, Dose and the Evidence | The Lifting Lab',
    metaDescription:
      'What L-tyrosine does for focus under stress, the typical dose, and where the evidence is strong versus weak. An honest UK ingredient guide.',
    whatItIs:
      'L-tyrosine is an amino acid the body uses to make dopamine, adrenaline and noradrenaline, the chemicals behind alertness and focus. It is a common ingredient in pre-workouts and nootropic blends, marketed for sharper mental performance.',
    howItWorks:
      'Under demanding conditions, such as stress, sleep deprivation or intense effort, your brain can deplete these neurotransmitters. Tyrosine provides the raw material to top them back up, which is why the evidence is strongest for maintaining focus under stress or fatigue rather than boosting a well-rested mind in normal conditions.',
    dose:
      'Studied doses range widely, commonly 500 to 2000mg taken 30 to 60 minutes before a demanding task or workout. N-acetyl-L-tyrosine (NALT) is a more soluble form but is less well absorbed gram-for-gram, so plain L-tyrosine is often the better value.',
    safety:
      'L-tyrosine is well tolerated at typical doses. People taking thyroid medication or MAOI antidepressants, or who have certain conditions, should check with a clinician, as tyrosine feeds into thyroid hormone and catecholamine pathways.',
    foundIn: 'Pre-workouts, focus and nootropic blends, some fat-burners.',
    relatedGuides: ['pre-workout'],
    productCategory: 'pre-workout',
    faqs: [
      { q: 'How much L-tyrosine should I take?', a: 'Commonly 500 to 2000mg, taken 30 to 60 minutes before a workout or demanding task.' },
      { q: 'Does L-tyrosine actually improve focus?', a: 'The evidence is strongest for maintaining focus under stress, fatigue or sleep deprivation, and weaker for boosting a well-rested mind in normal conditions.' },
      { q: 'Is NALT better than L-tyrosine?', a: 'N-acetyl-L-tyrosine is more soluble but absorbed less efficiently gram-for-gram, so plain L-tyrosine is often the better-value choice.' },
    ],
  },
  {
    slug: 'electrolytes',
    name: 'Electrolytes',
    aka: ['sodium', 'potassium', 'electrolyte powder'],
    oneLiner: 'Sodium first — it is what actually makes a hydration product work.',
    evidence: 'Strong',
    metaTitle: 'Electrolytes for Hydration: Sodium, Potassium and Dose | The Lifting Lab',
    metaDescription:
      'Which electrolytes matter, how much sodium a good hydration product needs, and why most cheap tablets fall short. An evidence-based UK ingredient guide.',
    whatItIs:
      'Electrolytes are minerals that carry an electrical charge and govern fluid balance, nerve signals and muscle contractions. The main ones in hydration products are sodium, potassium and magnesium, with sodium doing most of the work.',
    howItWorks:
      'When you sweat you lose fluid and a significant amount of sodium. Replacing that sodium is what lets your body hold onto water and maintain performance during long or hot training. Potassium and magnesium play supporting roles. A product without meaningful sodium is mostly flavour, no matter what the label promises.',
    dose:
      'For heavy or prolonged sweating, effective hydration products provide a substantial sodium dose, often 500 to 1000mg per serving, plus supporting potassium and magnesium. Everyday gym sessions need far less; match the dose to how much you actually sweat rather than over-salting routinely.',
    safety:
      'Electrolyte products are safe for healthy people in normal use, but high-sodium formulas are not for everyone. Those with high blood pressure, kidney or heart conditions should be cautious with added sodium and seek medical advice. Plain water is fine for short, light sessions.',
    foundIn: 'Hydration powders and tablets, intra-workout drinks and some pre-workouts.',
    relatedGuides: ['hydration', 'intra-workout'],
    productCategory: 'hydration',
    faqs: [
      { q: 'Which electrolyte matters most?', a: 'Sodium. Effective hydration products often provide 500 to 1000mg of sodium per serving, with potassium and magnesium in supporting roles.' },
      { q: 'Why are cheap electrolyte tablets less effective?', a: 'They usually contain only token amounts of sodium and lean on flavour and sugar, so they replace far less of what you lose in sweat.' },
      { q: 'Do I need electrolytes for every workout?', a: 'No. Short, light sessions are fine on water. Electrolytes earn their place during long, hot or heavy-sweat training.' },
    ],
  },
  {
    slug: 'vitamin-d3',
    name: 'Vitamin D3',
    aka: ['vitamin D', 'cholecalciferol'],
    oneLiner: 'The one supplement most people in the UK genuinely benefit from over winter.',
    evidence: 'Strong',
    metaTitle: 'Vitamin D3: UK Dose, D3 vs D2 and K2 | The Lifting Lab',
    metaDescription:
      'How much vitamin D3 to take in the UK, why D3 beats D2, and whether to pair it with K2. An evidence-based UK ingredient guide.',
    whatItIs:
      'Vitamin D is a fat-soluble vitamin your skin makes from sunlight and that supports bone health, immune function and muscle. D3 (cholecalciferol) is the form that raises blood levels most effectively. At UK latitudes there is too little sun from about October to March to make enough, so deficiency is common.',
    howItWorks:
      'Vitamin D helps your body absorb calcium and supports immune and muscle function. Because so many people in the UK are low, especially in winter, correcting that shortfall is where the real benefit lies. As with most nutrients, more is not better once your levels are adequate.',
    dose:
      'UK guidance is at least 400iu (10 micrograms) a day to maintain levels, but many adults benefit from 1000 to 4000iu, particularly in winter or with limited sun exposure. Staying at or below 4000iu keeps you within the recognised safe upper limit for unsupervised use. Take it with a meal containing some fat.',
    safety:
      'Vitamin D is safe within the usual range, but it is fat-soluble and can accumulate, so very high unsupervised doses can raise calcium too far and cause harm. If you suspect significant deficiency or want to exceed the everyday range, a simple blood test guides the right dose.',
    foundIn: 'Standalone vitamin D3 (often with K2), multivitamins and some wellbeing blends.',
    relatedGuides: ['vitamin-d', 'vitamin'],
    productCategory: 'vitamin-d',
    faqs: [
      { q: 'How much vitamin D3 should I take in the UK?', a: 'At least 400iu daily to maintain levels, with many adults benefiting from 1000 to 4000iu, especially in winter. Stay at or below 4000iu without medical supervision.' },
      { q: 'Is D3 better than D2?', a: 'Yes. Vitamin D3 (cholecalciferol) raises and maintains blood levels more effectively than D2, so it is the preferred form.' },
      { q: 'Should I take vitamin D with K2?', a: 'It is a sensible pairing, as K2 helps direct calcium into bone, but it is not essential. A well-dosed plain D3 is still very effective.' },
    ],
  },
]

const INGREDIENT_BY_SLUG: Record<string, Ingredient> = Object.fromEntries(
  INGREDIENTS.map((i) => [i.slug, i])
)

export function getIngredient(slug: string): Ingredient | undefined {
  return INGREDIENT_BY_SLUG[slug]
}

export const INGREDIENT_SLUGS = INGREDIENTS.map((i) => i.slug)
