> **Canonical queue (updated by Toby on 11 Oct 2026, 20:36).** This file uses the original T01–T15 numbering, with S01–S08 added. `TASK-QUEUE-v2.md` keeps the earlier v2 numbering and its Codex fact-check corrections (real paths, `ExactMapping`, the node test runner, 59/70 counts) for reference. Where they differ, use the real paths from AGENTS.md. T01 (iCloud move) and T13 are for Toby. T02 park actions wait for Toby.

# TLL Task Queue (work top to bottom; one ticket = one branch = one PR)

### T01: Consolidate the repo out of iCloud (Toby + Codex, 0.5 day)
- **Goal:** a single clean local clone at `~/Developer/the-lifting-lab` on `main`, with nothing in iCloud.
- **Files:** none changed. Git operations and folder moves only, done by Toby or with his approval.
- **Acceptance:** `git status` is clean on main and up to date with origin. The iCloud `implementation-integration` folder is archived (zipped) and not deleted. `npm ci && npm run build` passes locally. Vercel still deploys from main.
- **Out of scope:** merging any staging work.

### T02: Park stale PRs and branches (recommendation, Toby decides, 0.5 day)
- **Goal:** a list showing close/keep for draft PRs #54 and #60–#66, the `codex/tll-integration` branch and `tll-supplier-connector` PRs #1–#2, each with a one-line reason. Dependency or lint fixes (#63, #64, #66) are candidates to recreate as small tickets.
- **Files:** `docs/parked.md`.
- **Acceptance:** Toby approves the list. Nothing is closed without approval.
- **Out of scope:** code changes.

### T03: Add AGENTS.md and the launch definition (0.25 day)
- **Goal:** commit AGENTS.md, LAUNCH-DEFINITION.md, HARNESS-SPEC.md and TASK-QUEUE.md to the repo root or `docs/`.
- **Acceptance:** files are on main. CLAUDE.md points to AGENTS.md.
- **Out of scope:** anything else.

### T04: product_mapping table and check script (1 day)
- **Goal:** a migration for `product_mapping`, plus `lib/mapping/` queries and `npm run mapping:check`.
- **Files:** `supabase/migrations/*_product_mapping.sql`, `lib/mapping/*`, `scripts/mapping-check.ts`, `tests/mapping.test.ts`.
- **Acceptance:** the migration applies to a local or staging DB. The check script flags duplicate variants, missing SKU, missing cost and inactive-but-published rows. Unit tests pass.
- **Out of scope:** filling in data (T05), Shopify writes.

### T05: Seed the mapping for the TropShip launch range (1–2 days, with Lifty)
- **Goal:** import the 50 live Shopify products (from the 2 Oct catalogue workbook and Shopify readback) and match them to comparison product IDs and TropShip SKUs. Unmatched comparison products are set to `affiliate`.
- **Files:** `scripts/seed-mapping.ts`, `data/mapping-review.csv`.
- **Acceptance:** `mapping:check` shows 0 errors and at least 50 rows with `status=store`. A 20-row sample is signed off by Lifty or Toby.
- **Out of scope:** PowerBody or supplier 3.

### T06: Shopify deep-link Buy buttons, store first (1 day)
- **Goal:** extend `lib/affiliate.ts` `buyLink()` so store-mapped products go to `https://shop.theliftinglab.co.uk/products/{handle}?variant={id}` and everything else falls back to the existing affiliate links. Show "Buy at TLL Store".
- **Files:** `lib/affiliate.ts`, `app/products/ProductGrid.tsx`, `app/products/[id]/ProductDetailPage.tsx`, the compare, best and stack pages, `tests/e2e/buy-links.spec.ts`.
- **Acceptance:** Playwright confirms 10 mapped products open the correct variant URL (HTTP 200 once the password is off; a correct URL until then). An unmapped product shows the affiliate link and label.
- **Out of scope:** on-site cart and price display.

### T07: Show Shopify price and stock on the site (1–1.5 days)
- **Goal:** `lib/shopify/storefront.ts` reads price and availability by variant ID (batched, cached for 15 minutes). Cards and product pages show the store price and in-stock state. True Cost uses the store price.
- **Files:** `lib/shopify/*`, the product components, `tests/storefront.test.ts`.
- **Acceptance:** a mocked Storefront test passes. On staging, a Shopify price change shows on the site within 15 minutes. Out of stock switches the button to the affiliate fallback.
- **Out of scope:** writing to Shopify.

