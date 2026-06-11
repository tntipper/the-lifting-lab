// Educational content for /guide/[category] SEO pages.
// `slug` matches the Supabase `category` column so we can pull the top-3 products.

export type Faq = { q: string; a: string }

export type Guide = {
  slug: string
  h1: string
  metaTitle: string
  metaDescription: string
  intro: string
  paras: string[]
  faqs: Faq[]
}

export const GUIDES: Guide[] = [
  {
    slug: 'creatine',
    h1: 'Creatine Monohydrate: The UK Buyer’s Guide',
    metaTitle: 'Best Creatine UK 2026 — Monohydrate Buyer’s Guide | The Lifting Lab',
    metaDescription:
      'Creatine monohydrate is the most researched supplement in sport. Here is how to dose it, what Creapure means, and the best-value UK options ranked by purity.',
    intro:
      'Creatine monohydrate is the single most studied sports supplement in existence, with decades of evidence behind its effect on strength, power output and lean mass. The good news for your wallet: it is also one of the cheapest, and the differences between brands come down almost entirely to purity and price per gram.',
    paras: [
      'The effective daily dose is 3–5g of creatine monohydrate, taken every day. Timing does not matter much, so take it whenever you will remember it consistently. A loading phase of 20g per day for the first week speeds up saturation but is entirely optional; skipping it just means full stores take three to four weeks instead of one.',
      'Monohydrate is the form with the deepest evidence base. Fancier forms such as hydrochloride (HCl), ethyl ester or buffered creatine are marketed as superior absorption, but the research does not support paying a premium for them. If a product hides its creatine inside a proprietary blend, you cannot verify the dose, and we mark it down heavily for that.',
      'Creapure is a branded German-manufactured creatine monohydrate held to a very high purity standard. It is a genuine quality marker and earns bonus points in our scoring, though plain micronised monohydrate from a reputable brand is still excellent value. Micronised simply means the powder is milled finer so it mixes more easily.',
      'Watch the price per serving rather than the price per tub. A large 500g–1kg pouch of plain monohydrate almost always beats single-serve sachets or capsule formats on cost. Our scores reward products that deliver a clean, fully-disclosed 3–5g dose at a sensible price per gram.',
    ],
    faqs: [
      { q: 'How much creatine should I take per day?', a: '3 to 5 grams of creatine monohydrate daily is the evidence-based maintenance dose. A loading phase is optional.' },
      { q: 'Do I need to load creatine?', a: 'No. Loading (around 20g a day for a week) saturates your muscles faster, but taking 3 to 5g daily reaches the same level within three to four weeks.' },
      { q: 'Is Creapure worth the extra cost?', a: 'Creapure is a high-purity certified monohydrate and a reliable quality marker, but standard micronised monohydrate from a reputable brand is also very effective and cheaper.' },
      { q: 'When is the best time to take creatine?', a: 'Timing has little effect. Daily consistency matters far more than whether you take it before or after training.' },
    ],
  },
  {
    slug: 'whey',
    h1: 'Whey Protein: How to Choose a UK Whey Powder',
    metaTitle: 'Best Whey Protein UK 2026 — Buyer’s Guide | The Lifting Lab',
    metaDescription:
      'Whey concentrate vs isolate, protein per scoop, amino-spiking and value. A clear, evidence-based guide to choosing UK whey protein, with top products ranked.',
    intro:
      'Whey protein is the workhorse of any supplement shelf: a fast-digesting, complete protein that makes hitting your daily target easy. Most lifters do not need anything more exotic than a good whey concentrate, but the gap between a great-value tub and an overpriced one is wider than the marketing suggests.',
    paras: [
      'Aim for roughly 0.8–1g of protein per pound of bodyweight across the day from all sources. A whey shake is just a convenient way to top that up, typically delivering 20–25g of protein per scoop. What matters is the protein per serving and per pound of powder, not the flavour range.',
      'Whey concentrate is around 70–80% protein by weight and is the best value for most people. Whey isolate is more filtered (90%+ protein, lower carbs and fat, lower lactose), which suits those watching calories or sensitive to lactose, but it costs more per gram of protein. Hydrolysed whey is pre-digested for marginally faster absorption and rarely justifies its price.',
      'The biggest red flag is amino-spiking (also called nitrogen-spiking), where cheap free-form amino acids like glycine or taurine are added to inflate the protein number on the label without delivering complete protein. We award an automatic zero on our purity metric to any product that does this, because it misrepresents what you are paying for.',
      'Informed Sport certification matters if you are a tested athlete, as it screens batches for banned substances. For everyone else, focus on a clean ingredient list, a fully-disclosed protein content, and the lowest cost per 25g of protein. Our scores weight purity and true value above all.',
    ],
    faqs: [
      { q: 'How much protein is in a whey shake?', a: 'Most whey concentrates deliver 20 to 25g of protein per scoop; isolates can reach 25 to 27g with fewer carbs and less fat.' },
      { q: 'Concentrate or isolate — which is better?', a: 'Concentrate is the best value for most people. Isolate is worth the extra cost mainly if you are lactose-sensitive or tightly managing calories.' },
      { q: 'What is amino-spiking?', a: 'Adding cheap free-form aminos to inflate the label protein figure. It misleads buyers, so we score amino-spiked products zero on purity.' },
      { q: 'Do I need Informed Sport certified whey?', a: 'Only if you are a drug-tested athlete. Certification screens for banned substances batch by batch; recreational lifters can prioritise value instead.' },
    ],
  },
  {
    slug: 'whey-isolate',
    h1: 'Whey Isolate: Is It Worth the Premium?',
    metaTitle: 'Best Whey Isolate UK 2026 — Buyer’s Guide | The Lifting Lab',
    metaDescription:
      'Whey isolate is more filtered, leaner and lower in lactose than concentrate. Here is when it is worth paying for, and the best UK isolates ranked by value.',
    intro:
      'Whey isolate is whey concentrate taken a step further through additional filtration, leaving a powder that is 90%+ protein with very little fat, carbohydrate or lactose. It is the leanest mainstream protein you can buy, but it carries a price premium that does not make sense for everyone.',
    paras: [
      'Because isolate is so highly filtered, it suits anyone tracking calories closely, prepping for a physique goal, or struggling with the lactose in concentrate. A typical scoop delivers 25–27g of protein with under 1–2g each of carbs and fat.',
      'Clear whey isolates are a newer, juice-like format that some people find easier to drink than a creamy milkshake. Nutritionally they are similar to standard isolate; the choice is about taste and texture rather than effectiveness.',
      'Hydrolysed isolate is partially broken down for faster absorption and is the most expensive tier. For the overwhelming majority of lifters this extra speed is irrelevant to results, so we treat the premium with scepticism in our scoring.',
      'As with any protein, value is about cost per gram of protein and a clean, fully-disclosed label. If you do not need the leanness, a good concentrate gives you more protein for your money. If you do, our ranked isolates show which brands deliver the filtration without gouging you.',
    ],
    faqs: [
      { q: 'Is whey isolate better than concentrate?', a: 'Not for everyone. Isolate is leaner and lower in lactose, which helps if you are cutting or lactose-sensitive, but concentrate gives more protein per pound spent.' },
      { q: 'Is clear whey as good as regular isolate?', a: 'Nutritionally they are comparable. Clear whey is a lighter, juice-style drink; pick it for taste preference, not for any performance edge.' },
      { q: 'How much protein per scoop of isolate?', a: 'Typically 25 to 27g of protein with very low carbs and fat per serving.' },
    ],
  },
  {
    slug: 'pre-workout',
    h1: 'Pre-Workout Supplements: What Actually Works',
    metaTitle: 'Best Pre-Workout UK 2026 — Evidence-Based Guide | The Lifting Lab',
    metaDescription:
      'Caffeine, citrulline, beta-alanine — which pre-workout ingredients are dosed effectively and which are fairy dust. A UK buyer’s guide with products ranked.',
    intro:
      'Pre-workout is the most marketing-driven category in supplements, packed with long ingredient lists where only a few items are dosed at levels that do anything. The trick is to ignore the label theatre and focus on whether the handful of evidence-backed actives are present at real doses.',
    paras: [
      'Caffeine is the engine of most pre-workouts, effective for focus and perceived effort at roughly 3–6mg per kg of bodyweight. We heavily penalise products that push past 400mg per serving, as that crosses into territory where side effects outweigh benefits for most people. If you train in the evening, consider a stim-free option.',
      'Citrulline malate (6–8g) supports blood flow and pump, and L-citrulline at 3–4g is the cleaner equivalent. Beta-alanine at 3.2g per day buffers fatigue in higher-rep work and causes the harmless tingling many people feel. These are the actives worth checking for; many products under-dose them to save money.',
      'The single biggest red flag is the proprietary blend, where everything is lumped into one total so you cannot see how much of each ingredient you are getting. This almost always hides under-dosing, and we apply a severe penalty to any product that uses one.',
      'Plenty of pre-workout ingredients are there purely for the label: tiny amounts of exotic-sounding compounds that have no effect at the dose provided. A short, transparent formula with properly dosed caffeine, citrulline and beta-alanine beats a 15-ingredient blend every time. Our scores reflect that.',
    ],
    faqs: [
      { q: 'How much caffeine should a pre-workout have?', a: 'Around 3 to 6mg per kg of bodyweight. We penalise servings above 400mg, where downsides tend to outweigh benefits.' },
      { q: 'What ingredients actually work in pre-workout?', a: 'Caffeine for focus and effort, citrulline for blood flow and pump, and beta-alanine (3.2g/day) for higher-rep fatigue buffering.' },
      { q: 'Why are proprietary blends a problem?', a: 'They hide the individual ingredient doses behind one total, which usually masks under-dosing. We score blended products down heavily.' },
      { q: 'Is stim-free pre-workout worth it?', a: 'Yes if you train late or are caffeine-sensitive. You keep the pump and performance ingredients without the stimulant affecting sleep.' },
    ],
  },
  {
    slug: 'eaas',
    h1: 'EAAs and BCAAs: Do You Actually Need Them?',
    metaTitle: 'Best EAAs UK 2026 — EAA vs BCAA Guide | The Lifting Lab',
    metaDescription:
      'Essential amino acids vs BCAAs explained. When intra-workout aminos help, what a full-spectrum dose looks like, and the best-value UK EAA products ranked.',
    intro:
      'Essential amino acids (EAAs) are the nine amino acids your body cannot make and must get from food. They have edged out BCAAs as the smarter intra-workout choice, because muscle protein synthesis needs the full set, not just the three branched-chain ones.',
    paras: [
      'If you already eat enough total protein each day, EAAs are a convenience and an intra-workout sipper rather than a necessity. Where they earn their place is fasted training, very long sessions, or simply making water taste good enough that you drink more during a workout.',
      'A useful EAA dose provides all nine essentials with a meaningful leucine content (around 2–3g), as leucine is the trigger for muscle protein synthesis. Products that are mostly BCAAs with a token amount of the other essentials are the old approach dressed up, and we score them accordingly.',
      'BCAAs (leucine, isoleucine, valine) became popular on incomplete science. On their own they cannot maximise muscle protein synthesis because the other six essentials are missing, so a full EAA blend is the better buy for the same money.',
      'Check the label for the full amino profile and avoid proprietary blends that hide the ratios. Our scores reward complete, transparent EAA formulas with proper leucine, and mark down BCAA-heavy products and anything that buries its doses.',
    ],
    faqs: [
      { q: 'Are EAAs better than BCAAs?', a: 'Yes. Muscle protein synthesis needs all nine essential amino acids, so a full EAA blend beats BCAAs, which only provide three.' },
      { q: 'Do I need EAAs if I eat enough protein?', a: 'Not really. With adequate daily protein they are mainly a convenience for fasted or long training sessions and to encourage hydration.' },
      { q: 'How much leucine should an EAA have?', a: 'Around 2 to 3g of leucine per serving, since leucine is the main trigger for muscle protein synthesis.' },
    ],
  },
  {
    slug: 'casein',
    h1: 'Casein Protein: The Slow-Release Option',
    metaTitle: 'Best Casein Protein UK 2026 — Buyer’s Guide | The Lifting Lab',
    metaDescription:
      'Micellar casein digests slowly for a steady amino release, making it popular before bed. Here is how it differs from whey and the best UK casein, ranked.',
    intro:
      'Casein is the slow-digesting counterpart to whey. Where whey spikes amino acids quickly, micellar casein forms a gel in the stomach and releases them gradually over several hours, which is why it is often taken before bed or during long gaps between meals.',
    paras: [
      'Micellar casein is the minimally-processed, preferred form. It keeps the natural micelle structure that gives casein its slow-release property. Calcium caseinate is a cheaper, more processed alternative that digests a little faster and is generally a lower-quality option.',
      'The classic use case is a pre-bed shake to provide a steady amino acid supply through the overnight fast. The evidence for this giving a meaningful muscle advantage over simply hitting your daily protein target is modest, so treat it as a convenient way to add protein rather than a magic bullet.',
      'Casein is naturally higher in some minerals and tends to be thicker and more filling than whey, which some people like as a snack replacement. A typical scoop delivers 24–25g of protein.',
      'As always, value comes down to protein per serving, a clean label, and cost per gram of protein. Watch for low-grade caseinate blends sold at micellar prices. Our scores reward genuine micellar casein with transparent dosing.',
    ],
    faqs: [
      { q: 'What is casein protein best for?', a: 'A slow, steady amino acid release, which is why it is popular as a pre-bed shake or between long gaps in meals.' },
      { q: 'Is casein better than whey?', a: 'Neither is better overall. Whey digests fast and suits around training; casein digests slowly and suits overnight or long fasts.' },
      { q: 'Micellar casein vs calcium caseinate?', a: 'Micellar casein is the higher-quality, slow-release form. Calcium caseinate is cheaper, more processed and digests faster.' },
    ],
  },
  {
    slug: 'hydration',
    h1: 'Electrolytes and Hydration: What to Look For',
    metaTitle: 'Best Electrolyte Powders UK 2026 — Hydration Guide | The Lifting Lab',
    metaDescription:
      'Sodium, potassium and magnesium are what make a hydration product work. Here is how to read an electrolyte label and the best-value UK options, ranked.',
    intro:
      'Hydration products have boomed, but most of the price difference between them comes down to one number: how much sodium they actually contain. Electrolytes — chiefly sodium, with potassium and magnesium — are what let your body hold onto water and maintain performance when you sweat.',
    paras: [
      'Sodium is the headline electrolyte. Sweat is salty, and during long or hot training you can lose a lot of it. Effective hydration products provide a substantial sodium dose (often 500–1000mg per serving), whereas many supermarket tablets contain only a token amount and lean on sugar and flavour instead.',
      'Potassium and magnesium play supporting roles in fluid balance and muscle function, so a good blend includes meaningful amounts of both. Be wary of products where the electrolyte content is tiny and the bulk of the serving is sugar or maltodextrin for taste.',
      'Sugar is not automatically bad: during prolonged endurance work a little carbohydrate aids both fluid absorption and fuelling. For everyday hydration or shorter gym sessions, though, you usually want the electrolytes without the extra calories.',
      'Match the product to the job: high-sodium formulas for heavy sweaters and endurance, lighter ones for daily top-ups. Our scores reward transparent, properly-dosed electrolyte content over sugar-and-flavour fillers.',
    ],
    faqs: [
      { q: 'What electrolytes matter most for hydration?', a: 'Sodium is the priority, supported by potassium and magnesium. Effective products often provide 500 to 1000mg of sodium per serving.' },
      { q: 'Do I need sugar in a hydration drink?', a: 'Only for prolonged endurance exercise, where some carbohydrate aids fluid absorption and fuelling. For everyday use you can skip it.' },
      { q: 'Why are some electrolyte tablets so cheap?', a: 'They usually contain only token amounts of sodium and rely on flavour and sugar, so they hydrate far less effectively than higher-dosed powders.' },
    ],
  },
  {
    slug: 'protein-bar',
    h1: 'Protein Bars: How to Read the Label',
    metaTitle: 'Best Protein Bars UK 2026 — Buyer’s Guide | The Lifting Lab',
    metaDescription:
      'Protein bars range from genuine high-protein snacks to glorified chocolate. Here is how to judge protein, sugar and calories, with the best UK bars ranked.',
    intro:
      'A good protein bar is a convenient way to add 15–20g of protein on the go; a bad one is a chocolate bar with a health halo. The category is full of both, and the label tells you which you are holding if you know the three numbers to check.',
    paras: [
      'Start with the protein-to-calorie ratio. A strong bar delivers around 15–20g of protein for roughly 200 calories. If a bar is 250+ calories for only 10g of protein, you are mostly paying for sugar and fat dressed up as a fitness product.',
      'Check the sugar content next. Many bars use sugar alcohols (such as maltitol) to keep sugar low while staying sweet; these can cause digestive upset in larger amounts, so they are worth being aware of if you eat several a day.',
      'Texture and ingredient quality vary widely, but they do not change the core maths: protein per calorie, and how much added sugar comes along for the ride. Flavour is personal, and best discovered by trying a few.',
      'Treat bars as a convenience, not a staple — whole-food protein is cheaper per gram. When you do buy them, our scores reward a high protein-to-calorie ratio and a sensible sugar profile.',
    ],
    faqs: [
      { q: 'How much protein should a good protein bar have?', a: 'Around 15 to 20g of protein for roughly 200 calories is a strong protein-to-calorie ratio.' },
      { q: 'Are sugar alcohols in protein bars bad?', a: 'In moderation they are fine and keep sugar low, but larger amounts of sugar alcohols like maltitol can cause digestive discomfort.' },
      { q: 'Can protein bars replace meals?', a: 'They are best as a convenient snack to top up protein, not a regular meal replacement. Whole food is cheaper per gram of protein.' },
    ],
  },
  {
    slug: 'hormone-support',
    h1: 'Testosterone and Hormone Support Supplements',
    metaTitle: 'Testosterone Support Supplements UK 2026 — Honest Guide | The Lifting Lab',
    metaDescription:
      'Most testosterone-booster ingredients are unproven. Here is what the evidence says about the few that help correct deficiencies, and how to read the labels.',
    intro:
      'Testosterone and hormone-support supplements are one of the most over-promised categories on the shelf. The honest position is that no over-the-counter product reliably raises testosterone in healthy men with normal levels; the genuine benefit, where it exists, is in correcting deficiencies in nutrients that hormone production depends on.',
    paras: [
      'A handful of ingredients have reasonable evidence in specific situations. Zinc and magnesium support normal testosterone production if you are deficient, which is why ZMA-style products exist; if your levels are already adequate, topping up does little. Vitamin D works the same way — correcting a deficiency can help, but more is not better.',
      'Ashwagandha is one of the better-studied herbal options, with evidence for reducing stress markers and modest effects on testosterone and recovery in some trials. Tongkat ali and fenugreek have weaker, more mixed evidence. Many proprietary "test boosters" lean on tribulus and similar ingredients that have largely failed to show an effect in controlled studies.',
      'Beware big blends that combine many half-doses of trendy ingredients behind a proprietary label. They are designed to look impressive rather than to deliver any single ingredient at a researched dose, and we penalise that hiding heavily in our scores.',
      'Most importantly: if you suspect genuinely low testosterone — through fatigue, low libido, mood changes or poor recovery — that is a medical matter, not a supplement one. Get a blood test and speak to a qualified clinician rather than self-treating with over-the-counter boosters. Supplements can support the basics, but they are not a substitute for proper medical assessment.',
    ],
    faqs: [
      { q: 'Do testosterone boosters actually work?', a: 'No over-the-counter product reliably raises testosterone in healthy men. The real benefit is correcting deficiencies in nutrients like zinc, magnesium and vitamin D that hormone production relies on.' },
      { q: 'Is ashwagandha good for testosterone?', a: 'It is among the better-studied options, with evidence for lowering stress markers and modest effects on testosterone and recovery in some trials, though results vary.' },
      { q: 'Should I see a doctor about low testosterone?', a: 'Yes. Suspected low testosterone should be assessed with a blood test by a qualified clinician, not self-treated with supplements.' },
    ],
  },
]

const GUIDE_BY_SLUG: Record<string, Guide> = Object.fromEntries(
  GUIDES.map((g) => [g.slug, g])
)

export function getGuide(slug: string): Guide | undefined {
  return GUIDE_BY_SLUG[slug]
}

export const GUIDE_SLUGS = GUIDES.map((g) => g.slug)
