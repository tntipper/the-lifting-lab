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
- TropShip order transport remains explicitly rejected as unimplemented; T09 adds the offline routing worker below. The tracking transport throws a
  clear unimplemented error; T10 adds the injected tracking job below. Neither stub contacts a supplier.

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


## T10 tracking write-back (offline, default OFF)

`tracking.ts` is the tracking job. It loads private `supplier_orders` in submitted
or accepted batches, calls the matching adapter's `fetchTracking` with supplier
references, then builds a pinned Shopify 2026-07 `fulfillmentCreate` request.
Each normalised update represents one immutable parcel: `shipmentId`, reference,
tracking number, carrier, and explicit shipped SKU/quantity pairs. Quantities are
incremental per parcel, never cumulative totals. A tracking number alone is not
shipment-line evidence. A repeated SKU on different order lines is held for review;
no variant/title matching or guessing is used.

The injected fresh Shopify reader must load the complete, paginated order and
fulfillment-order lines, cancellation/refund state, remaining quantities, location
IDs and CREATE_FULFILLMENT support. The job matches the stored Shopify order-line
ID to the actual fulfillment-order-line ID. Every request supplies a nonempty
`fulfillmentOrderLineItems` list with explicit positive quantities, so partial
shipments never fulfil unshipped items. Multiple fulfillment orders at one location
are supported; ambiguous split lines or multiple locations require review.
`notifyCustomer: true` requests Shopify's own shipping email. This is a mocked
request check, not proof that a real customer email was delivered.

`TRACKING_WRITE_ENABLED` must be exactly `true`. Missing/false/other values cause
no reads, supplier calls, persistence or Shopify writes. `/api/harness/tracking`
is an authenticated GET cron entry point, reusing the existing CRON_SECRET setting
name. It returns only counts and safe codes; no references, tracking numbers,
private lines, request bodies or provider errors appear in responses. The exported
route has no connected dependencies and returns 503 when enabled. No schedule or
environment settings are changed; the proposed 30-minute schedule is not installed.

`tracking-store.ts` reuses T09's injected private SQL transaction interface. A
stable key hashes shop/order/supplier/reference/parcel ID; a separate fingerprint
catches changed tracking or shipped lines under that same ID. Completed/rejected/
in-progress/uncertain attempts are never automatically replayed. The claim
transaction locks the order, inserts the unique spent marker and reserves each
shipped quantity before transport. Different parcels cannot claim the same units.
Successful receipt saving atomically increments fulfilled quantities and releases
a T09 stock reservation only when that entire line is fulfilled. Existing T09
submitted/accepted statuses are retained; `fulfilled_quantity` records shipment
progress without altering order-submission status or forwarding behaviour.

A timeout, exception, malformed/GraphQL-error result or crashed worker keeps units
reserved for reconciliation. A failed receipt-save transaction leaves the spent
marker intact. A definitive Shopify user-error rejection releases tracking units
but its original parcel key stays spent. No raw Shopify/supplier errors are saved.
T11 owns operator presentation/alerts; T10 adds no queue or alert transport.

### T10 remaining connections and decisions

- Toby/Lifty: confirm supplier tracking transport, stable parcel identifiers and
  incremental shipped SKU/quantity evidence. If duplicate SKUs can appear in one
  supplier order, confirm a reliable supplier-to-order-line identifier before
  supporting those shipments. The TropShip transport remains an explicit TODO.
- Bind approved private SQL persistence and apply T09/T10 migrations only with
  separate approval. T10 SQL is statically inspected and client-mocked, not run
  against PostgreSQL or any hosted database.
- Bind the fresh paginated Shopify reader and restricted injected mutation client
  using API 2026-07; confirm fulfillment permissions/location ownership. The client
  must return the GraphQL envelope and must never automatically retry writes.
- Approve cron credentials/scheduling and exact activation separately. No env
  files, secrets, flags or live services were changed or accessed.
- Complete supervised staging full/partial fulfilment and actual Shopify shipping
  email evidence after approval; hosted CI is not run here. Reconcile uncertain
  attempts in Shopify before any separately approved manual correction.

T10 local verification:
```sh
node --experimental-strip-types --test tests/harness-tracking.test.mjs tests/harness-order-forwarding.test.mjs tests/harness-stock-price.test.mjs tests/supplier-feed.test.mjs tests/product-mapping.test.mjs
npm run typecheck
npm run check:live-boundaries
```

API contract reference: [Shopify fulfillmentCreate, 2026-07](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/fulfillmentCreate).

