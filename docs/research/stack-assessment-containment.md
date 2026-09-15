# Stack and sharing assessment containment

This extends the [unassessed ranking containment](unassessed-ranking-containment.md) to personal research stacks and share content. It does not approve historical scores, validate the nutrient dataset or establish a recommended combined dose.

## Authority and inclusion

`lib/stack-assessment.ts` uses the existing `assessmentDisplayFor` gate. Catalogue identity is resolved before the frozen `scoreFor` lookup; a score saved in browser storage, an account payload or a request is not authoritative.

- Only positive finite historical scores outside the existing category holds contribute to a historical average. Each product contributes once; servings do not weight the average.
- Held, missing, zero and invalid scores remain explicit. The average states how many products were included out of the complete membership count. Unavailable products and unresolved serving records remain excluded from the account aggregate.
- A held positive value can remain inspectable as a historical value alongside `Under review`. It does not become a dosing or benefit recommendation.
- Every average states that it is not a combined-stack assessment, that scientific review is incomplete, and that no effectiveness recommendation is made. Historical averages and individual values use neutral presentation; they never grant the separate approval gate. An entirely excluded stack has no numeric average.

## Public surfaces

| Surface | Behavior |
| --- | --- |
| Account and guest full stack | Shared assessment component on product rows/search; historical average with explicit inclusion and exclusion counts. Existing membership, retry, disabled controls and unresolved-serving notice are preserved. |
| Floating stack panel | Resolves saved IDs through the read-only catalogue endpoint. Stored scores are ignored. Loading, failed or superseded lookups cannot display a previous score as current. |
| Email-to-self link and native/social share text | Includes the same historical coverage and individual assessment states. The email action is still a `mailto:` link, not a server email sender. |
| Stack image/export | Accepts bounded IDs only; loads active catalogue identities and scores on the server. Labels historical, held and unassessed records explicitly; no quality grade or combined score is generated. |
| Product share modal | Accepts an ID, loads the canonical name/category/assessment and labels its state. It no longer accepts a score prop. Failed lookups provide no score or benefit recommendation. Existing claim focus and live status handling remain intact. |
| Share reward POST | Accepts only a product ID. Extra caller-authored score, caption or name fields are rejected before a reward is attempted. |

The new `GET /api/stack/assessments` shares the active-record resolver with image routes. It accepts up to 50 UUIDs per request, rejects arbitrary content, returns only public identity fields and the historical score, and uses `no-store`/`noindex`. The client caps a selection at 100 unique IDs, batches requests, validates response membership/types, aborts on cancellation and times out. Failure is explicit; there is no browser-score fallback. Synthetic-preview middleware continues to contain this API with HTTP 503.

## Nutrient records and safety alerts

Raw amounts, serving multiplication, reference-intake percentages and upper-limit calculations are unchanged. Existing explicit nutrient safety alerts retain their red/amber treatment. Reference-intake coverage is presented neutrally instead of as a target achieved: a label-derived percentage does not establish an effective or recommended dose, even for a legacy record. This change does not validate the underlying reference values, unit handling or label provenance.

## Verification and limits

The unit fixtures execute the actual projection, server adapter, route handlers and image component trees with synthetic data. They cover mixed and entirely excluded averages, all held categories, zero/missing/nonfinite values, duplicate products, caller-supplied scores, active-record lookup, malformed/unknown IDs and upstream failure.

The six-width browser fixture runs actual React/Tailwind components with an isolated synthetic authenticated account. It checks a mixed five-product stack, unresolved-serving exclusion, preserved Vitamin B6 alert/raw amount/upper-limit styling, historical coverage, generated email/social text, IDs-only image URLs, floating-panel failed fetch behavior and dialog focus. Product-share fixtures check held, zero, missing and historical captions alongside existing busy/success/no-points/error focus and live-status behavior. The fixture's auth subscription adapter is test-only. No email, social publication, order or customer operation is performed.

Production release acceptance, live account tests, Safari/iOS and assistive-technology certification remain separate. Authenticated-addition reload durability is covered by the separate [F09 addition outbox and its acceptance limits](../ops/stack-addition-outbox.md). Historical science/provenance remains unapproved, and the future reviewed assessment projection must replace the interim gate across these consumers.
