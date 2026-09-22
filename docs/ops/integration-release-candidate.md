# Integrated staging candidate

This candidate combines the reviewed catalogue, pricing, accessible UI, retailer-link, assessment-contract, saved-stack and inventory-operation foundations above the Stage 0 security baseline. Hosted acceptance and production release remain separate gates.

## Resulting behaviour

- Product identity, stock observations and cost evidence have explicit eligibility states. Unknown wholesale VAT treatment cannot authorize a price. The current TropShip tariff charges £5 ex VAT / £6 unrecoverable gross once per approved supplier order below £100 ex-VAT wholesale goods, and zero strictly above it. Exactly £100 is held with a conservative £6 estimate. Separate supplier orders cannot pool thresholds. Standalone product floors preserve the approved 35% target, 25% minimum and £3 cash safeguards; customer shipping charges are unchanged. See the [pricing policy](pricing-policy-calculator.md).
- Future retail pricing, flash sales and TLL affiliate-specific codes must use
  versioned campaign and attribution records. Customer discount, affiliate
  commission, fixed sponsorship, advertising spend, payment fees and supplier
  delivery all count in the commercial guard. Budget limits, refund/chargeback
  reversals and Shopify allocation reconciliation fail closed. See [retail,
  promotion and affiliate controls](retail-promotions-affiliate-controls.md).
- Retailer listings are labelled as listings. An unresolved or unapproved own-shop mapping has no purchase action. Research-stack links do not imply a combined checkout.
- All unapproved historical scores are excluded from effectiveness recommendations, awards and automatic wizard/goal-stack selections. Historical values remain neutral, explicitly unverified research data. Known category, product, comparison and alternatives pages remain available; score/value order becomes alphabetical and listed-price comparisons remain separate. API ranks are null and metadata follows the same rule. See [assessment approval containment](../research/unassessed-ranking-containment.md); this change does not approve the underlying science.
- Navigation and dialogs preserve keyboard focus, hide closed controls and fit the tested widths. Stack budgets describe the initial pack purchase; they do not imply a verified monthly consumption cost.
- Saved stacks use one active stack per account, idempotent additions and version-checked destructive operations. Authenticated additions persist an account-bound retry record before sending and reuse the same nonce after uncertain responses. Every mutation checks its originating account against the verified session. Migration 003 preserves duplicate-stack repair evidence and blocks direct browser table writes. See [stack integrity](active-stack-integrity.md) and [outbox limits](stack-addition-outbox.md).
- The Shopify adapter checks exact inventory identity and creates guarded plans. The new private database ledger excludes competing operations for the same shop/item/location and records a durable attempt before transport. Fenced recovery reconciles uncertain outcomes rather than blindly replaying writes. The ledger is disabled, its roles are NOLOGIN, and no hosted worker or transport is activated. See [inventory ledger](inventory-operation-ledger.md).

## Integration review

The stack/UI merge preserves both accessibility and database stack CI jobs. It retains shared stack state, loading/busy controls, retries, accessible-dialog focus handling and the retailer-listing boundary. The assessment follow-up adds an IDs-only public read route and resolves catalogue values rather than trusting stored or caller-supplied scores.

The implementation at `a5a18f5e0a568031cf7f70a240fa023a0a5215a0` passed **821 unit tests**, TypeScript, lint with zero errors and six existing warnings, seven real local Next auth-route tests, and browser component checks at 320, 390, 768, 1024, 1280 and 1440 pixels. The real Next build/runtime isolation check passed with zero external connections. Browser checks use synthetic adapters and a fresh headless profile; they do not establish hosted identity/cart or native assistive-technology acceptance.

The pricing revision separately passed 187 focused pricing/catalogue cases. The corrected inventory migration passed 94 real PostgreSQL checks and three repository/worker database flows locally, including inherited PostgreSQL 17 MAINTAIN privilege denial. Independent assessment-containment review passed 45 focused cases against its exact source commit. CI includes an inventory-ledger job alongside application, accessibility, stacks, submissions, auth-storage and database checks. The pull request records CI evidence for its exact source revision.

## Remaining release gates

1. Verify the deployed assessment-approval boundary and cache invalidation before release. Complete formula, label, claims and category evidence review before restoring scientific recommendations; no approved assessment dataset currently exists.
2. Deploy the exact combined client to isolated staging and verify concurrent browser and account-change journeys. Migration 003 and nine direct hosted RPC cases passed separately; those results do not prove this client. Browser storage eviction, Safari/iOS and crash recovery remain acceptance limitations.
3. Install and verify disabled migration 004 in isolated staging, then separately qualify a worker transport and its credentials. Installing a ledger does not activate supplier dispatch or stock writes.
4. Obtain and rehearse a restorable private production backup, review migration impact and rollback, and satisfy Stage 0 release checks before production migration or release.
5. Review exact commercial mappings, wholesale costs/tax, label provenance and stock semantics before enabling commerce projections or automation. Complete supplier order workers and outage/reconciliation acceptance. Implement the versioned retail-price registry, flash-sale scheduler, discount-stacking matrix, affiliate/code attribution ledger, commission/refund reconciliation, spend budgets and contribution-based performance reporting in [retail, promotion and affiliate controls](retail-promotions-affiliate-controls.md).
6. Verify the isolated Shopify customer-account and cart prototype, then consent/email and approved evidence publication. Synthetic component checks are not acceptance for those services.

Production price changes, supplier dispatch, customer-email activation, production theme publication and production application/database deployment are not performed by this candidate. The finding register remains open until its recorded acceptance evidence is met.
