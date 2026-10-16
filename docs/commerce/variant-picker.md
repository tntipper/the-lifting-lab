# One product page, selected Shopify variant

Toby's decision: `/products/[id]` is the sole TLL page for a product family. Flavour
and pack choices belong to that page. No child routes or catalogue merges are
created by this change. Branch `grok/i-flavour-picker`, baseline `acd617f` (the
local `codex/tll-integration` ref is unavailable); no remote PR read was made
under the no-live-services constraint.

## Public model and purchase behaviour

The existing service-role RPC supplies saved mapping evidence. The loader projects
`storeVariants: StoreVariantOption[]` with numeric string `variantId`, `handle`,
`label`, `flavour`, `packLabel`, and whitelisted `mapping`. Labels combine saved
flavour text and reviewed pack size; grams of 1,000 or more display as kilograms,
and multipacks retain the inner count. No supplier identifiers, costs, raw row,
or private approval reference reaches the client.

Invalid, inactive, unapproved and expired rows are excluded individually. Repeated
canonical variant IDs among active store rows exclude that variant, including
across comparison products returned by the reader. Other variants survive. Cached
choices and product-level observations are replaced on mapping refresh.
`storeLinkMapping` is populated only when exactly one valid choice remains.

With LINKS and PRICES enabled, the existing bounded Storefront reader requests all
approved variant IDs and attaches `storePrice` to each option. GBP price and stock
must be from that exact ID, positive, neither future-dated nor 15 minutes old.
Missing or failed observations are unavailable. With PRICES enabled, family grids
have no selected pack and show no arbitrary variant price or legacy retail-price
substitute. With PRICES off, price enrichment returns the input unchanged: legacy
`retail_price` remains on grids and product pages; it is not a current Shopify price.
Existing catalogue purchase holds remain authoritative.

The picker defaults to the first fresh in-stock choice, otherwise the first valid
choice in saved-reader order. A native select has a visible `Flavour / size` label,
unique id/htmlFor association and an aria-describedby live price/stock status.
The chosen mapping and observation alone drive `Buy at TLL Store`. Fresh in-stock
choices use `/cart/{numericId}:1` with existing attribution. Out-of-stock or
unavailable choices have status text and no Buy link, including no affiliate
fallback. With PRICES off, the chosen offer goes to the Shopify product page
`/products/{handle}?variant={numericId}`, retaining attribution. Isolated
environments and disabled LINKS remain inert.

The product page updates its visible price with the selection. For multiple packs,
catalogue serving counts cannot establish the selected pack's servings, so it
suppresses the calculated serving price. Single-choice serving-price behaviour
remains compatible. Grid and stack items with several choices link to
`Choose flavour on product page`; no arbitrary variant enters the stack cart.

## URL contract

