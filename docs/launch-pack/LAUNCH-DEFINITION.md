# TLL Launch Definition (v2): what "live" means

TLL is live when every box below is ticked and has evidence linked (a test run, a screenshot or an order number). The Shopify password comes off only when Gates A–E are all green. Target soft open: **end of week 4**. Full launch: **week 6** (see the [TASK-QUEUE timeline](TASK-QUEUE.md#target-timeline)).

These are launch acceptance requirements, not a statement that the features already exist. See [HARNESS-SPEC.md](HARNESS-SPEC.md) for the planned supplier system and [T01 reconciliation](../ops/2026-10-reconcile.md) for signed-off decisions.

## Decisions recorded (Toby, 11 Oct 2026)
- Customers pay **£4.99 delivery** on each order. TLL absorbs the gap to the supplier's dispatch charge (TropShip £6 per supplier order). This gap is a margin line in `lib/commerce/pricing-policy.ts` / `commercial-burden.ts`, never a hidden adjustment.
- **Multi-supplier basket rule:** the customer still pays £4.99 once. TLL absorbs each extra supplier's dispatch charge, and pricing shows that as a per-supplier-order cost line. The basket view and margin reports must show the total absorbed shipping.
- The supplier harness is built in TypeScript in `lib/commerce/*` (Option B). The Python `tll-supplier-connector` repo and its draft PRs #1–#2 are parked as reference.
- The supplier evidence window is **3 days** of clean ingestion and reconciliation before unattended dispatch. Supervised dispatch may start on day 1.

## Gate A: Product truth
- [ ] Every one of the **59 products / 70 variants** in preparation (per the [5 October preparation plan](../ops/stage-plans/2026-10-05-catalogue-to-launch-completion.md)) has a recorded decision: approved, held (with reason) or excluded.
- [ ] Approved rows are saved in the mapping table built on `ExactMapping` (`lib/commerce/catalogue-eligibility.ts`), each with Shopify variant, supplier + SKU, pack, flavour, cost (ex VAT), and active. Duplicates are resolved (for example `STM008`).
- [ ] Test: `npm run mapping:check` reports 0 errors. 20 approved rows are checked by hand against the feed and the label.

## Gate B: Store (Shopify owns this)
- [ ] Approved variants are published with compliant copy, images and price.
- [ ] Delivery is set to £4.99 flat. Payments are approved for the supplement category. Tax settings match TLL's non-VAT-registered status.
- [ ] Refund, delivery, privacy, terms and contact pages are live and linked.
- [ ] **One real paid test order, separately approved by Toby**, is placed, forwarded, tracked and refunded.

## Gate C: Comparison site as the front door
- [ ] Products with an approved store offer show "Buy at TLL Store" through `components/ProductOfferLink.tsx`, opening the exact Shopify variant. Test: `tests/browser/` checks 10 approved products for the correct handle and variant ID.
- [ ] Price and stock shown come from Shopify (Storefront API 2026-07, cached 15 minutes or less). No approved product shows the old `retail_price`. Test: change a price on the staging store and the site shows it within 15 minutes.
- [ ] The **affiliate fallback appears only where no approved store offer exists**. An approved offer that is out of stock shows "Out of stock" (with an optional "notify me"), not an affiliate swap.
- [ ] True Cost uses the approved selling price and verified servings.

## Gate D: Supplier harness (TropShip)
- [ ] Hourly stock and price **observation and reconciliation**. Price writes happen only on rows approved for automatic pricing. Stock older than its expiry (default 6 hours) is set to unavailable.
- [ ] Paid order → **a fresh Shopify order read** (paid, not cancelled or refunded) → reservation → supplier submission. The statuses *submitted*, *accepted*, *shipped* and *uncertain* are tracked separately. Uncertain goes to the manual queue and is never resubmitted automatically.
- [ ] Tracking is written back with explicit line items, and the customer gets Shopify's shipping email.
- [ ] Any failure creates a manual-queue item and an alert within 5 minutes.
- [ ] **A 3-day evidence window:** 3 consecutive days of clean feed ingestion, stock reconciliation and (supervised) orders before unattended dispatch is switched on.

## Gate E: Compliance (done with product review, not after it)
- [ ] Each approved SKU is reviewed for claims against the GB NHC register, required warnings (high caffeine, age statement where relevant), novel-food and WADA status. Lifty signs it off. A keyword scan is a helper only, not proof.
- [ ] Commercial eligibility never implies scientific endorsement (see draft PR #54).
- [ ] Food business registration is submitted. The privacy policy covers data shared between Supabase and Shopify, and customer addresses are stored privately with a retention period.

## Gate F: After launch (part of the full scope, not blocking the password)
- [ ] Shopify Customer Accounts are linked to site profiles, and My Stack has add-to-cart (reusing `lib/identity/*` and the existing basket code).
- [ ] Bodypower/PowerBody, then supplier 3, go live through the same harness.
