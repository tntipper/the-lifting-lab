# Interim claims containment

Implemented 15 September 2026. This is a limited editorial risk reduction, not a systematic review, a new scoring model or scientific sign-off. Existing stored product scores and scoring coefficients are unchanged.

## Public behaviour

- `/testosterone` temporarily presents evidence limitations and clinical-assessment information. Its ingredient verdict board and purchase funnel are withheld. Visible questions, FAQ JSON-LD, metadata and social preview convey the same status.
- Cycle-support/liver-health and hormone-support/ZMA display an interim notice in product browse cards, product details, the scoring modal and the methodology page. Catalogue winner badges and product-detail recommendations are withheld for those categories. Historical methodology weights remain visible as **legacy weights under review**, without protective-dose or reliable hormone-benefit endorsements.
- The cycle-support, hormone-support and ZMA guides withdraw product recommendations and ranked ItemList data while claims are reviewed. Their text, FAQ, metadata and social cards match. The revised pages do not claim a completed clinical review date.
- For these four product categories, metadata no longer calls scores EFSA-backed, and editorial score Review JSON-LD is withheld. Product identity, genuine public customer reviews and the existing score in the page remain available. Product social cards display the same review status instead of an EFSA-backed claim.
- Catalogue vitamin-D/ZMA subheads and inbound testosterone teasers no longer promise hormone benefits. The men-over-40 stack excludes hormone-support recommendations and no longer promises hormonal restoration from correcting nutrient shortfalls.
- Existing medical cautions remain, including explicit high-caffeine warnings. Neither supplements nor monitoring are presented as making non-medical steroid use safe.

## Sources supporting the replacement statements

Official pages checked on 15 September 2026; the dates below describe the source, not a new clinical review by TLL. None validates TLL's coefficients or a specific commercial product.

| Statement supported | Source | Scope and limit |
| --- | --- | --- |
| Anabolic steroid misuse carries serious cardiovascular, liver and other risks; seek help about use and stopping safely. | [NHS: anabolic steroid misuse](https://www.nhs.uk/conditions/anabolic-steroid-misuse/) (reviewed January 2026) | Risk information; does not endorse a cycle-support formula or a monitoring protocol that makes misuse safe. |
| Milk-thistle trials for liver disease are conflicting or too limited for conclusions. | [NCCIH: milk thistle](https://www.nccih.nih.gov/health/milk-thistle) (updated February 2025) | Does not establish prevention of steroid-related harm. The page no longer extrapolates disease-treatment evidence into an organ-protection promise. |
| Ashwagandha testosterone evidence is limited, with small studies and differing preparations; long-term safety is uncertain, with rare liver injury and potential interactions. | [NCCIH: ashwagandha](https://www.nccih.nih.gov/health/ashwagandha) (updated March 2023) | Some findings may be positive; this does not validate every extract, healthy-user benefit, dose threshold or composite hormone grade. |
| Diagnosis in men requires compatible symptoms/signs and consistently low testosterone, confirmed by repeat morning fasting testing, with investigation of the cause. | [Endocrine Society guideline](https://www.endocrine.org/clinical-practice-guidelines/testosterone-therapy) (2018) | Clinical diagnostic guidance, not an invitation to routine self-testing or a supplement recommendation. |

The decision to pause recommendations is TLL's interim editorial response to missing claim-to-evidence validation; it is not a claim that every ingredient is ineffective.

## Remaining work before recommendations return

1. **Research lead:** produce a claim register for each ingredient, extract, outcome and population. Record primary human studies, comparator, dose, duration, effect size and uncertainty, baseline status, funding, adverse events, interactions and date checked. Separate a biomarker change from a demonstrated health or performance benefit.
2. **Research lead and scoring engineer:** reconcile the actual score-generating code, source dataset, current label/formulation versions and displayed weights. Review the TUDCA absence flag, inherited liver-health model, composite hormone score and ZMA mapping. Do not treat a manufacturer's ingredient name or a threshold crossing as evidence of benefit. Recompute only after a versioned methodology is approved.
3. **Product and engineering:** coordinate any scoring changes across catalogue/detail, `/best`, comparisons, ingredient pages, stacks/wizard, exports/API, social cards and Shopify. Those remaining surfaces and the frozen datasets are not comprehensively revalidated by this patch. Existing rankings, numeric scores and colour thresholds elsewhere remain review work; this patch must not be described as closing the entire scoring audit.
4. **Claims reviewer:** check proposed wording against the relevant market's permitted claims and safety requirements, including shop product pages, search metadata, ads, email, recommendations and commercial conflicts. Keep promotional claims separate from educational discussion.
5. **Release owner:** require recorded research and claims approval for each restored recommendation. Publish methodology version, source links, limitations and review date, then invalidate affected site/social caches. The legacy `lib/testosterone.ts` data and unused board must not be reconnected as a shortcut to that review.

## Verification and deployment boundary

`node --experimental-strip-types --test tests/claims-containment.test.mjs` runs nine network-free tests using actual TSX rendered with React and synthetic catalogue data. They check page/FAQ/metadata alignment, honest guide/product structured data, catalogue cards, unchanged unaffected categories, and preservation of an explicit safety warning. Image adapters are checked for their rendered content; this suite is not browser or pixel-level visual QA.

The claims suite plus the JSON serializer and share-card suites passes 25 tests. TypeScript `--noEmit --incremental false` also passes using the local dependency installation. No production database, Shopify, purchase, email or external posting action is part of this change. Preview integration and controlled publication/cache refresh belong to the parent release workflow.
