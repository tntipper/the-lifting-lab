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
- Order submission is explicitly rejected as unimplemented (T09); tracking throws a
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