T10 result (12 October, local): 261 focused Node tests passed, 0 failed/skipped
(65 new tracking checks); TypeScript and changed-file ESLint passed;
`check:live-boundaries` passed with 0 violations. Hosted CI/real-service
acceptance is outstanding; a read-only draft PR lookup could not connect to GitHub.


## T11 manual queue and alerts (offline, default OFF)

`manual-queue.ts` provides an injected private SQL store, failure reporter and pure
`buildDailyDigest` builder. The static `202610120021_manual_queue.sql` migration
requires the T08 private schema; it has not been applied to any database. Browser
roles have no access; server operations use a restricted injected client.

Stock/price failures call `reportFailure` only behind the existing write flag;
order holds and tracking holds call it only when their existing job flag is ON.
`HARNESS_MANUAL_QUEUE_ENABLED` must be exact `true` to enqueue. Independent
`HARNESS_ALERTS_ENABLED` must be exact `true` to send. Both default OFF. When
constructing `createFailureReporter`, explicitly pass those env values and a
reviewed injected email or Slack sender; no runtime sender is bound here.
Suggested credential/recipient names only: `HARNESS_ALERT_EMAIL_TO`,
`HARNESS_ALERT_EMAIL_TOKEN`, `HARNESS_ALERT_SLACK_WEBHOOK_URL`. No values are read,
logged, written or configured by the reporter. No real alert is sent by tests.

A failure is queued before the alert call. Alerts contain only queue ID, job and
safe reason code. References are hashed for deduplication, never saved in plain
text. Stock run timestamps, order identity and tracking parcel identity correlate
incidents. Validated Shopify order IDs (when available) and supplier IDs are
private operator context on the page; they are omitted from alert text. A new stock/tracking-fetch run can create a new incident; the same
order/parcel/reason does not reopen a done item or send another alert. Supply a
stable `runReference` for replayed tracking fetch runs. No provider errors,
addresses, costs or supplier credentials appear in queue rows or alert text.

The sender is called immediately, with a default 10-second wait bound (maximum
60 seconds). Missing, failed or timed-out delivery leaves the item open and
returns `alert_failed`; queue-save failure returns `queue_failed`. Jobs expose
safe reporting failure codes/status. There is no automatic alert retry; a late
transport may still deliver. The injected sender must enforce its own network
cancellation/timeouts. Live delivery within five minutes still needs approved
transport and actual delivery evidence. Process crashes between queue persistence
and sending are not a delivery guarantee; the daily open-item digest is the
operator fallback once its separately approved schedule/sender is connected.

`/admin/harness` is an HTML route with same-origin mark-done forms and real HTTP
403 responses before queue access for missing/non-admin identities. It uses
no-store headers and HTML escaping. `markDone` is conditional on open status and
records actor/time. It closes review only; it never clears spent markers,
releases stock reservations or resubmits orders/fulfilments.

No existing admin permission helper/table/policy was found in this checkout.
The exported route reuses `createServerSupabase`/`auth.getUser` for sign-in but
**denies every user** until a reviewed server-owned admin check is supplied.
The disabled route does not call authentication services. The injected handler
is fully testable with admin/non-admin identities and a queue store. Never use
user-editable metadata or email matching as the admin permission source.

`buildDailyDigest` accepts open/done items, absorbed supplier-shipping pence and
order-dispatch evidence progress from approved private sources. It renders open
reason counts, £ totals and evidence days; it does not invent totals, read data,
send or schedule anything. The intended 08:00 daily schedule remains unconfigured.

### T11 decisions / remaining connections (Toby or Lifty)

- Confirm server-owned admin membership and operator access; bind its check.
- Approve static migration application and bind a restricted private SQL client.
- Choose email, Slack or both, recipients/channel and approved transport/credentials;
  bind the reporter to jobs without changing their existing activation requirements.
- Bind trusted absorbed-shipping/evidence totals and approve daily schedule/timezone.
- Define operator reconciliation/sign-off procedure for held orders/fulfilments;
  mark-done alone is never permission to repeat an uncertain operation.
- Separately approve activation and real five-minute delivery verification. Hosted
  CI, hosted SQL and real-service acceptance are not covered by local mocks.

Local checks: Node runner `tests/harness-manual-queue.test.mjs` with the T08–T10,
supplier-feed and product-mapping tests; TypeScript, changed-file ESLint and
`npm run check:live-boundaries`. No env files or live flags changed.

T11 local result (12 October): 296 focused Node tests passed (35 new), zero
failed/skipped. TypeScript, changed-file ESLint, live boundaries (0 violations)
and whitespace checks passed. Changes remain uncommitted on `codex/t11`.
