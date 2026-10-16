# TLL Stack → Cart Task Queue (lowest-friction journey; one ticket = one branch = one PR)
_Updated 11 Oct 2026 20:40 BST after a read-only code check of `implementation-integration` (branch `codex/t03-reconcile`, 093ada99)._

## Code check results
- **S01 confirmed missing:** `app/stack/StackBuilder.tsx:299` says "A research stack does not create a cart or order". Each item only renders `ProductOfferLink`. The Storefront cart (`lib/commerce/staging-cart-storefront.ts`) is hardcoded to the staging shop `tll-integration-staging.myshopify.com` and **one** synthetic variant (lines 5–8, 65, 119). Use its pattern, but write a new multi-line function rather than reusing it. There's no `product_mapping` yet (T04/T05 come first).
- **S02 partial:** per-item stock state already exists (`ProductOfferLink` → `catalogueAvailabilityFor`, `lib/commerce/catalogue-presentation.ts`). Reuse that. There's no mixed-stack handling.
- **S03 corrected:** `lib/affiliate.ts:57` deliberately blocks own-shop/myshopify URLs (`own_shop_approval_required`), and the button text is "View retailer ↗". T06 has to lift that block first, and S03 builds on T06.
- **S04 mostly exists:** a guest stack is already saved on the device (`components/LocalStackContext.tsx`, hydrated through `app/api/products/batch/route.ts`). The signed-in stack goes through `app/api/stack/route.ts` (Supabase). The share link only points to an image card (`/api/stack/sharecard?ids=`, StackBuilder.tsx:129). There's no URL that rebuilds the stack. Merging the guest stack on sign-in isn't verified.
- **S05 missing:** `track('retailer_listing_click')` in `lib/gtag` logs clicks on the site, but no UTMs or ref go to the shop.
- **S06/S07:** these are Shopify admin settings and tests. There's no repo code to check.
- **S08 corrected:** the site has its own reviews (`app/api/products/reviews-summary/route.ts`, used by `ProductGrid.tsx`). There's no Judge.me or Shopify reviews code.


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
