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
  {
    slug: 'post-workout',
    h1: 'Post-Workout Recovery Supplements: What You Actually Need',
    metaTitle: 'Best Post-Workout UK 2026 — Recovery Supplement Guide | The Lifting Lab',
    metaDescription:
      'Protein, carbs and creatine are the recovery basics that work. Here is what belongs in a post-workout, what is filler, and the best UK options ranked.',
    intro:
      'The post-workout window has been sold harder than almost any other moment in training, but the science is calmer than the marketing. Recovery is driven by your total daily protein and calories far more than by a magic shake in the first thirty minutes. A good post-workout product just makes hitting those basics convenient.',
    paras: [
      'The two ingredients that matter most are protein and carbohydrate. Around 20–40g of a fast protein such as whey supplies the amino acids for muscle repair, while carbohydrate (roughly 0.5–1g per kg of bodyweight after hard sessions) refills muscle glycogen. For most lifters eating regular meals, a normal meal within a couple of hours does the same job.',
      'The so-called anabolic window is wider than once thought. Provided you have eaten protein in the hours around training, the exact timing of your post-workout shake makes little difference to long-term muscle gain. It matters more for athletes training twice a day or fasted, where rapid refuelling has a clearer benefit.',
      'Creatine is a sensible add-on to a recovery product because daily consistency is what matters, not timing, so bundling 3–5g into your post-workout is a convenient habit. Electrolytes can help after very sweaty sessions. Most other recovery-blend ingredients, from exotic adaptogens to under-dosed amino mixes, add cost rather than results.',
      'Watch for all-in-one recovery blends that bury small doses of many ingredients behind a proprietary label. A transparent product giving you a proper protein dose, sensible carbs and optional creatine beats a long ingredient list every time. Our scores reward clear, well-dosed recovery formulas over kitchen-sink blends.',
    ],
    faqs: [
      { q: 'What should I take after a workout?', a: 'Protein (around 20 to 40g of a fast source like whey) plus some carbohydrate to refuel. Creatine is a useful daily add-on. A normal meal soon after works just as well for most people.' },
      { q: 'Is the anabolic window real?', a: 'It is much wider than the old 30-minute claim. As long as you eat protein in the hours around training, exact timing has little effect on muscle growth.' },
      { q: 'Do I need carbs after lifting?', a: 'They help refill muscle glycogen after hard or long sessions, but if you eat enough carbohydrate across the day it is not essential to have them immediately post-workout.' },
    ],
  },
  {
    slug: 'intra-workout',
    h1: 'Intra-Workout Supplements: Sipping Through Your Session',
    metaTitle: 'Best Intra-Workout UK 2026 — Buyer’s Guide | The Lifting Lab',
    metaDescription:
      'Intra-workout drinks combine EAAs, carbs and electrolytes to sip mid-session. Here is when they help, what to look for, and the best-value UK options ranked.',
    intro:
      'An intra-workout is what you sip during training, usually a mix of essential amino acids, fast carbohydrate and electrolytes. For a standard hour in the gym it is more of a nice-to-have than a need, but for long, hard or fasted sessions it can genuinely help you keep going.',
    paras: [
      'The main use case is endurance: long training sessions, two-a-days, or fasted morning workouts where you have no recent meal to draw on. Sipping carbohydrate and aminos through a long session helps maintain output and reduces the muscle breakdown that comes with training on empty. For a short, fed gym session the benefit is marginal.',
      'Essential amino acids (with a meaningful leucine content) are the smarter amino choice over plain BCAAs, because muscle repair needs the full set. A useful intra-workout provides the nine essentials rather than just the three branched-chain ones, and we score BCAA-only products down accordingly.',
      'Fast carbohydrate such as cyclic dextrin or maltodextrin supplies energy without sitting heavily in the stomach, which suits endurance and high-volume work. Electrolytes, chiefly sodium, replace what you lose in sweat and help you keep drinking. Not every product needs all three, so match the formula to the job.',
      'As ever, the proprietary blend is the red flag. If you cannot see how much of each amino, carb or electrolyte you are getting, you cannot judge the value. Our scores reward transparent intra-workout formulas with proper EAA dosing over blended, under-disclosed mixes.',
    ],
    faqs: [
      { q: 'Do I need an intra-workout drink?', a: 'Not for a normal hour in the gym if you have eaten beforehand. They earn their place during long, hard or fasted sessions where mid-workout fuel helps.' },
      { q: 'What goes in an intra-workout?', a: 'Usually essential amino acids for muscle support, fast carbohydrate for energy, and electrolytes (mainly sodium) to replace sweat losses.' },
      { q: 'EAAs or BCAAs for intra-workout?', a: 'EAAs. Muscle protein synthesis needs all nine essential amino acids, so a full EAA blend beats a BCAA-only product for the same money.' },
    ],
  },
  {
    slug: 'cycle-support',
    h1: 'Cycle Support and Organ Health Supplements',
    metaTitle: 'Cycle Support Supplements UK 2026 — Honest Guide | The Lifting Lab',
    metaDescription:
      'Cycle support products aim to protect the liver, heart and other organs during demanding regimes. Here is what the ingredients do and where medical advice is essential.',
    intro:
      'Cycle support products are marketed at people putting their bodies under heavy demand, with the goal of protecting the liver, heart and other organs. They typically combine antioxidants, liver-support compounds and cardiovascular ingredients. The honest framing is that these are supportive supplements, not a safety net that makes a risky regime safe.',
    paras: [
      'Common ingredients include milk thistle (silymarin) and NAC (N-acetylcysteine), both studied for liver support, along with TUDCA in some products. For heart and blood-lipid support you will see things like omega-3, garlic extract and CoQ10. The evidence for these ranges from reasonable to modest, and a properly dosed single ingredient is worth more than a sprinkle of many.',
      'Dosing transparency matters even more here than usual. Many organ-support blends hide small amounts of expensive ingredients behind a proprietary label, so you cannot tell whether the NAC or milk thistle is at a researched dose or just present for the label. We penalise that hiding heavily, because with organ health you want to know exactly what you are taking.',
      'These products cannot offset the underlying stressor. If someone is using anabolic steroids, prohormones or other compounds that strain the liver and cardiovascular system, no supplement removes that risk. Bloodwork and medical supervision are what protect you, and a cycle-support tub is at best a minor adjunct to proper monitoring.',
      'If you are considering or already using anything that demands organ support, the most important step is regular blood testing and a conversation with a qualified clinician who can interpret your liver enzymes, lipids and blood pressure. Supplements may play a small supporting role, but they are not a substitute for medical oversight. Our scores reward transparent, sensibly-dosed support formulas, but no score replaces a doctor.',
    ],
    faqs: [
      { q: 'What is cycle support used for?', a: 'It aims to support the liver, heart and other organs during demanding regimes, typically using ingredients like milk thistle, NAC, omega-3 and CoQ10.' },
      { q: 'Does cycle support make a steroid cycle safe?', a: 'No. No supplement offsets the underlying risk. Regular bloodwork and supervision from a qualified clinician are what protect your health, not a support product.' },
      { q: 'Which cycle-support ingredients have evidence?', a: 'Milk thistle and NAC have reasonable evidence for liver support, and omega-3 and CoQ10 for cardiovascular markers, but dosing and quality vary widely between products.' },
    ],
  },
  {
    slug: 'meal-replacement',
    h1: 'Meal Replacement Shakes: A Sensible Buyer’s Guide',
    metaTitle: 'Best Meal Replacement UK 2026 — Buyer’s Guide | The Lifting Lab',
    metaDescription:
      'A good meal replacement is balanced nutrition in a hurry, not just protein. Here is how to judge macros, micros and value, with the best UK options ranked.',
    intro:
      'A meal replacement is meant to stand in for a proper meal when you do not have time for one, which means it has to do more than a protein shake. The good ones deliver balanced protein, carbohydrate and fat plus a full spread of vitamins and minerals; the weak ones are just flavoured protein with a meal-replacement label.',
    paras: [
      'The first thing to check is whether the macros actually resemble a meal. A useful meal replacement provides a meaningful amount of protein (often 20–30g), a sensible balance of carbohydrate and fat, and enough calories to be filling, typically 300–400 per serving. Something delivering 150 calories is a snack, not a meal substitute.',
      'Micronutrients are what separate a real meal replacement from a protein shake. Look for a broad vitamin and mineral profile, ideally covering a decent fraction of your daily requirements, plus fibre to aid fullness and digestion. Products engineered as complete-food brands tend to do this far better than repurposed protein powders.',
      'Consider the fat and fibre source as well as the numbers. Whole-food-style ingredients, healthier fats and added fibre make a shake more satisfying and steadier on blood sugar than one built on cheap fillers and lots of sugar. Ready-to-drink formats are convenient but usually cost more per serving than powders.',
      'Meal replacements are a tool for convenience and consistency, not a reason to skip real food long-term. When you do use them, value comes down to complete nutrition per serving at a fair price. Our scores reward balanced macros, a genuine micronutrient profile and sensible calories over protein-only shakes wearing a meal-replacement badge.',
    ],
    faqs: [
      { q: 'What makes a good meal replacement?', a: 'Balanced protein, carbs and fat, a broad vitamin and mineral profile, some fibre, and enough calories (often 300 to 400 per serving) to actually replace a meal.' },
      { q: 'Are meal replacements healthy?', a: 'A well-formulated one can be a balanced, convenient meal stand-in. They are best used occasionally for convenience rather than as a permanent replacement for whole food.' },
      { q: 'Powder or ready-to-drink?', a: 'Nutritionally they can be similar. Powders are usually cheaper per serving; ready-to-drink bottles cost more but win on convenience.' },
    ],
  },
  {
    slug: 'vitamin',
    h1: 'Vitamins and Wellbeing Supplements: A No-Nonsense Guide',
    metaTitle: 'Best Vitamins UK 2026 — Wellbeing Supplement Guide | The Lifting Lab',
    metaDescription:
      'Which everyday vitamins and minerals are worth taking, how to dose them, and how to avoid overpaying. An evidence-based UK guide with top products ranked.',
    intro:
      'The vitamins and wellbeing aisle is enormous, and most of it is sold on vague promises of energy and immunity. The useful truth is narrower: a few specific vitamins and minerals are genuinely worth supplementing for many people in the UK, while plenty of others only help if you are actually short of them.',
    paras: [
      'A handful of supplements have a strong case for most UK adults. Vitamin D is the standout, because limited winter sunlight means many people are low; 1000–4000iu daily is a sensible range. Omega-3 supports heart and brain health if you eat little oily fish, and magnesium helps if your diet is short on it. These correct common gaps rather than promising miracles.',
      'Beyond those, the principle is simple: a vitamin only helps if you are deficient in it. Topping up a nutrient you already get enough of does little, and a few (such as vitamins A and E, or iron without a tested need) can be harmful in excess. More is not better, and megadoses are usually a waste of money at best.',
      'Form and dose matter for value. Magnesium glycinate or bisglycinate is better absorbed and gentler than cheap oxide; vitamin D paired with K2 is a common, sensible combination; B vitamins are water-soluble so huge doses are simply excreted. Check that a product gives a meaningful, well-absorbed dose rather than a token amount inflated by marketing.',
      'For general wellbeing, a balanced diet does most of the work, with targeted supplements filling known gaps. If you have symptoms like persistent fatigue, it is worth a blood test rather than guessing with a cabinet full of pills. Our scores reward well-dosed, well-formulated single nutrients and honest labels over kitchen-sink wellbeing blends.',
    ],
    faqs: [
      { q: 'Which vitamins are actually worth taking?', a: 'Vitamin D is the strongest case for most UK adults, especially in winter. Omega-3 and magnesium help if your diet is short on them. Beyond that, supplement to fix a known gap rather than by default.' },
      { q: 'Can you take too many vitamins?', a: 'Yes. Fat-soluble vitamins like A and E, and minerals like iron, can be harmful in excess. With most nutrients, more than you need offers no extra benefit.' },
      { q: 'Do I need a blood test before supplementing?', a: 'For general nutrients like vitamin D it is reasonable to supplement sensibly without one. For persistent symptoms or things like iron, a blood test is the smarter route than guessing.' },
    ],
  },
  {
    slug: 'multivitamin',
    h1: 'Multivitamins: Are They Worth It?',
    metaTitle: 'Best Multivitamin UK 2026 — Buyer’s Guide | The Lifting Lab',
    metaDescription:
      'A multivitamin is cheap insurance against dietary gaps, but quality and dosing vary hugely. Here is what to look for and the best-value UK options ranked.',
    intro:
      'A multivitamin is the supplement most people reach for first, on the logic that it covers all the bases at once. It can be useful insurance against dietary gaps, but it is no substitute for a varied diet, and the difference between a well-formulated multi and a cheap one is bigger than most buyers realise.',
    paras: [
      'A good multivitamin provides meaningful, well-absorbed amounts of the nutrients people commonly fall short on, rather than a long list of tiny doses there for show. Look for sensible levels of vitamin D, magnesium, zinc and the B vitamins, in absorbable forms, instead of an impressive-looking label where everything sits at a fraction of what is useful.',
      'More is not better. Quality multis avoid megadoses of fat-soluble vitamins (A, D, E, K) that can accumulate, and they keep minerals like iron out unless the product is specifically aimed at people who need it. A balanced formula that respects upper limits is safer and smarter than one chasing big numbers on the front of the tub.',
      'Form affects how much you actually absorb. Magnesium glycinate beats oxide, methylated or active B vitamins suit some people better, and chelated minerals are generally gentler on the stomach. A multi that uses cheap, poorly-absorbed forms can look complete on paper while delivering far less in practice.',
      'Think of a multivitamin as a backstop, not a strategy. It will not fix a poor diet, and targeted single supplements (like vitamin D or omega-3) are often the better spend if you know your gaps. Where a multi earns its place, our scores reward absorbable forms and sensible, fully-disclosed dosing over padded ingredient lists.',
    ],
    faqs: [
      { q: 'Are multivitamins worth taking?', a: 'They can be useful insurance against dietary gaps, but they are not a substitute for a varied diet. Targeted supplements for known gaps are often a better spend.' },
      { q: 'What should I look for in a multivitamin?', a: 'Meaningful, well-absorbed doses of commonly-short nutrients like vitamin D, magnesium, zinc and B vitamins, in good forms, without megadoses of fat-soluble vitamins.' },
      { q: 'Should a multivitamin contain iron?', a: 'Only if you specifically need it. Iron without a tested deficiency can build up and cause problems, so most general multis are better without it.' },
    ],
  },
  {
    slug: 'vitamin-d',
    h1: 'Vitamin D: The One Supplement Most Brits Should Consider',
    metaTitle: 'Best Vitamin D UK 2026 — Dosing and Buyer’s Guide | The Lifting Lab',
    metaDescription:
      'Vitamin D deficiency is common in the UK, especially in winter. Here is how much to take, why D3 and K2 pair well, and the best-value UK options ranked.',
    intro:
      'Vitamin D is the one supplement with a genuinely strong case for most people living in the UK. Our latitude means there is not enough sunlight from about October to March for the skin to make adequate vitamin D, and deficiency is common. It supports bone health, immune function and muscle, which is why public health bodies advise considering it over winter.',
    paras: [
      'The UK guidance is around 400iu (10 micrograms) a day as a minimum to maintain levels, but many people, particularly those with darker skin, limited sun exposure or who cover up, benefit from more. A common effective range is 1000–4000iu daily. Staying at or below 4000iu keeps you within the recognised safe upper limit for unsupervised use.',
      'Vitamin D3 (cholecalciferol) is the preferred form, as it raises blood levels more effectively than D2. Because vitamin D is fat-soluble, it is best taken with a meal containing some fat for absorption. A daily dose is more sensible than occasional large boluses for most people.',
      'Many products pair D3 with vitamin K2 (MK-7), and there is a reasonable rationale: K2 helps direct calcium into bone rather than soft tissue, so the two work well together. It is a sensible combination rather than an essential one, and a plain, well-dosed D3 is still an excellent buy.',
      'More is not automatically better, and very high doses without monitoring can cause problems by raising calcium too far. If you suspect significant deficiency, or want to go beyond the everyday range, a simple blood test guides the right dose. Our scores reward honest, well-dosed D3 (and sensible D3 plus K2) products over underdosed or overpriced ones.',
    ],
    faqs: [
      { q: 'How much vitamin D should I take?', a: 'At least 400iu daily to maintain levels, with many UK adults benefiting from 1000 to 4000iu, especially in winter. Staying at or below 4000iu keeps within the safe upper limit for unsupervised use.' },
      { q: 'Is D3 better than D2?', a: 'Yes. Vitamin D3 (cholecalciferol) raises and maintains blood levels more effectively than D2, so it is the preferred form.' },
      { q: 'Should vitamin D be taken with K2?', a: 'It is a sensible pairing, as K2 helps direct calcium into bone, but it is not essential. A well-dosed plain D3 is still very effective.' },
    ],
  },
  {
    slug: 'zma',
    h1: 'ZMA: Zinc, Magnesium and Sleep, Honestly Assessed',
    metaTitle: 'Best ZMA UK 2026 — Zinc Magnesium B6 Buyer’s Guide | The Lifting Lab',
    metaDescription:
      'ZMA combines zinc, magnesium and vitamin B6. Here is what the evidence really says about sleep and testosterone, sensible dosing, and the best UK options.',
    intro:
      'ZMA is a simple blend of zinc, magnesium and vitamin B6, marketed for sleep, recovery and testosterone. The honest read on the evidence is that it mainly helps by correcting deficiencies in two minerals that a lot of active people are short of, rather than acting as a hormonal booster in those who already have enough.',
    paras: [
      'Zinc and magnesium both play real roles in sleep quality, muscle function and, when you are deficient, testosterone production. Hard training and heavy sweating can deplete both, so an athlete running low may genuinely feel a benefit from topping them up. Someone whose diet already supplies enough is unlikely to notice much.',
      'The testosterone claims are where ZMA is oversold. Studies in people who are not deficient generally show no meaningful rise in testosterone. The takeaway is that ZMA helps restore normal function if you are short of zinc or magnesium, but it will not push a healthy man above his normal range.',
      'Where many people do report a benefit is sleep. Magnesium in particular is associated with more restful sleep, and taking ZMA before bed is the conventional approach. Forms matter: magnesium glycinate or citrate are better absorbed and gentler than oxide, and a sensible product avoids overdoing zinc, since too much over time can interfere with copper.',
      'Treat ZMA as a low-cost way to cover two commonly-short minerals plus B6, not as a hormone supplement. Take it away from calcium-rich foods, which can blunt absorption, and keep zinc within sensible limits. Our scores reward well-absorbed forms and honest, fully-disclosed dosing over proprietary blends and inflated claims.',
    ],
    faqs: [
      { q: 'Does ZMA boost testosterone?', a: 'Mainly only if you are deficient in zinc or magnesium. In people who already have enough, studies generally show no meaningful rise in testosterone.' },
      { q: 'Does ZMA help you sleep?', a: 'Many people find it does, largely thanks to magnesium. Taking it before bed in a well-absorbed form is the usual approach.' },
      { q: 'When should I take ZMA?', a: 'Typically before bed, and away from calcium-rich foods or dairy, which can reduce absorption of the zinc and magnesium.' },
    ],
  },
  {
    slug: 'gut-digestion',
    h1: 'Gut and Digestion Supplements: Probiotics, Enzymes and Fibre',
    metaTitle: 'Best Gut Health Supplements UK 2026 — Buyer’s Guide | The Lifting Lab',
    metaDescription:
      'Probiotics, digestive enzymes and fibre each do different jobs. Here is what actually helps your gut, how to read the labels, and the best UK options ranked.',
    intro:
      'Gut health is having a moment, and the supplement aisle has responded with probiotics, enzymes, prebiotic fibres and greens powders all promising better digestion. They are not interchangeable: each targets a different part of how your gut works, so the useful first step is matching the product to the actual problem.',
    paras: [
      'Probiotics provide live bacteria, and the evidence is strain-specific rather than general. A useful product names its strains and states the CFU count (often in the billions), because different strains help with different things, from antibiotic-related upset to IBS symptoms. A vague label that just says probiotic blend with no strains or count is hard to judge and easy to over-pay for.',
      'Digestive enzymes (such as protease, lipase and lactase) help break down protein, fat and lactose, and can be useful for people who struggle to digest certain foods or large protein intakes. They are a targeted tool rather than a daily essential for everyone. Lactase specifically helps the lactose-intolerant handle dairy.',
      'Prebiotic fibre, like inulin, feeds the good bacteria you already have and is often the cheapest, most underrated gut investment, provided you increase it gradually to avoid bloating. Most people simply do not eat enough fibre, so a prebiotic or just more plants in the diet often does more than an expensive probiotic.',
      'Be wary of greens powders and broad gut blends sold as cure-alls; they tend to under-dose the active ingredients and lean on marketing. Persistent gut symptoms deserve a proper look from a clinician rather than self-treatment, since they can signal something that needs diagnosis. Our scores reward strain-specific probiotics, transparent enzyme dosing and honest fibre products over vague blends.',
    ],
    faqs: [
      { q: 'Do probiotics actually work?', a: 'Benefits are strain-specific, so it depends on the strain and the issue. Choose a product that names its strains and states the CFU count rather than a vague probiotic blend.' },
      { q: 'Probiotics, enzymes or fibre — which do I need?', a: 'Probiotics add bacteria, enzymes help break down foods you struggle with, and prebiotic fibre feeds your existing gut bacteria. Match the product to your actual problem.' },
      { q: 'Are greens powders good for gut health?', a: 'They are often oversold and under-dosed. Eating more whole plants and fibre usually does more for your gut than an expensive greens blend.' },
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