`/products/{parentId}?variant={numericId}` selects only a known option on that
product. IDs stay strings (including IDs beyond JavaScript's safe integer range).
An unknown ID is ignored. `?flavour={slug}` can select a matching saved flavour;
slugs lowercase the text and replace non-alphanumeric runs with hyphens. A known
variant ID takes precedence over flavour. If several sizes share a flavour, its
first saved option wins; numeric variant links are the unambiguous contract.

The server chooses `defaultVariantId` once (first fresh in-stock, else first).
The client uses that exact ID for hydration, then reads `window.location.search`
once after mount to apply a known variant/flavour override. Unknown queries keep
the server default. Manual changes update state and use
`window.history.replaceState(null, '', url)`, preserving unrelated parameters/hash
and removing the flavour alias. No server navigation or prop-reset effect occurs.
The server page never reads `searchParams`; with store links off it retains daily
ISR (`revalidate = 86400`). Store loaders retain their existing dynamic behaviour
when enabled; the picker does not add a request-time dependency.

A single variant displays its label as text; multiple variants render the select.
The picker honours catalogue holds and is the Buy area's sole live region.
Unavailable selections have no Buy or affiliate fallback, and plain out-of-stock
selections say “Out of stock: choose another flavour/size”, not “under review”.
Multi-variant grids show “Choose flavour on product page”; single-variant grids
retain existing direct-offer behaviour. The stack batch API does not attach
variants yet; this change does not establish variant selection for batch-loaded stacks.

## Redirect review process

Per-flavour pages are DELETED, not redirected (Toby, 13 Oct 2026). There is no redirect map or middleware redirect. Each product has one page; its flavour/size options are the saved per-variant mappings for that product id, selected with `?variant=` or `?flavour=`. To merge a duplicate catalogue row, point its variant mapping rows at the parent product id, then delete the duplicate row (data change, reviewed separately). See docs/commerce/catalogue-duplicates.md for the live duplicates awaiting Toby's decision.

Candidate source: `docs/research/data/supabase-products-2026-09-25.csv`.
There are four groups when brand/name comparison ignores case (eight rows,
four additional records); three groups match case exactly. No merges are guessed.

| Brand / name | Candidate IDs | Recorded distinction to review |
| --- | --- | --- |
| Warrior / Creatine Monohydrate | `0b2a6a88-ceaf-4c02-ad40-715d06691118`; `7f5f3751-0e82-463b-8554-6d82cf487eba` | Both 5 g, 100 servings; duplicate or distinct pack/flavour unconfirmed |
| Warrior / Crunch Bar (White Chocolate Crisp) | `1fab2546-6a25-4fd9-8e49-abf6bb6b362c`; `8ddfc493-0872-4235-ba25-5091ef172b49` | 64 g × 12 servings versus 64 bar × 1 serving; recorded units/counts conflict |
| Strom Sports Nutrition / EssentialMax / EssentialMAX | `2567a955-be92-4f70-b147-f908fa80650c`; `60cbe489-96a8-416e-a11b-243e3277caf3` | EAA / 13 scoop versus intra-workout / 15 scoop, both 30 servings; case differs |
| Warrior / Whey Protein | `b9058eef-f71a-49f7-9672-a264d1a09614`; `e94b13c4-f7fa-42d2-94b2-8dfcda316311` | 30 g / 16 servings versus 25 scoop / 40 servings; packs/flavours unconfirmed |

## Verification

`tests/variant-picker.test.mjs` contains 30 offline cases covering mapping/duplicate
isolation, public labels, exact per-variant prices, stock-aware server defaults,
hydration and mount queries, OOS/unavailable Buy areas, catalogue holds, single-
and multi-variant grids, and that no redirect mechanism exists. A behaviour test invokes
the native select change handler, rerenders the detail component, and checks B's
Buy href and `?variant=B` while rejecting any router navigation. The source
contract explicitly rejects any `searchParams` read in `page.tsx`.
`tests/preview-mode.test.mjs` also executes middleware's query-preserving 308
redirect and keeps its existing preview/API assertions.
All transports are synthetic; no live service was contacted by tests.

The existing mapping-loader test labelled `duplicates` intentionally changes to
`duplicate variant id`: distinct variants now remain choices rather than poisoning
the product. Same-ID duplication still fails closed. No other existing expectations
are loosened. Existing price/offer/assessment/stack tests retain their assertions.
The `/offers` offline accessibility fixture exercises a two-option native picker
and real mapped Buy link using only synthetic flags and observations. Its browser
check verifies label association, keyboard ArrowDown selection, B’s Buy href and
URL sync. Existing CI runs it through `npm run test:accessibility`; no deployment
environment values were changed.

Final checks and environment limits are recorded below after the full suite.

Local evidence, 13 October 2026:

| Check | Result |
| --- | --- |
| Focused Node suite (variant-picker, mapping-loader, offer-routing, storefront-prices, stack-cart, assessment-display) | 266 passed, 0 failed; includes 30 picker cases and preview middleware tests |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed: 0 errors, 22 existing warnings |
| Activation manifest | `--check` passed; no further regeneration needed for this review revision |
| Hosted-baseline manifest | `--check` passed; file unchanged |
| `npm test` | 4,062 tests: 4,026 passed, 28 failed, 8 skipped |
| `npm run test:accessibility` | Fixture compiled; blocked at loopback listen with `EPERM` before browser launch |
| `git diff --check` | Passed |
| Hosted CI / real Shopify / Supabase | Not run; no live commerce service calls |

Full-suite limits match the previous handover's categories. No assertions or
execution gates were relaxed:

| Blocked category | Count | Evidence / affected tests |
| --- | --- | --- |
| Loopback listen | 8 | `listen EPERM 127.0.0.1`: auth-flow, local-supabase-relay (5), Gen23 checkout-observer (2) |
| Process control | 6 | `/bin/ps EPERM` or fixture startup `EPERM`: Gen22 process-binding, provider recovery, REST-worker and rotation tests |
| Docker fixtures | 11 | Docker socket permission denial: Gen23 final PostgreSQL (1), successor database acceptance (2), default qualification (7), native control acceptance (1) |
| Gen23 whole-process child | 1 | Expected `EXITED`, observed `KILLED` in networkless whole-process fixture |
| Python helper | 1 | Host `confstr()` / `DARWIN_USER_TEMP_DIR` warning fails the strict helper error predicate |
| Chrome launch | 1 | Browser-origin contract: Chrome exited `SIGABRT`, cleanup kill `EPERM` |

Logs: `/tmp/i-review-affected.log`, `/tmp/i-review-type.log`, `/tmp/i-review-lint.log`,
`/tmp/i-review-full.log`, `/tmp/i-review-browser.log`. Both manifest checks returned zero
and no output (review revision; no manifest content changes).

A timing issue found during implementation is fixed: validate returned observation
age after the async read, so a request started milliseconds later than enrichment
is not incorrectly classified as future-dated. The injected test clock is also
shared with its synthetic reader. Future/stale observations still fail closed.

## Changed files for Grok's review

- Public model/projection: `lib/products.ts`, `lib/commerce/product-mapping.ts`, `lib/commerce/store-mapping-server.ts`.
- Prices: `lib/commerce/store-price-products.ts`, `lib/commerce/store-price-server.ts` (existing Storefront adapter reused unchanged).
- Selection/route: `lib/commerce/variant-selection.ts`, `components/ProductVariantPicker.tsx`, `app/products/[id]/page.tsx`, `app/products/[id]/ProductDetailPage.tsx`, `middleware.ts`.
- Grid/stack purchase presentation: `components/ProductOfferLink.tsx`, `lib/commerce/stack-cart.ts`, `components/BuyMyStack.tsx`, `app/stack/StackBuilder.tsx`.
- Tests: `tests/variant-picker.test.mjs`, `tests/store-mapping-loader.test.mjs`, `tests/browser/accessibility-fixture.tsx`, `tests/browser/accessibility.mjs`, `tests/browser/offers.mjs`, `tests/preview-mode.test.mjs`.
- Evidence: `config/staging-account-activation-manifest.json`, this document and the prepended `.agent/HANDOVER.md` note.

Everything remains committed (be3b6da + review-nit fixes) for Grok. No push, production env/config changes,
migration execution, service activation or `.xlsx` edit. Toby still needs to
confirm any parent/child redirects; authorised browser/hosted runners must provide
the unavailable interaction and CI evidence.
