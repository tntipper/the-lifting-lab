# Customer Account orders reader

`lib/identity/customer-orders.ts` is a server-only, default-disabled transport boundary for the Shopify Customer Account API 2026-07. It is not mounted to a route and cannot obtain, refresh or select a token. A future fenced account-operations gateway must supply one already-claimed access token from encrypted custody.

The reader sends one fixed POST to the staging shop Customer Account GraphQL endpoint. Its fixed query returns at most ten recent orders and ten line items per order. It requests no customer email, address, phone, payment information, status URL or provider IDs and performs no mutation. The browser-safe projection contains an order reference, timestamp, allowlisted financial and fulfillment statuses, exact GBP pence, bounded item names/quantities and truncation flags.

Transport uses TLS through the runtime, manual redirects, omitted credentials, no cache, a 5-second default total deadline and a 64 KiB body limit. Non-200, redirect, compressed, malformed, oversized, invalid UTF-8, GraphQL-error, unexpected status/currency or ambiguous money responses fail closed as an uncertain read. There is no retry. Errors contain neither the token nor provider response details.

Shopify documents the authenticated [Customer Account API endpoint](https://shopify.dev/docs/api/customer/latest) as `https://{shop-domain}/customer/api/2026-07/graphql`; the [Customer orders connection](https://shopify.dev/docs/api/customer/latest/objects/Customer) and [Order object](https://shopify.dev/docs/api/customer/latest/objects/Order) require the `customer_read_orders` scope and protected-customer-data approval. The OAuth `customer-account-api:full` token alone does not prove that shop-side permission. Activation must verify the installed Customer Account API permissions separately.

This unit does not establish token ownership, account binding, refresh, logout, pagination, hosted permission or a customer-facing order journey. Those remain responsibilities of the default-disabled account-operations repository/runtime.

## Source-only release coordinator

`lib/identity/customer-account-operations.ts` defines the repository contract and release ordering for the next migration. It obtains a fresh verified Supabase session, asks the repository to claim one exact order-read operation, and accepts provider token custody only when the committed claim repeats the same user, session, operation, receipt, fence and unexpired token lifetime. After the provider read it verifies the current Supabase session again. The projection is released only after the repository acknowledges finishing that exact claim.

A changed or expired session, provider failure, malformed claim or missing finish acknowledgement triggers one same-fence hold and releases no projection. The coordinator never retries the provider request, token claim or finish. It remains synthetic-only, default-disabled and unmounted; its repository is an interface, not yet a durable implementation.
