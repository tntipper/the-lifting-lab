# Zero-stock products remain in catalogue build scope — 2 October 2026

## Owner decision

Prepare all ten supplier-zero-stock launch variants as part of the agreed 63-product / 74-variant range. Zero stock is a temporary availability state, not a reason to delete the product or postpone its catalogue preparation. No restock date has been established. Do not advertise a predicted date or accept backorders. The 13 £0 Draft placeholders remain a separate price/identity problem.

## Prepared records

[Ten-variant build queue](2026-10-02-zero-stock-build-queue.csv) preserves existing Shopify product/variant IDs and handles, exact catalogue variant names, current listed prices, historical wholesale and newer supplier quote observations, unverified supplier packs/barcodes and existing brand source links. It specifies draft copy “Out of stock”, purchases disabled and the same-variant restock rule. Brand links are research starting points, not exact label approval. Product content still requires label, ingredients, allergens, directions and warnings review; supplier nutrition text must not be automatically published. These local draft records are not live product pages.

## Implemented local catalogue rule

`lib/commerce/catalogue-eligibility.ts` now distinguishes `out_of_stock` from generally `unavailable`. When a product passes all existing commerce checks and zero reconciled stock is its sole commerce hold, it keeps its research-listed, shop-only or unassessed catalogue state. It has no purchase target or enabled exact-shop link and is excluded from buyable value ranking. If any other commerce check is unresolved, it remains unavailable; zero supplier raw stock cannot masquerade as approved out-of-stock availability.

A fresh approved positive-stock projection re-evaluates the same product and variant as available only if every other commerce check still passes. This adds no scheduler, supplier import, stock write or hosted activation. The current comparison routes do not yet consume the shared eligibility result; live page badges and stock-driven purchase controls remain part of the held catalogue/stock integration work. No public availability status is inferred from today's unapproved feed.

## Verification

All 105 focused catalogue tests passed, including retained listings at zero, exact-variant restock, separate research status, and rejection of stale/raw/unapproved stock, wrong variant, unresolved VAT/label, operator hold and draft status. The live-boundary check passed with zero violations. TypeScript typecheck and focused ESLint both passed.

## Next work

Complete the same content/identity review for these ten variants as the in-stock range, wire reviewed variant projections to the catalogue and purchase controls during approved integration work, and prove stock depletion/restock end to end before live activation. No supplier auto-import, Shopify change or successor Stage 3 run is authorised by this catalogue-scope decision.
