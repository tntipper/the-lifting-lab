# Assessment approval and recommendation containment

This is an implementation hold, not scientific approval. It supersedes the earlier interim rule that allowed positive frozen scores into rankings. **No approved product assessment dataset exists, so no historical score may drive an effectiveness recommendation.** The original score and methodology source records remain intact.

## Separate history from approval

`assessmentDisplayFor` classifies whether a historical value exists but withholds its number from the public projection; it does not grant recommendation eligibility. `hasApprovedAssessment` currently returns false for every input. Positive scores, categories and caller-provided `approved` or status/version properties cannot bypass it. A future reviewed projection must replace this gate with authoritative formulation, label, methodology, evidence, uncertainty and review approval bindings; it must not add a legacy fallback.

| Input | Public assessment state | Effectiveness recommendation |
| --- | --- | --- |
| Missing, null, zero, negative, nonfinite or greater-than-100 value | Not assessed | Unavailable |
| Cycle-support, liver-health, hormone-support or ZMA | Under review; frozen number withheld | Unavailable |
| Positive finite value up to 100 outside those holds | Not assessed; frozen number withheld | Unavailable |
| Caller-provided approval/status/version | Does not change authority | Unavailable |

Historical values remain in the frozen source, but the reviewed public displays and named JSON projections do not present them as customer-facing numbers, coloured quality rings or grades. Some server-rendered page data and bundled client code still contain frozen values; they are not a secret-data boundary and must not be described as such. Account stacks report that no approved average exists; no combined-stack assessment is claimed and no product is selected or endorsed. Share, export and email-to-self text retain the same display restrictions and canonical server lookup.

## Public behavior

- Catalogue score/value sorts use alphabetical research order. No medals, top-pick badges, effectiveness value awards, dose flags or category-benefit pitches are issued for historical values. Name and brand sorting stay available.
- `/best` and known `/best/[category]` routes remain research pages with an honest ranking-unavailable notice. All known categories remain discoverable in the sitemap; missing assessments do not become a 404. Product records remain available even where listed price or assessment data is missing.
- Product/brand comparison and alternatives routes preserve records independently of assessment eligibility. Alternative discovery is alphabetical, not a scientific replacement ranking. Brand score aggregates and winner claims are unavailable. Product-detail editorial rating schema is withheld; ordinary customer-review data remains separate.
- Guide and ingredient pages preserve underlying research, labels, citations and cautions while withholding product picks. Goal research pages remain available; wizard and static goal-stack selection return no automatic products, including for unlimited budgets. The manual stack, favourite and compare controls, F09 retry/outbox behavior, serving resolution, accessible dialogs and existing offer holds remain intact.
- Generated metadata, structured data, social images, methodology explanations and affected scoring-related links state the same limitations. The methodology still exposes historical formula rows/weights for inspection, without “perfect dose”, traffic-light quality or winner claims. This does not re-audit unrelated ingredient articles or create replacement scientific ratings.
- `/api/ard/compare` returns `rank: null`, `score: null` and `recommendation_status: "unavailable"` for every result. `assessment_state` describes legacy availability or review, not approval. Score/value orders are alphabetical; budget order is price-only. OpenAPI documents these exact semantics. `/api/products` retains its array response, now with `score: null`, and adds the explicit historical state/note and unavailable recommendation status. Detail, compare, favourites and stack assessment API projections also withhold frozen numbers.

## Retained numerical comparisons

Price-only ordering uses a finite positive recorded retail price and known positive serving count, independently of historical score. The unrounded ratio is retained for ordering and API data; presentation rounds only at the display boundary, with subpenny amounts shown as `<£0.01`. Missing, zero, negative, nonfinite or malformed inputs are excluded from this calculation. Protein price-per-gram additionally requires an explicit gram serving unit, valid recorded protein yield, and usable pack data.

These are **listed-price calculations**, not prices for an established effective dose. Formulas, category serving sizes and catalogue mixes may differ. Delivery, discounts and checkout adjustments are excluded; no retailer offer is approved by the calculation. The shop's margin/delivery policy is separate.

Caffeine comparison is recorded mass ordering, not a recommendation to take more. Ties use names, never historical scores. Only finite nonnegative amounts in explicit mg, g, µg, μg or mcg units are converted; unknown units and invalid amounts cannot silently become milligrams or grams. Raw catalogue rows remain elsewhere. Existing explicit caffeine and stack nutrient cautions are preserved. This is dimensional validation, not a new safety-reference or label-provenance approval.

## Acceptance and release limits

The actual TS/TSX unit fixture covers positive historical, held, unknown and forged-approval inputs across shared cards/detail/compare, awards/selectors, known category/alternative/vs/brand routes, every goal route, API/OpenAPI, methodology/glossary, metadata/JSON-LD and social cards. It also proves neutral price ordering for rounded ties and subpenny costs, malformed price/serving/protein inputs and explicit caffeine-unit conversion. No outbound requests are allowed in the fixture.

The actual React/Tailwind browser harness runs at 320, 390, 768, 1024, 1280 and 1440 pixels in a fresh headless browser. It checks all catalogue sorts, legacy/held/unknown states without badges, own-shop holds and overflow. Wizard tests preserve keyboard step focus and budget control behavior but now assert no unapproved products or automatic add action at either finite or unlimited budgets. Existing manual-stack outbox, share/focus/status and offer fixtures remain included. The former wizard product-recommendation acceptance is deliberately replaced by unavailable-state acceptance; it cannot be claimed as a valid recommended pack journey.

Full type, lint and unit checks plus the real Next build/runtime fixture run locally with synthetic inputs. The build fixture blocks all external connections and verifies synthetic-preview containment after conflicting runtime settings. It does not prove hosted deployment acceptance. Public consumers must support null ranks before release. Production cache invalidation, hosted user journeys, Safari/iOS and assistive-technology certification remain separate release work.

The installed Next 15.5.25 package lacks `node_modules/next/dist/docs`; the existing documented official Next 15 fallback applies. No production environment, customer, email, shop order or hosted schema is changed by this patch.
