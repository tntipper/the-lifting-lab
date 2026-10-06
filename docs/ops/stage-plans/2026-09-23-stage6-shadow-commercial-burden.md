# Stage 6 shadow commercial-burden calculation

## Outcome and acceptance

Extend the pure pricing foundation with a **shadow-only** replay that subtracts
explicitly allocated affiliate commission, campaign spend, sponsorship and
platform costs from an already assessed basket. The result must show whether
the supplied numbers meet the existing 25% margin and £3-per-item cash floors
for every line and the order, without granting commercial or checkout
authority. The 35% target remains a separately reported target. Synthetic
tests must demonstrate that paid marketing cannot be hidden by a profitable
neighbour or customer shipping.

## Starting state and allowed changes

Start from `codex/tll-integration` at `1e52d25`, verify branch, HEAD, status,
both false native hosted-baseline gates and fresh manifests. The authority is
`docs/ops/pricing-policy-calculator.md`,
`docs/ops/retail-promotions-affiliate-controls.md` and
`lib/commerce/pricing-policy.ts`. The Stage 6 draft-record validator is
non-authoritative and always disabled.

Allowed changes: one new pure `lib/commerce/commercial-burden.ts`, focused
tests, this plan, generated `config/staging-account-activation-manifest.json`
because it recursively pins `lib/commerce`, and `.agent/HANDOVER.md`. Do not
edit the existing pricing engine, migrations, routes or live launchers. Do not
access credentials, services or customer data; do not write Shopify prices,
discounts, payouts or emails. Preserve unrelated untracked files.

## Input, proof and failure behavior

Use `evaluateBasket` as the single source for VAT, supplier delivery, payment
fees, discounts and line economics. Require exactly one burden allocation per
basket line, keyed by the existing line ID; each named burden is a nonnegative
integer number of GBP pence, with safe bounded totals. Never infer a
commission rate, spend allocation, tax basis or missing zero. The caller must
provide every line's four burden categories explicitly; a fixed campaign or
order cost must already have a reviewed per-line allocation.

If the base basket is held or lacks a calculation, return HOLD and do not
invent new economics. Otherwise subtract burdens using exact rational
arithmetic from both each line's conservative standalone contribution and
the order contribution. Test every line against its own net revenue for the
minimum margin and against its own cash floor; test the order against the
existing minimum margin and cash floor. Customer shipping cannot rescue a
line. Report amounts and hold codes, but **always** return
`eligible:false`, `liveEnabled:false`, `checkoutVerified:false`, and
`shopifyAllocationVerified:false`. A mathematical pass is not evidence of
actual Shopify penny allocation or authenticated approvals.

Stop and revise the plan if the implementation requires guessing a commercial
policy or changing the existing calculator. Regenerate and inspect the exact
activation-manifest diff; it must reflect the one new source only. Run focused
tests, full disabled `npm test`, typecheck, lint, both manifest checks and
`npm run check:live-boundaries`. Obtain independent read-only margin/security
review and correct only evidence-backed findings. Commit the bounded result
and update handover. Any real activation needs a separate staged plan,
current product-cost/tax/payment evidence and observed Shopify allocations.
