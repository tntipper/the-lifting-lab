# Buy → Shopify cart (Job B)

FACT: Toby selected direct-to-cart as the single-item Buy default. `DEFAULT_STORE_BUY_LINK_MODE` in `lib/affiliate.ts` is now `cart`; `ProductOfferLink` already consumes it. No configuration or flag values were changed.

## Existing switches and behaviour

| Path | Existing switch | Enabled behaviour | Absent/OFF behaviour |
| --- | --- | --- | --- |
| Single Buy | `NEXT_PUBLIC_TLL_STORE_LINKS=enabled` | Approved, current, product-bound mappings with confirmed fresh in-stock evidence link to `/cart/{variantId}:1`. | Existing affiliate/listing/unavailable rendering. |
| Buy my stack | `NEXT_PUBLIC_TLL_STACK_CART=enabled` | Existing guest cart permalink includes approved store variants with pack quantities; duplicate variants combine. | Stack Buy stays hidden. |
| Stack Phase 2 | `NEXT_PUBLIC_TLL_STACK_STOREFRONT_CART=enabled` plus stack switch | Existing “awaiting setup” notice; no live link. | Phase 1 permalink when the stack switch is enabled. |

FACT: single and stack switches are independent and require the literal `enabled`. Both commercial paths stay inert in staging and synthetic preview. Exact variant IDs remain strings and referral attribution is retained.

FACT: existing stock/approval behaviour is preserved. For single items, missing, stale or unconfirmed stock retains the selected-variant product-page fallback when store prices are OFF. With `NEXT_PUBLIC_TLL_STORE_PRICES=enabled`, only confirmed available offers use store links. The existing `cataloguePresentation.purchaseEnabled=false` projection cannot enable single Buy. An explicit `storeBuyLinkMode="product_page"` still works. Stack mixed-item and price checks are unchanged.

FACT: `StagingCart*` and `app/api/cart` support only the fixed synthetic staging item. Job B reuses the existing permalink architecture rather than extending that fixture API or the mock-only Storefront binding. No provider request happens while constructing or rendering these links; navigation happens when the user clicks Buy.

## Local proof and handover

FACT: `node --test tests/offer-routing.test.mjs tests/stack-cart.test.mjs` passes 125 tests, zero failures/skips. New cases cover the single default cart URL, switch-OFF rendering with fresh stock, explicit product-page override, and stack combined pack quantities and independent switches.

FACT: `node --test tests/product-mapping.test.mjs tests/staging-cart.test.mjs tests/staging-cart-transition.test.mjs tests/stack-share.test.mjs tests/storefront-prices.test.mjs` passes 151 tests, zero failures/skips. Unit fixtures do not contact Shopify or other services.

GAP: `npm run typecheck` and `npm run lint` started but have not returned completion or diagnostics at handover. The checkout's `node_modules` symlink resolves through `lifty-t05` into iCloud; `@eslint/eslintrc/dist/eslintrc.cjs` is marked `compressed,dataless`. TypeScript tracing shows ongoing reads from the same dependency tree. Direct executable and compile-cache-disabled diagnostics also have no completed check result. INFERENCE: dependency hydration/resolution is delaying verification. Finish these checks with available local dependencies before treating Job B acceptance as complete; no dependency/configuration changes were made here.

BLOCKED: `node --test tests/browser/mobile-stack.mjs` reports zero passes and two infrastructure failures before browser launch: sandbox loopback listen is denied (`EPERM`, `127.0.0.1`). No assertions were removed or weakened. The fixture intercepts Shopify navigation; this is not live cart proof.

FACT: committed by the orchestrator on `grok/b-buy-to-cart` (bf438dc); the sandbox could not write Git metadata.

GAP: hosted CI, approved runtime mappings/stock attachment and real Shopify cart contents remain unverified. Related draft PR status was not refreshed because this job is offline. No flag activation, live Shopify call/change or customer order was performed.

FACT: proof output is saved to `~/tll-migration/grok-runs/b-test.log`. This commerce note holds the handover because Job B restricts edits to owned files, excluding `.agent/HANDOVER.md`.
