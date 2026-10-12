# T08 stock and price harness

This is an offline core with tested connection points. No network transport, SFTP client,
live Shopify/Supabase connection or scheduled job is configured by this ticket.
The parked Python connector is absent from this repository; no Python code was run or copied.

- `types.ts` defines the supplier adapter and private run/diff records.
- `adapters/tropship.ts` accepts a caller-supplied saved CSV and trusted receipt metadata.
  It reuses `supplier-feed.ts`, validating the whole file before filtering SKUs.
  Any parser/row/provenance problem rejects the entire file. Observations expire at
  six hours; a drop greater than 30% against the previous good full-feed row count rejects the file.
  The previous row count is optional for a first run; production wiring must load the last good count.
- `sync.ts` uses the existing saved mapping validator and ExactMapping review projection.
  Only active, approved, current TropShip store mappings produce changes. Barcode,
  flavour and a reviewed literal supplier Size must agree. Missing SKU/state or identity
  disagreement raises an alert and holds that mapping; no title matching or pack inference.
- Inventory changes are absolute quantities, including zero. Price-locked rows log
  supplier-cost changes as private review diffs. They never call the price calculator.
  `price_auto=true` allows customer-price diffs only with a caller-supplied approved
  calculator using the existing pricing policy/commercial burden modules. The supplier
  quote is **never** used directly as the customer's price. Cost diffs are never applied.
- `HARNESS_WRITE_ENABLED` must be the exact string `true` to call either `apply` or
  `record`. Otherwise changes and alerts exist only in the returned in-memory result.
  `apply` receives one diff at a time. An unclear result, rejection or exception stops
  further writes; there is no retry. A writer must reuse existing Shopify identity and
  reconciliation checks and return `applied` only after independent read-back.
- `/api/harness/stock-price` requires `Authorization: Bearer <CRON_SECRET>` even when
  disabled. Missing secret returns 503; wrong/missing token returns 401. `HARNESS_ENABLED`
  defaults OFF and requires exact `true`. The default exported route has no connected
  dependencies and returns 503 when enabled. The handler factory can run saved fixtures
  with supplied dependencies; responses contain aggregate counts and safe alert codes.
- TropShip order transport remains explicitly rejected as unimplemented; T09 adds the offline routing worker below. Tracking throws a
  clear unimplemented error (T10). Neither stub contacts a supplier.

## Required connection work and decisions

T05/Toby/Lifty must provide approved saved mappings, including exact literal supplier Size
review (the current mapping table has no dedicated literal Size column), and trusted
feed observation/unique-sellable-unit evidence. No historical CSV becomes a runtime mapping.
Provide current Shopify variant observations, an approved customer-price policy and a
bounded writer using `shopify-admin.ts` (pinned API 2026-07). T08 does not duplicate that adapter.
Provide private persistence for runs/diffs and the last good feed row count after separately
approved migration application. Alerts are returned as structured codes; email/Slack delivery
belongs to T11 and is not configured here. Select cron scheduling and credentials separately;
no `vercel.json`, env files or environment variables were changed.

The migration is statically checked only. Its tables are private, RLS-enabled and denied
to browser roles; flags and `applied` default false. Stock/price checks cannot qualify as
three clean days of unattended order dispatch. Live staging inventory acceptance, hosted
CI, migration application and alert delivery remain unverified.

## Local verification

```sh
node --experimental-strip-types --test tests/harness-stock-price.test.mjs tests/supplier-feed.test.mjs tests/product-mapping.test.mjs
npm run typecheck
npm run check:live-boundaries
```

Fixtures under `tests/fixtures/harness/` are entirely synthetic, with explicit synthetic
review/observation metadata. `expected-diffs.json` is the saved expected dry-run output.
No fixture represents approved supplier data or live stock.

## T09 order forwarding (offline, default OFF)

`/api/webhooks/shopify/orders-paid` uses the raw request bytes for SHA-256 HMAC
verification with constant-time comparison. It checks the configured shop, topic,
order ID and event ID, limits the body to 1 MiB, and saves only the order reference
in the private inbox before acknowledging it. No raw webhook/address is saved.
`ORDER_FORWARDING_ENABLED` must be exactly `true`; otherwise ingress and worker
return disabled without reading clients or saving anything. New setting names are
`SHOPIFY_WEBHOOK_SECRET` and `ORDER_FORWARDING_SHOP`; no settings were changed.
The exported route is deliberately unbound and returns 503 if enabled with a
valid signature. Constructing a handler with injected dependencies is for tests
and future reviewed wiring; it is not a live connection.