### T08: Harness core and TropShip stock/price sync (2–3 days)
- **Goal:** `lib/harness` types, the TropShip adapter (SFTP feed, tolerant CSV parser), the hourly `stock-price` cron, `sync_diffs` and `harness_runs`. Dry run by default.
- **Files:** `lib/harness/{types,sync}.ts`, `lib/harness/adapters/tropship.ts`, `app/api/harness/stock-price/route.ts`, the migration, tests using the saved feed fixture.
- **Acceptance:** with the fixture, the diff output matches the expected file. With `HARNESS_WRITE_ENABLED=true` on the staging store, inventory updates. `price_locked` rows are never price-updated. A malformed feed raises an alert and skips the run.
- **Out of scope:** orders and content sync.

### T09: Order forwarding through webhook routing (2 days)
- **Goal:** `orders/paid` webhook (HMAC verified) → `supplier_orders` rows → worker → TropShip `placeOrder` (API if confirmed, otherwise email) behind `ORDER_FORWARDING_ENABLED`.
- **Files:** `app/api/webhooks/shopify/orders-paid/route.ts`, `lib/harness/route-orders.ts`, the migration, tests.
- **Acceptance:** a replayed webhook makes no duplicate. A mixed-supplier order splits correctly. A timeout leads to `manual` with no retry. A test order on the staging store shows up in the supplier email or sandbox.
- **Out of scope:** tracking (T10).

### T10: Tracking write-back (1 day)
- **Goal:** the `tracking` cron fetches tracking and calls Shopify `fulfillmentCreate` with explicit line items.
- **Acceptance:** a test order is fulfilled with its tracking number and the Shopify shipping email is sent. Partial shipments only fulfil the lines that shipped.

### T11: Manual fallback queue and alerts (1–1.5 days)
- **Goal:** the `manual_queue` table, an `/admin/harness` page (admin only), email/Slack alerts and the daily digest.
- **Acceptance:** a forced adapter error creates a queue item and sends an alert within 5 minutes. An item can be marked done. Non-admins get a 403.

### T12: Compliance pages and the per-SKU checklist (1–2 days, with Lifty)
- **Goal:** check refunds, delivery, privacy (covering Supabase and Shopify data sharing), terms and contact in Shopify and the site footer. Add caffeine warning and 16+ blocks on the relevant products. Create `docs/compliance-checklist.csv` for each SKU (NHC claims, novel food, WADA, warnings).
- **Acceptance:** every live SKU is ticked and signed. A keyword scan (cure, treat, prevent, detox…) of product copy returns 0 hits.
- **Out of scope:** legal advice. Toby confirms the food business registration.


## Stack → cart journey (pre-launch, added 11 Oct 2026 by Toby; run after T07, before T13)

### S01: Stack → Shopify cart with no login (1 day, after T05/T06)
- **Goal:** "Buy my stack" on the stack page builds one Shopify cart with every store-mapped variant. Phase 1 is a cart permalink `https://shop.theliftinglab.co.uk/cart/{variantId}:{qty},...`. Phase 2 reuses Storefront `cartCreate` → `checkoutUrl` from `lib/commerce/staging-cart-storefront.ts` behind a flag. This replaces the login-gated "Add My Stack to cart" in T-queue line 78, which now only binds the cart to an account.
- **Files:** `lib/commerce/stack-cart.ts`, stack page component, `tests/stack-cart.test.ts`, `tests/e2e/stack-cart.spec.ts`.
- **Acceptance:** for a guest with 3 mapped items, the Shopify cart opens with 3 lines and the right quantities. No sign-in prompt appears before checkout.
- **Out of scope:** account binding, on-site cart UI.

### S02: Mixed and out-of-stock stacks (0.5 day)
- **Goal:** reuse `catalogueAvailabilityFor`. Before redirecting, split the stack into in-stock store items (sent to the cart), out-of-stock items (skipped, shown with a "notify/alternative" note), and affiliate-only items (listed with their own affiliate links on a "Not sold in our store" interstitial or panel).
- **Files:** `lib/commerce/stack-cart.ts`, stack page, tests.
- **Acceptance:** a stack with 2 store, 1 OOS and 1 affiliate item sends 2 lines to the cart and clearly shows the other 2. The cart is never empty or broken.
- **Out of scope:** substitutions logic.

