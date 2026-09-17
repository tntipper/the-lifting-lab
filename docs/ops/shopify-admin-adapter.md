# Shopify inventory adapter foundation

`lib/commerce/shopify-admin.ts` supplies exact inventory reads, reviewable change plans, guarded dispatch and explicit reconciliation. Nothing imports it into a route or scheduled worker. It reads no environment variables and has no default network transport. Mutations default to disabled. No real shop, token or supplier data is included in its tests.

## Verified API contract

Checked against official Shopify documentation on **15 September 2026**. `2026-07` is the current stable Admin API version. The endpoint is fixed to `/admin/api/2026-07/graphql.json`; a missing or different `X-Shopify-API-Version` response header causes HOLD, including Shopify's automatic fallback from a retired version. [Shopify API versioning](https://shopify.dev/docs/api/usage/versioning).

The version-selected `InventoryQuantityInput` schema has `changeFromQuantity`, `inventoryItemId`, `locationId` and `quantity`. This adapter always supplies an integer `changeFromQuantity`; it never supplies `null` to bypass concurrency protection. The official change notice removes `compareQuantity` and `ignoreCompareQuantity` in `2026-04`, although the mutation overview still contains legacy prose/examples. [2026-07 input schema](https://shopify.dev/docs/api/admin-graphql/2026-07/input-objects/InventoryQuantityInput), [Shopify migration notice](https://shopify.dev/changelog/finalizing-compare-and-swap-redesign-for-inventory-set-quantities).

The inventory mutation requires `@idempotent(key: $idempotencyKey)` from `2026-04`. A UUID operation ID supplies the key, and a SHA-256 hash binds the complete ordered request to its fixed endpoint. Shopify retains keys for 24 hours, can reject concurrent duplicate requests, and can reconstruct cached responses from subsequently changed records. A matching quantity after an uncertain request therefore does not prove that this operation wrote it. [Inventory mutation](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/inventorySetQuantities), [Idempotency behaviour](https://shopify.dev/docs/api/usage/implementing-idempotency).

Shopify currently redirects some explicit `2026-07` documentation links to pages labelled `2026-07 latest`. The implementation follows their displayed field definitions and the dated migration notice. No authenticated schema introspection or hosted execution was performed; those remain acceptance gates.

## Capabilities and access

| Operation | Capability | Access needed |
| --- | --- | --- |
| `readTarget(binding)` | Read exact shop, parent product, variant, inventory item and one location; return an immutable observation | `read_products` and `read_inventory` |
| `prepareChange(input)` | Validate reviewed mapping, inventory binding, source-of-truth policy and `StockProjection`; construct one absolute `available` change | Local operation; no API call |
| `describePreparedPlan(plan)` | Export frozen exact request/binding/provenance for an issued, still-prepared plan; never restore execution authority | Local operation; no API call |
| `executeChange(plan)` | Dispatch a previously issued, unexpired plan once when explicitly enabled | `write_inventory` and the user's inventory-update permission, plus read access for the selected result fields |
| `reconcileChange(plan)` | Perform a new exact read; distinguish acknowledged-and-observed from uncertain or diverged outcomes | Same read access |

The selected product fields require `read_products`. Inventory levels and changes require `read_inventory`. The location object also accepts `read_inventory`; this query does not separately require broader location management. Confirm actual app scopes and merchant permissions in a development store before enabling a transport. [ProductVariant](https://shopify.dev/docs/api/admin-graphql/2026-07/objects/ProductVariant), [InventoryLevel](https://shopify.dev/docs/api/admin-graphql/2026-07/objects/InventoryLevel), [InventoryChange](https://shopify.dev/docs/api/admin-graphql/2026-07/objects/InventoryChange), [Location](https://shopify.dev/docs/api/admin-graphql/2026-07/objects/Location).

No price writer, `productSet`, product deletion, inventory activation, backorder setting, order request, customer lookup or supplier call exists here. The prior operational scripts are handoff evidence, not a runnable or approved integration: their feed-stock metafields cannot establish reconciled Shopify inventory.

## Data and execution controls

The trusted server configuration binds one exact `*.myshopify.com` hostname, Shopify shop ID and location. Operation inputs cannot override host, path or API version. URLs with custom domains, extra DNS labels, ports, credentials, encoded delimiters or redirects are rejected. The injected transport must preserve standard fetch semantics, HTTPS certificate verification and `redirect: manual`; do not wrap it with hidden mutation retries or logging of headers/bodies. Error results contain fixed codes, not provider messages or tokens. Responses are bounded to 1 MiB, require complete JSON, and never accept partial GraphQL data with errors as success.

`ShopifyInventoryBinding` extends the existing exact product/variant identifiers with reviewed inventory-item/location IDs and the expected Shopify SKU. Shopify and supplier SKUs remain separate. The binding version must match the `ExactMapping` review. Formula, flavour, label and pack identity must agree across that mapping. The existing `StockProjection` must be reviewed, fresh, tied to the same variant/supplier SKU/pack, and based on `reconciled_sellable_units`. Raw feed stock never supplies write authority. Cost, price and research scores are not inputs to inventory changes.

This first adapter supports active, tracked, non-bundle variants with `DENY` inventory policy and an active level/location. An inventory item must link to exactly the expected single variant; shared or truncated variant connections remain HOLD. It changes only `available`, using reason `correction`. The separately reviewed policy must establish this system as the inventory source of truth and bound quantity/change size. Missing levels remain `null`, not zero. A negative observed quantity may be retained for CAS; desired available stock must be a nonnegative integer. Equal known quantities produce a no-op. Reads preserve the current `UNLISTED` product status, but this first write policy holds it alongside draft/archived products. [ProductStatus schema](https://shopify.dev/docs/api/admin-graphql/2026-07/enums/ProductStatus).

Observation age starts before the request, so transport, parsing and review time never refresh evidence. Plan expiry is the earliest mapping, binding, stock or policy expiry and stock/read freshness boundary. Plans and observations are immutable and accepted only by their issuing adapter instance. A caller cannot fabricate an observation, copy a plan, change its CAS value or inject arbitrary GraphQL.

## Reconciliation and remaining runtime work

The adapter itself provides an in-process, one-attempt guard and one pending operation per inventory-item/location. The separate [inventory operation ledger](inventory-operation-ledger.md) now persists its exact prepared manifest and adds transactional claims, a committed attempt boundary and conservative read/hold recovery. It is unconnected and disabled by default. Recreating an adapter still loses its executable plan authority; exporting a manifest does not restore it. Hosted and operational acceptance remain required before enabling dispatch.

Successful HTTP transport is not business success. Top-level GraphQL errors, missing fields, malformed bodies, user errors and mismatched adjustment details cannot yield `acknowledged`. Only an exact returned adjustment plus an additional read showing the intended state yields `reconciled`. That state is a point-in-time observation, not a guarantee against later sales or stock changes.

No mutation is automatically retried. A lost response keeps the target held even when a reread matches the desired quantity, because causality is unknown. CAS conflicts and diverged rereads require operator review. The adapter exposes no reset or forced-write method. The durable worker rereads uncertain attempts and holds the target; it does not retry or generate a replacement key. Shopify's retention boundary and the inability to establish causality from a matching quantity still apply.

Next acceptance steps, still pending:

1. Supply reviewed store/location/variant/inventory bindings and verify scopes with exact development-store reads.
2. Confirm the selected fields and `changeFromQuantity`/`@idempotent` operation against the pinned hosted schema, including inactive/shared inventory behaviour.
3. With an explicitly authorised synthetic development-store fixture, verify one CAS success, one intervening-change conflict, actual adjustment IDs/results and a fresh reread. Simulate response loss through a controlled transport.
4. Validate and deploy the separate durable ledger, then add operational hold resolution and monitoring before connecting supplier schedules. The supplier feed and its commercial/stock approvals remain held.

Synthetic tests cover identity mismatches, SSRF forms, unknown quantities, stale evidence, API fallback, partial/truncated/error responses, concurrent requests, exact adjustment reconciliation and disabled-by-default dispatch. Hosted acceptance is **pending**.

Validation for this foundation: 108 adapter tests pass; the ledger document records its additional validation; TypeScript passes; repository lint has zero errors and six existing warnings outside these files. No build or hosted-operation claim is made for this unconnected server module.
