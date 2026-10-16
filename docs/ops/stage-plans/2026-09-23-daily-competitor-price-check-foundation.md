# Daily competitor price-check foundation — offline unit

## Outcome and acceptance

Create a deterministic, read-only comparison planner for one dated snapshot of
TLL shop variants and competitor offers. It must account for every input
variant, accept only explicitly reviewed exact sellable-unit matches, compare
like-for-like delivered prices under the same shipping scenario, and flag
competitive gaps without proposing or writing a new retail price. A floor
above the lowest comparable offer must be reported as a margin constraint,
not overridden. All output is planning evidence, never publication authority.

## Starting state and authority

Start from `codex/tll-integration` at `acaf84f`; verify Git status, both false
hosted native gates and both generated manifests. The existing pure margin
guard is `lib/commerce/pricing-policy.ts`; its TropShip tariff is supplier
cost, distinct from customer shipping. `lib/commerce/supplier-feed.ts` treats
barcodes and pack labels as unverified until separately mapped. The Stage 6
marketing draft contract and shadow burden calculation are non-authoritative.
No competitor source, match registry, scheduler or approved product-cost set
currently exists in this repository. Do not treat a GTIN checksum or product
name as exact identity evidence.

## Exact scope and exclusions

Allowed: a new pure `lib/commerce/competitor-price-check.ts`, focused
synthetic tests, this plan, a concise operational contract at
`docs/ops/daily-price-checks.md`, the generated activation manifest (which
recursively pins `lib/commerce`) and `.agent/HANDOVER.md`. Do not edit the
pricing engine, existing feed parser, Shopify adapter, routes, migrations or
live launchers. No browsing/scraping, competitor API call, supplier fetch,
database or Shopify write, customer email, order, purchase, credential use,
production change or scheduled automation is part of this unit. Preserve
unrelated untracked files.

## Input and fail-closed behavior

Require explicit **fresh** snapshot and evaluation times, bounded freshness
policy, stable variant/offer IDs, GBP integer pence, same shipping scenario,
own delivered price components, and a separate mathematical floor with its
source/dependency version. An offer is comparable only with an explicit
reviewed exact variant + matching pack-identity version binding, evidence ID,
review/expiry times and a fresh observation; retailer availability must be
known. Do not infer a pack from
`Size`, a match from a barcode or name, or zero shipping from a missing
value. A floor input is still caller-provided planning evidence, not
authenticated approval.

Duplicate IDs or invalid/stale shop snapshots HOLD the affected variant
comparison. A stale/future, sold-out, unknown-stock, mismatched-pack or
shipping-scenario offer is held evidence and cannot be selected; it must not
erase a separate valid offer for the same variant. Every supplied variant
gets a result, including sparse/malformed rows; every supplied offer,
including sparse rows, is either retained in the comparable-offer list or
counted as held evidence. The lowest is a projection of that list, not its
only retained member. If shared snapshot metadata is invalid, otherwise
well-formed offers are held, not silently dropped. Duplicate-ID identity
checks must preserve opaque variant IDs exactly; do not concatenate/split
identifiers with a delimiter. A variant without any valid comparable offer
gets an explicit `NO_COMPARABLE_OFFER` reason.
Malformed outer metadata must not erase otherwise enumerable variant rows.
Compare delivered prices using integer pence only. Report
the lowest comparable in-stock offer and gap, plus whether the standalone
floor could ever meet that delivered competitor price under the supplied own
shipping. Never compute a recommended Shopify price. All outputs carry
`writesEnabled:false`, `automationEnabled:false` and
`priceChangeAuthorized:false`.

## Verification and stop rule

Synthetic tests must cover exact match, cheaper competitor, parity, cheaper
own store, delivery differences, floor-above-competitor, stale/future offers,
pack mismatch, expired/unapproved/missing match evidence, duplicate IDs,
sold-out and unknown availability beside a valid offer, malformed/sparse
inputs and complete variant/offer accounting.
Add a test showing the £6 TropShip supplier charge is not confused with
customer delivery. Check the exact generated manifest diff, focused suite,
full disabled `npm test`, typecheck, lint, both manifest checks and
`npm run check:live-boundaries`. Obtain independent read-only pricing/identity
review; fix evidence-backed findings and rerun affected checks. Stop and
revise this plan if a data-source policy, matching assumption or mutation
surface must change. Commit the bounded offline result and update handover.
Any real daily automation and any price adjustment need separate source,
margin, privacy and activation reviews.