### S03: Single Buy buttons add straight to cart (0.25 day, after T06 lifts the `own_shop_approval_required` block in `lib/affiliate.ts:57`)
- **Goal:** `resolveProductListing()` currently has no `buyLink()`. Add the option in `buyLink()` to use `/cart/{variantId}:1` (skipping the product page) for in-stock mapped items, and `/products/{handle}?variant=` otherwise. Toby picks the default.
- **Files:** `lib/affiliate.ts`, `components/ProductOfferLink.tsx`, `tests/e2e/buy-links.spec.ts`.
- **Acceptance:** Playwright confirms that a mapped item lands in the cart with the variant selected.

### S04: Shareable stack URL (+ verify guest merge) (0.5 day)
- **Goal:** guest localStorage already exists (`LocalStackContext`). Verify that the guest stack merges into the Supabase stack on sign-in, and fix it if not. Add a "Share stack" URL (`/stack?items=variantId:qty,...`) that rebuilds the stack and supports Buy.
- **Files:** stack store/hook, stack page, tests.
- **Acceptance:** after a refresh, the guest stack is still there. A shared URL opens the same stack in a fresh browser, and Buy works from it.

### S05: Attribution on cart links (0.25 day)
- **Goal:** append `utm_source=theliftinglab&utm_medium=referral&utm_campaign={stack|product|compare}` and `ref=` to every cart/product link (Shopify cart permalinks accept `?ref=` and UTMs; Storefront `cartCreate` sets cart `attributes`/`note` with the source).
- **Acceptance:** a test order shows the TLL source in Shopify order attribution.

### S06: Shopify checkout settings checklist (Toby, 15 min, no code)
- **Goal:** in Shopify admin, set customer accounts to optional (guest checkout on), turn on Shop Pay, Apple Pay and Google Pay with Shopify Payments, and enable dynamic checkout buttons. Remove the store password at soft open.
- **Acceptance:** a mobile Safari test checkout shows Apple Pay/Shop Pay and no forced login.

### S07: Mobile journey test (0.5 day)
- **Goal:** a Playwright run on the iPhone and Pixel profiles covering build stack → Buy → Shopify cart → checkout page loaded (stops before payment). Add it to the Sentinel run once Sentinel is built.
- **Acceptance:** passes on both profiles, with sticky Buy button visible without scrolling on the stack page.

### S08: Shopify reviews on TLL product pages (spike 0.5 day, then build 1 day)
- **Goal:** pick a Shopify reviews app (Judge.me has a public widget/API; Shopify Product Reviews is retired) and show its star rating and count for mapped products on TLL cards/pages. Decide how they sit alongside the existing Supabase reviews (show both labelled, or store reviews only).
- **Files:** `docs/reviews-spike.md`, then `lib/reviews/judgeme.ts` and the product components.
- **Acceptance:** Toby approves the spike. Ratings for 5 mapped products match the store, with ratings cached at most 1 hour.
- **Out of scope:** installing paid apps without Toby's yes.

## Decision (Toby, 11 Oct 2026 20:36): S08 = Shopify store reviews ONLY
Replace TLL's own reviews (app/api/products/reviews-summary/route.ts and UI) with verified Shopify store reviews (e.g. Judge.me free plan) shown on TLL product pages. Hide/retire TLL native reviews display; do not delete existing review data without Toby's yes. Depends on T04/T05 product-to-Shopify mapping.

### T13: Launch rehearsal and removing the password (0.5 day, Toby)
- **Goal:** run LAUNCH-DEFINITION Gates A–E, then a real order, refund and tracking test, then remove the password.
- **Acceptance:** all gate boxes are ticked with evidence.

### T14: PowerBody adapter (2–3 days, after launch)
- **Goal:** the PowerBody adapter (feed plus email or portal ordering, details TBC). Map PowerBody SKUs by EAN.
- **Acceptance:** the same tests as T08–T10 using a PowerBody fixture. At least N new products go live after the T12 checklist.

### T15: Supplier 3 adapter (TBC, likely Bodyshocker) and Customer Accounts link (3–4 days, after launch)
- **Goal:** the supplier-3 adapter from the template. Separately, link Shopify Customer Accounts to Supabase profiles by verified email, and add "Add My Stack to cart" (Storefront cart).
- **Acceptance:** adapter tests as above. Test user: add the stack to cart, check out and see the order on their account page.
