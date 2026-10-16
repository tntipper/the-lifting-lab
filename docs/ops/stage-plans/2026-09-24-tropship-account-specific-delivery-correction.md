# TropShip account delivery correction

## Outcome

Correct the disabled local price calculator and catalogue eligibility gate for the owner's actual TropShip account. The supplier's 14 September welcome email says TropShip has a £5 plus VAT delivery charge **for each order**, while the free-delivery threshold belongs to a separate wholesale account. Tropicana's public [general delivery page](https://www.tropicanawholesale.com/help/delivery/) states a £100 threshold but does not distinguish the account in that paragraph. Its [TropShip page](https://www.tropicanawholesale.com/TROPSHIP/) describes the service without a free-shipping threshold. Treat the direct account-specific email as stronger evidence for this account; preserve the contradictory public text as an explicit supplier-confirmation item. Never silently use the public wholesale threshold for TropShip pricing.

The expected local behavior is £6 unrecoverable economic delivery cost once per TropShip supplier order at every supported wholesale total, including exactly £100; no price floor or basket becomes artificially cheaper above that amount. A customer's proposed free-delivery threshold of £100 **retail** is a separate, still-unapproved policy and is not installed here. Product wholesale VAT, pack and payment-fee approvals remain mandatory. All checkout and price writes stay disabled.

## Starting state, blast radius and exclusions

Before editing, verify `implementation-integration`, branch `codex/tll-integration`, HEAD `407574d09dd3532123b3464f1fc08965573015b0`, worktree status and disabled live boundary. The affected source is `lib/commerce/pricing-policy.ts` and `lib/commerce/catalogue-eligibility.ts`; tests and the two directly describing operations documents may change. Version the tariff so previously approved v2 projections become stale. Keep unrelated catalogue, assessment, identity, account, cart, email and stock behavior intact. No supplier connection, API call, order, purchase, live Shopify change, customer shipping change or deployment is included.

## Proof and stop rules

First add or update focused tests for one order below/at/above £100 wholesale, multiple products in one supplier order, separate supplier orders, VAT-inclusive/exclusive amounts, stale tariff versions and forged free delivery. Check that independent margin and cash safeguards still work. Make the smallest source change that passes them. Run pricing and catalogue tests, TypeScript, lint, `npm run check:live-boundaries`, and the nearby commerce regression tests. Review the diff for a missing tariff/version binding. If any pricing or catalogue regression is unexplained, stop and diagnose before broadening the change. Record the direct-email/public-page conflict and tests in evidence and the canonical handover.

An independent commercial/security review is required before this tariff is used to publish Shopify prices or to activate a checkout. Supplier confirmation of the account-specific tariff should be requested before final commercial approval; the local correction remains conservative while that evidence is pending.
