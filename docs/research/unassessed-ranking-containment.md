# Unassessed product ranking containment

This is an interim presentation and selection repair. It does **not** approve the frozen percentage scores, validate category science, reconstruct the missing score-source dataset, or close the full evidence audit.

## Shared rule

`lib/assessment-display.ts` is the single interim gate used by these consumers:

| Input | Visible state | Ranking / dose recommendation |
| --- | --- | --- |
| Missing, null, zero, negative, nonfinite or greater-than-100 score | Not assessed | Withheld |
| Cycle-support, liver-health, hormone-support or ZMA category | Under review; a positive finite historical value remains inspectable | Withheld regardless of value |
| Finite historical score greater than zero and no current category hold | Legacy score | Existing ranking behavior retained, without scientific approval |
| Invalid, missing, nonfinite or nonpositive per-serving cost | Assessment status unchanged | Value / budget award withheld |
| Name, brand or raw price sorting | Assessment status unchanged | No ordinal medals or top-pick badge |

Zero is deliberately held: the current data contract has no approved assessment version that can distinguish a completed zero assessment from missing evidence. No source score is rewritten. Do not change the interim check to `score != null` or treat `legacy` as `approved`.

## Consumers changed

- Catalogue cards: preserve all research records, favourite/compare/manual-stack actions, label amounts and offer holds. Only eligible ranking sorts can show medals or a top-pick treatment. Unknown cards have no category-benefit or dose verdict. Alphabetical sorts never imply a winner.
- Comparison table and `/vs`: exclude held/unknown values from winners and value verdicts while retaining the product columns.
- `/best`, category awards, guide and ingredient picks, value and cheapest pages, alternatives, brand comparisons, static stack selection and wizard: apply the same gate when choosing products. Ranking-only pages can remain unavailable when their existing minimum field size is not met; the main catalogue and product record remain available.
- Related cards: neutral research wording when there is no assessed upgrade; no fabricated score delta. Favourite, brand and other product cards reuse the same status component.
- Brand summaries and homepage category statistics: exclude held/unknown values from score aggregates; count all research records as listed, not ranked. The complete brand catalogue is an unordered structured list, not a ranking that assigns held products a place.
- Product detail: no formula/dose endorsement or nutrient traffic-light verdict for unassessed or held records. Raw label amounts, customer reviews and existing explicit safety-warning flags are preserved. Detail metadata and editorial rating schema do not invent a zero/missing assessment; the social card labels the assessment state.
- Public comparison API: `rank` is nullable; `assessment_state` and `assessment_note` are explicit. Historical held values are distinguishable from a recommendation. OpenAPI documents this contract. Existing retailer resolution, own-shop holds and preview isolation are unchanged.

## Verification

`npm test` executes real TypeScript/TSX components and selectors with in-memory catalogue rows. Tests cover every current category hold, missing/zero/invalid scores, finite historical display, invalid cost, mixed ordering, awards, guide/ingredient/value/cheapest selections, alternatives, matchups, stacks, brand summaries, related cards, API/schema, detail metadata and social status. Existing claim-safety tests still assert that the explicit high-caffeine warning is preserved.

`TEST_BROWSER_CHANNEL=chrome npm run test:accessibility` runs the existing actual React/Tailwind fixture in a fresh headless profile. At 320, 390, 768, 1024, 1280 and 1440 pixels it checks both mixed and entirely unassessed catalogues through score → name → brand → value → budget → score changes, research visibility, medal and top-pick exclusion, positive historical behavior, long names, horizontal overflow, and preserved own-shop holds. Existing navigation, dialog, wizard and offer checks remain included. All responses are local synthetic fixtures; no purchase, customer, email or live provider operation occurs.

The repository requests bundled Next documentation, but the installed Next 15.5.25 package has no `dist/docs` directory. The implementation follows the official [Next 15 client-component boundary documentation](https://nextjs.org/docs/15/app/api-reference/directives/use-client). Provider and router adapters are confined to tests.

## Remaining acceptance and limits

This gate is **not a verified evidence projection**. Positive historical scores can still lack label provenance or sufficient supporting science; preserving those legacy values does not certify them. The future approved projection must bind product/formulation/label identity, methodology version, source evidence, uncertainty, review owner and approval status, and then replace legacy numbers and inherited dose language across every surface, including account stack aggregates, exported share cards, search metadata and Shopify. This patch does not alter editorial category articles, frozen coefficients or create new clinical recommendations.

The browser fixture proves these component behaviors, not hosted deployment acceptance, Safari/iOS behavior or screen-reader certification. Production cache invalidation and release acceptance remain part of orchestration. Public API consumers must handle `rank: null` before release.
