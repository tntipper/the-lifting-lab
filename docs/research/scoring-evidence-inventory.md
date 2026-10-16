# Supplement scoring evidence inventory — 23 September 2026

**Status: research queue, not assessment approval.** All 15 methodology groups
retain historical formula text, but none has a versioned, approved
product-level assessment dataset. The current site must continue to withhold
effectiveness rankings and automated product recommendations as described in
`unassessed-ranking-containment.md`.

The guide citation batches review editorial claims, not every scoring weight,
ingredient target, current formulation or manufacturer label. A source listed
below therefore does **not** approve the formula or a product score. The
historical generator in `scripts/_build-scores.mjs` depends on a Path A
`data.js` outside this repository; `lib/scores.ts` is a frozen output. The
original input rows and label provenance cannot be reconstructed reliably from
that output alone.

| Methodology key | Guide citation inventory | First question for scoring review |
| --- | --- | --- |
| `pre_workouts` | Batch A, pre-workout | Verify each dose target, weight, caffeine treatment, label unit and claims about ingredient forms against outcome-specific evidence. |
| `intra_workout` | Batch A, intra-workout | Establish the intended training outcome and support for 14 g EAAs, 35 g HBCD and the 50/30/20 weighting. |
| `post_workout` | Batch B, post-workout | Verify the 40 g protein/70 g carbohydrate targets and whether counting recovery ingredients predicts an outcome. |
| `eaas` | Batch A, EAAs | Separate the value of a complete EAA profile from the unsupported assumption that more grams or added hydration always improves an outcome. |
| `cycle_support` | Batch C, cycle-support | The `liver-health` catalogue category maps to this same formula. Do not treat the NAC/TUDCA/bergamot/CoQ10/DHA weights as organ protection during anabolic-steroid use in either category; review safety and claim suitability first. |
| `whey_normal` | Batch A, whey | Verify label protein yield, amino-spiking evidence and the price basis before approving purity/value weights. |
| `whey_isolate` | Batch A, whey-isolate | Verify isolate composition and label provenance; do not infer superiority from the 90% threshold alone. |
| `casein` | Batch B, casein | Verify protein identity/yield, label evidence and price before applying the generic purity/value score. |
| `creatine` | Batch A, creatine | Verify product identity, purity documentation and current price; review whether the Creapure flag warrants its fixed score difference. |
| `hydration` | Batch B, hydration | Tie sodium and other electrolyte targets to use context and safety; verify sugar and serving units. |
| `protein_bars` | Batch B, protein-bar | Treat protein-to-calorie and sugar/fat cutoffs as an editorial rubric until their consumer outcome and label basis are established. |
| `meal_replacement_rtd` | Batch B, meal-replacement | Verify composition/NRV rules, legal category and label data before using the 26/26 target and calorie band. |
| `vitamins_wellbeing` | Batch C, vitamin/multivitamin/vitamin-D | This formula also maps `vitamin-c`, `magnesium`, `omega-3`, `joint-health`, `heart-health` and `sleep-recovery`; those mapped categories lack corresponding scoring-target evidence in the cited guide batches. Split by nutrient, population and outcome; verify safety ceilings and form claims before a common score. |
| `hormone_support` | Batch C, hormone-support/ZMA | Do not infer a hormone benefit from ingredient dose or marker change; require population, outcome, safety and product-specific evidence. |
| `gut_digestion` | Batch B, gut-digestion | Separate probiotics, enzymes, fibre and ACV; verify strain, viable dose, enzyme activity and outcome rather than using generic count proxies. |

## Approval record required before any score can drive a recommendation

For each **specific formulation and revision**, record a stable product and
variant identity; manufacturer label or certificate with retrieval date and
serving units; every ingredient/form/dose actually scored; current price
basis if value is part of the formula; a frozen formula version/hash; the
intended claim, population and outcome; primary evidence with limitations;
uncertainty and safety review; reviewer identity, decision and expiry or review
date. Missing fields remain `PENDING`, never inherited from a similar product.
An explicit approval must bind all those records to the exact score revision.

The next research work should begin with `cycle_support`, `hormone_support`
and `gut_digestion`, where the gap between a numerical score and a defensible
outcome claim is greatest. Then address the remaining 12 groups and acquire
the original Path A inputs or fresh manufacturer labels. Only after the
product-level evidence and formula have been independently reviewed should a
new approval dataset be designed. Until then, the current containment rule is
the correct release behavior.
