# Stage 6 offline commercial contracts

## Outcome and gate

Prepare reviewable, pure data contracts for future retail prices, promotions,
TLL affiliates and their order/spend lifecycle. The unit is complete when
synthetic fixtures reject malformed, stale, unapproved, ambiguous or
over-budget records, and the disabled suite passes. This is Stage 6's first
**offline** slice, not a marketing activation. A clean structural record is
not financial eligibility.

The live catalogue still lacks approved wholesale tax basis, payment tariff,
variant-level costs, Shopify discount-allocation evidence and affiliate terms.
None may be inferred. The contracts may describe these dependencies and
return HOLD, but must not calculate or publish a live price, code, commission
or payout.

## Scope and exclusions

Allowed: one pure `lib/commerce` contract/validator module, focused synthetic
tests, this plan, the generated
`config/staging-account-activation-manifest.json`, and `.agent/HANDOVER.md`.
The activation manifest generator recursively pins `lib/commerce`, so adding
this module requires regenerating and reviewing that manifest before the full
test suite can pass. This was discovered by the full disabled test after the
first implementation; it adds no live capability. Do not add migrations, routes,
workers, network calls, environment variables, Shopify writes, database
records, customer tracking, emails, purchases, production changes or
deployment. Do not change the existing `calculatePriceFloor` or
`evaluateBasket` engine in this unit. Preserve unrelated untracked files.

## Starting state and checks

Start from branch `codex/tll-integration` at `ca46590`; verify branch, HEAD,
working tree and remote before mutation. Both hosted-baseline native gates
must remain false; v7/v8 journals are consumed and unchanged. Existing pure
pricing lives in `lib/commerce/pricing-policy.ts`, and the Stage 6 contract is
`docs/ops/retail-promotions-affiliate-controls.md`. There is no versioned
campaign/affiliate ledger schema in the repository. The historical
`scripts/add-retail-price.sql` is not an approved price registry.

## Design and acceptance

Use integer GBP pence and basis points, explicit IDs, schema/revision/source
versions, effective windows, dependency versions and approval states. Keep
retail-price, campaign, affiliate/code, attribution, order/refund/chargeback,
spend and payout records distinct. Model discount-stacking precedence as an
explicit allowlist; reject unknown combinations. Require code uniqueness by
internal affiliate identity, and ensure a visible code is not the ledger ID.
Represent consent/retention, contract terms, Shopify allocations, costs and
payment fees as required evidence rather than safe defaults. Independent
review showed an ID/revision-only payout snapshot cannot bind the actual
financial contents: changed commission and payout amounts could both pass.
Therefore the validator must never report financial eligibility, payout
review satisfaction or payout execution authorization. Payout records remain
on a typed reconciliation HOLD until a later isolated unit designs an
authoritative content-bound ledger snapshot. Do not keep a partial balance
calculator that could be mistaken for approval.

Synthetic tests must cover ordinary sale, flash sale, affiliate discount,
partial refund, cancellation, chargeback, commission reversal and payout
HOLD, plus duplicate events and absent or stale approval. Validate shape and
state transitions without embedding a guessed live commission or margin rule.
Outputs are always `eligible:false`, `liveEnabled:false` and
`payoutExecutionAuthorized:false`; no payout review count is satisfied.

## Execution and stop rule

Implement the bounded module and focused tests, run the focused suite, then
regenerate the activation manifest and inspect its exact diff. Run full
disabled `npm test`, TypeScript, lint and `npm run check:live-boundaries`.
Request independent read-only review for pricing/identity/privacy hazards.
Correct only evidence-backed findings, then commit and update the handover.
If requirements force a commercial policy choice, stop at a typed HOLD and
record the decision needed. The next unit may integrate the contracts with
the pure pricing engine only under a new plan and approval of any missing
commercial inputs.
