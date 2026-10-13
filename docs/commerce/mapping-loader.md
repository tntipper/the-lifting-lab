# Saved mapping loader

`withStorePrices` is the shared server enrichment point for catalogue, detail,
comparison, cheapest/category and product API loaders. It reads mappings whenever
`NEXT_PUBLIC_TLL_STORE_LINKS=enabled` outside synthetic-preview/staging, independently
of `NEXT_PUBLIC_TLL_STORE_PRICES`. It calls `connection()` before enrichment so page
and in-memory catalogue caches cannot preserve revoked mapping authority.

`store-mapping-server.ts` follows the existing server filename convention and rejects
privileged reads in a browser. `createStoreMappingReader` uses a cookie-free Supabase
service-role client, with session persistence/refresh disabled and no-store transport.
The reader and loader clock are injectable for offline tests.

## Database and public data

The repo does not configure PostgREST exposure of `tll_mapping_private`. Migration
`202610130001_store_link_mapping_reader.sql` adds the read-only public RPC
`tll_store_link_mapping_rows(product_ids text[])`. Its security-definer function uses
a fixed `pg_catalog` search path, a qualified private table, exact comparison IDs,
and `active=true AND status='store'`. Execution is revoked from public, anon and
authenticated and granted only to service_role. No private schema exposure is needed.
The migration is prepared here, not applied to any database.

The RPC enumerates only identity/review columns needed for link validation; it never
reads cost_ex_vat, price_auto, EAN or timestamps. Supplier identity fields remain on
the server. `StoreMappingRow` omits cost fields. Export/commercial validation in
`toExactMapping` still validates full saved rows; link presentation validates the
review and identity without requesting private costs.

Only `presentStoreLinkMapping(row, now)` is attached to `product.storeLinkMapping`.
It whitelists product ID, Shopify handle/variant, active/approved and the five review
fields. Extra review JSON properties are omitted. Raw rows, approval references,
supplier identities/SKUs and costs never enter browser product data.

## Environment variables

| Variable | Purpose |
| --- | --- |
| NEXT_PUBLIC_TLL_STORE_LINKS | Exactly `enabled` enables saved mappings/store links. |
| NEXT_PUBLIC_TLL_STORE_PRICES | Exactly `enabled`, with links enabled, enables Shopify price reads. |
| NEXT_PUBLIC_TLL_ENVIRONMENT | `synthetic-preview` or `staging` keeps both paths inert. |
| NEXT_PUBLIC_SUPABASE_URL | Server reader's Supabase endpoint. |
| SUPABASE_SERVICE_ROLE_KEY | Server-only RPC credential; never public. |
| TLL_STOREFRONT_SHOP | Existing Shopify `.myshopify.com` endpoint for price reads. |
| TLL_STOREFRONT_PRIVATE_TOKEN | Existing server-only Storefront price credential. |

No environment/config activation was performed. Once the migration and approved
rows are available, the existing flags control behaviour. With both flags enabled,
a fresh (<15 minute) in-stock Shopify price lets `resolveProductOffer` produce
`https://shop.theliftinglab.co.uk/cart/{variant}:1` with product attribution and the
existing component displays “Buy at TLL Store”. With prices disabled, the approved
mapping produces `/products/{handle}?variant={variant}` with the same attribution.

## Fail-closed rules

Missing credentials, reader errors and invalid RPC responses yield no mappings and
produce no sensitive logs. Incoming cached mappings are replaced, including with
null when saved authority is absent. More than one active store row for a comparison
product rejects that product even if only one row is approved. Other products can
still map. No title matching or CSV fallback exists.

Inactive/non-store rows, absent approval reference, non-exact/non-verified-label
mappings, unapproved/version-mismatched/future/expired reviews, invalid handle/IDs,
and inconsistent formula/flavour/pack identity all produce null. Existing catalogue
holds and unavailable/stale Shopify stock continue to use existing purchase rules.
When links are disabled or the environment is isolated, enrichment makes no reads.

## Local test evidence — 13 October 2026

- Requested five-file Node suite: **209 passed, 0 failed** (15 new loader tests).
- Assessment-display suite after adapting its saved-row provider fixture:
  **49 passed, 0 failed**. Existing Storefront loader fixtures now supply saved
  review evidence instead of trusting a pre-attached mapping.
- `npm run typecheck`: passed. `npm run lint`: passed, 22 existing warnings.
- Activation manifest regenerated (source-tree aggregate 108 → 109 files).
  Activation and hosted-baseline `--check`: passed; hosted baseline unchanged.
- Final `npm test`: **4,030 tests; 3,994 passed, 28 failed, 8 skipped**.
  No mapping/offer/price/assessment tests failed. Log: `/tmp/h-full-final.log`.

Tests cover loader → offer resolver → rendered Buy label, cart attribution, prices-off
fallback, missing/inactive/expired/duplicate mappings, reader exceptions and RPC
failures/missing credentials, public-field privacy, and isolated/disabled operation.
The RPC privilege/query contract is checked statically. Actual database migration
execution and hosted CI remain unverified; no live services were called.

### Full-suite local blockers

| Count | Tests / cause |
| --- | --- |
| 8 | auth-flow (1), local-supabase-relay (5), Gen23 checkout-observer (2): loopback listen EPERM. |
| 6 | Gen22 process-binding (1), provider-broker recovery (1), REST worker boundary (1), rotation process-control (3): process inspection/start EPERM. |
| 11 | Gen23 final-postgres (1), owner-successor database-acceptance (2), default-qualification (7), native-control-acceptance (1): Docker socket denied / dependent synthetic PostgreSQL fixture unavailable. |
| 1 | Gen23 whole-process-offline: child reported KILLED instead of EXITED; local process-limit fixture remains blocked, exact subcause unverified. |
| 1 | Gen22 keychain-reader: Python startup confstr warning changes the expected error output. |
| 1 | Gen23 browser-origin-contract: Chrome exits SIGABRT in this environment. |

These are outside the mapping-loader scope. Rerun them in a host with Docker,
loopback/process permissions and working Chrome/Python; do not weaken assertions.
Hosted CI and applied-migration verification still need a capable authorised runner.
