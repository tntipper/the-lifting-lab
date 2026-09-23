# Daily competitor price checks

The first implementation is a pure, local comparison planner. It does not
fetch prices, schedule a job, recommend a Shopify price or write to Shopify.
`lib/commerce/competitor-price-check.ts` will accept a dated, explicitly
reviewed snapshot and produce a review queue. All price-change and automation
flags remain false. The Stage 6 shadow margin guard remains a separate check.

## Proposed daily operating loop

1. Capture a read-only Shopify variant and customer-delivery snapshot, with
   observation time, currency and a named single-item shipping scenario. A
   checkout shipping quote is evidence for that scenario only, not a universal
   shipping price. Capture the current standalone floor and all dependency
   versions from the approved cost, VAT, payment and TropShip policies.
2. Ingest competitor offers only from a separately approved, lawful source.
   Retain source time, offer ID, retailer, exact item price, customer-delivery
   charge, availability and source evidence. A re-read timestamp cannot make
   an older offer observation fresh.
3. Maintain a reviewed exact variant/pack match register. GTIN, brand and
   names help find candidates, but none alone approves a match. Multipacks,
   flavours, sizes, subscriptions and delivery regions require separate
   identities. Every match review binds the current pack-identity version and
   has explicit review and expiry times. Expired or conflicting matches go to
   a human queue.
4. Run the deterministic planner once over the full variant snapshot. It
   reports every variant, counts held offer evidence, and compares delivered
   prices only for in-stock exact matches under the same shipping scenario.
   A stale or sold-out offer remains held evidence without erasing an
   independently valid offer. Duplicate IDs or conflicting identity evidence
   hold the affected comparison. No comparable fresh offer is an unknown
   market position, not a zero price.
5. Route cheaper competing offers and floor conflicts for commercial review.
   Before any future price proposal, replay the proposed price and all
   discounts, affiliate commissions, campaign spend, payment fees and supplier
   delivery through the approved standalone and basket margin guards. A
   competitor below the floor is a margin constraint; the bot must not chase
   it automatically.
6. Record the snapshot IDs, match reviews, versions, hold reasons and human
   disposition. Alert on missing/late feeds, shrinking match coverage,
   abnormal price changes and repeated floor conflicts. Reconcile any future
   Shopify write by readback and never retry an uncertain write blindly.

The current planner accounts for every **supplied** variant and offer. It
cannot prove that a supplier or Shopify export included the entire catalogue.
The future ingestion job must verify pagination/completeness against its
source receipt and hold an empty or partial feed before calling this planner.
The offline `price-check-catalogue-receipt.ts` gate now checks internal
agreement among supplied Shopify page cursors, IDs and a separately declared
variant count. Its PASS is not proof that Shopify supplied those facts, that
the declared count is authentic, or that concurrent pagination was a stable
snapshot. The future read-only Shopify collector must authenticate the Admin
API response, specify the exact catalogue filter/market scope, obtain a count
for that same scope, and bind the collected prices and variant rows to the
receipt. Any missing or mismatched evidence must HOLD the entire shadow run.

## Gates before scheduling or action

Select and approve the competitor data source and permitted use, source
freshness interval, UK shipping scenarios, exact product-match reviewers and
retention policy. Obtain authoritative wholesale VAT bases, sellable-unit
costs, payment tariff and actual Shopify discount allocations; the current
feed and draft marketing records cannot supply these approvals. Run a full
catalogue shadow cycle and inspect unmatched/held products before enabling a
daily schedule. Price publication is a later, separately reviewed stage with
an idempotent worker, kill switch, write receipt and rollback/reconciliation
procedure. No customer or affiliate personal data is needed for the comparison
snapshot.