`route-orders.ts` is the private worker entry point, separate from webhook ingress.
Its injected Shopify client must fetch a fresh, complete (all paginated lines)
order using the existing pinned API 2026-07. Paid, uncancelled and unrefunded state,
shop/order identity, address and positive quantities are required. All lines need
one active, current, exact, signed saved mapping via `product-mapping.ts`; a
missing/ambiguous mapping or adapter holds the whole order before any submission.
Lines are grouped into one request per supplier; each group has one approved
absorbed dispatch-cost line. The injected policy must reuse the reviewed
`pricing-policy.ts` / `commercial-burden.ts` values (£6 for TropShip); unknown
supplier charges hold the order. Customer delivery pricing remains Shopify's job.

`order-store.ts` accepts a private transactional SQL client and never opens a
connection. Planning saves the immutable order plan, encrypted address, supplier
batches, per-line `supplier_orders` and reservations in one transaction. The
required stock callback must lock trusted stock, aggregate repeated SKUs, subtract
existing reservations and throw on stale/insufficient/unknown stock; there is no
permissive production default. Database conflicts deduplicate both webhook event
replays and different event IDs for the same shop/order. The entire plan rolls
back if a stock check or insert fails. Existing plans never acquire new lines.

Before calling a supplier, the worker atomically commits a spent marker for the
whole group. The static migration's private `claim_order_submission` function
moves all group rows to `manual` with attempts=1 and `SUBMISSION_IN_PROGRESS`.
A crash stays manual; pending plans found on replay also require manual recovery.
`submitted` means sent (including an email); `accepted` requires a nonblank
supplier reference. Exceptions, the bounded 10-second timeout, unknown outcomes
and acceptance without a reference become `manual`. Late results are ignored.
No submission is retried automatically. Result-save failure leaves the spent
marker intact. Rejections release reservations atomically; manual outcomes keep
them for reconciliation. Replays never clear a spent marker. The private inbox
records operator holds; T11 owns the manual queue UI and alert delivery. Changes
noticed by the fresh read after submission are held; ongoing cancellation/refund
webhook subscriptions and alerts still need separate reviewed wiring.

`delivery-privacy.ts` provides AES-256-GCM with a random nonce and shop/order-bound
authentication context. Only minimal delivery fields are encrypted/passed to the
supplier. The production encryption key must come from a server environment
variable by name (`ORDER_DELIVERY_ENCRYPTION_KEY`, 32 bytes after decoding), never
from code or SQL. SQL/browser responses/logs do not contain plaintext delivery
addresses, raw supplier errors or secrets. No key is read or changed by T09.

### T09 remaining connections and decisions

- Toby/Lifty: approve real saved mappings and current stock/dispatch-cost evidence.
- Bind a restricted private transactional DB client, approved inbox worker scheduling,
  and the stock lock/check callback. Apply the migration only after separate approval.
- Bind a fresh Shopify reader (2026-07), trusted shop and webhook secret; confirm
  subscription and credentials. No Shopify SDK/API upgrade is made here.
- Confirm TropShip API request/auth/acknowledgement or approved email/portal flow.
  The existing TropShip transport remains a clear rejected/unimplemented stub;
  no email or supplier request is sent by this ticket. Confirm other supplier terms.
- Choose address retention N days after shipment and approve privacy/access/key
  rotation arrangements; `delete_after` has no unapproved automatic retention value.
- Bind T11 alert delivery/operator workflow. Reconcile crashes/uncertain results in
  the supplier portal before any separately approved manual action.
- Supervised staging order/email or sandbox acceptance and the three-day evidence
  window remain outstanding. Local mocks/static SQL checks are not hosted proof.

T09 verification: `node --experimental-strip-types --test
 tests/harness-order-forwarding.test.mjs tests/harness-stock-price.test.mjs
 tests/supplier-feed.test.mjs tests/product-mapping.test.mjs`, plus
`npm run typecheck` and `npm run check:live-boundaries`.
