# Assessment approval and recommendation containment

`data/reviewed-assessments.json` is the reviewed-assessment register. It starts empty (`[]`), so no product currently has an approved score or qualifies for effectiveness rankings. Historical formula scores remain research inputs and cannot grant approval. Commercial eligibility, supplier mappings and caller-provided approval flags cannot grant scientific approval either.

## Assay and Oath sign-off

1. Assay reviews the exact catalogue product, formulation and label against the evidence and scoring methodology. Assay determines the score and records the scientific review date. Use the catalogue product **id** as `key`, never its name, brand, SKU or Shopify variant id.
2. Oath reviews the proposed score and public claims, warnings and limitations against the same product and evidence. Oath records the compliance review date only after signing off. A science review alone cannot release a score.
3. After both reviews, add one record for that product id. In `notes`, reference the reviewed label/formulation, methodology, evidence and any limitations so the decision can be checked. These records are bundled with public code: include no secrets, private costs or personal data.
4. Review the change and run the assessment tests, lint and TypeScript checks before release. A register edit takes effect when the application is rebuilt and deployed through the normal release process; editing it is not a live publication action. No real approvals are seeded by this implementation.
5. Reassess after material formulation, label, evidence or methodology changes. Remove the record while a previous sign-off is no longer applicable. Removing a record withholds its public score and ranking eligibility again.

Record format (illustration only; do not copy this into the empty register as an approval):

```json
[
  {
    "key": "catalogue-product-id",
    "score": 73,
    "science_reviewer": "Assay",
    "science_date": "2026-10-15",
    "compliance_reviewer": "Oath",
    "compliance_date": "2026-10-16",
    "notes": "References to the label/formulation, methodology and evidence reviewed, with limitations."
  }
]
```

The module validates the parsed JSON shape once at load. The top level must be an array. Each usable record needs a nonblank string key, finite numeric score from 1 to 100 inclusive, exactly `Assay` and `Oath` as reviewers, both real calendar dates in `YYYY-MM-DD` format, and string notes. Invalid records are ignored; an invalid top-level shape provides no approvals. JSON syntax must be valid for the build. Keep one record per product key; if valid duplicates are accidentally supplied, the last valid record is used.

## Display and ranking rules

| Condition | Public assessment | Ranking eligibility |
| --- | --- | --- |
| No matching valid record, including incomplete sign-off | Under review; outline ring with no number | Unavailable |
| Valid record with both sign-offs | The record's score, regardless of any historical or caller-provided score | Available for score ranking; value/budget awards also require positive serving cost |
| Cycle-support, liver-health, hormone-support or ZMA category hold | Under review; no score, even with a signed record | Unavailable |

`assessmentDisplayFor` and `hasApprovedAssessment` resolve by product id from this register. Category claims-review holds take precedence. Product ids travel through badge, comparison, stack and related-product callers. Shared score attachment and sorting use the reviewed value for approved records. API scores are the same reviewed projection; rank is nullable, and OpenAPI describes approved and under-review states. Existing purchase/offer gates and the separate unavailable recommendation status remain unchanged.

With the register empty, score/value ordering falls back to alphabetical research order. Product records, labels, citations, cautions, manual stack editing, favourites and comparison remain available. No historic score can issue medals, effectiveness awards or automatic product selections. Existing stack summary and social-card containment remains conservative; this change does not create a combined-stack assessment.

## Retained numerical comparisons

Price-only ordering uses finite positive listed prices and known positive serving counts independently of assessment approval. Ratios remain unrounded until presentation, including `<£0.01` for subpenny costs. Protein price per gram requires an explicit gram serving unit and usable protein yield and pack data. These are listed-price calculations, excluding delivery, discounts and checkout adjustments; they do not establish effective doses or approve an offer.

Caffeine comparison remains recorded mass ordering, not a recommendation to take more. Explicit supported units and finite nonnegative amounts are required; unknown units are not silently converted. Existing caffeine and stack cautions remain in place.

## Verification and release limits

Network-free TS/TSX fixtures cover the empty register, complete sign-offs, record score precedence, ranking eligibility, missing/wrong reviewers and dates, impossible calendar dates, malformed shapes, invalid scores and category holds. They also cover existing research displays, selectors and API containment. Synthetic signed records are injected only in memory; the real register stays empty.

Local test, type and lint results are recorded in `.agent/HANDOVER.md`. Local checks do not establish hosted CI, deployment acceptance, production cache invalidation, browser journeys or assistive-technology certification. No production environment, shop order, customer data or hosted schema is changed by this mechanism.
