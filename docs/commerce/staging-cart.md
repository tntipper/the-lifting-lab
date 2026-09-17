# Anonymous staging cart acceptance slice

This is an explicitly enabled, synthetic-only cart path. It adds an opaque local session, server-side Storefront cart operations, a responsive cart dialog/page, and gated actions in the header, product offer component and manual stack. It is not customer-account binding, checkout, production commerce approval or a delivery quote. No checkout URL, customer token, buyer email, Shopify cart ID/key, database password or Storefront credential is returned to the browser.

The one server-owned mapping is app fixture `40000000-0000-4000-8000-000000000001` to Shopify variant `57160491139412` / product `15768467472724`, only at `tll-integration-staging.myshopify.com`. The client supplies the app fixture ID and a desired quantity, never provider identity or price. Both the variant read and mutation response must confirm the exact IDs, availability, positive GBP unit price and consistent line/subtotal; foreign items, discounts, warnings, truncated lines, zero price and malformed results fail closed. This deliberately small test slice allows one line and quantities 0–5.

## Transport and enablement

Ordinary production and synthetic preview behavior is unchanged when the UI flag is absent. The cart handler returns 404 when any environment gate is absent; existing synthetic-preview middleware still returns its inert 503 for all API calls. Enabling the UI alone cannot enable a provider request. All required values are server configuration, never request parameters:

- Public flags: `NEXT_PUBLIC_TLL_ENVIRONMENT=staging`, `NEXT_PUBLIC_TLL_STAGING_CART=enabled`.
- Server flags: `TLL_STAGING_CART_ENABLED=true`, actual Vercel preview (`VERCEL=1`, `VERCEL_ENV=preview`).
- `TLL_STAGING_CART_ORIGIN`: exact approved HTTPS deployment origin, and `TLL_STAGING_CART_SHOP`: the fixed synthetic shop.
- `TLL_STAGING_SUPABASE_PROJECT_REF` / `NEXT_PUBLIC_SUPABASE_URL`: the explicitly approved staging project; production ref is rejected.
- Distinct server-injected `TLL_STAGING_CART_VAULT_KEY_HEX` and `TLL_STAGING_CART_HMAC_KEY_HEX`, each a fresh 32-byte key, plus `TLL_STAGING_CART_VAULT_KEY_ID`.
- `TLL_STAGING_CART_STOREFRONT_TOKEN`: a private Storefront token for that development shop only.
- `TLL_STAGING_POSTGRES_CA_PEM` and `TLL_STAGING_POSTGRES_CA_SHA256`: the independently verified public Supabase root CA and its DER SHA256 fingerprint. Both are mandatory for this route. The factory verifies the certificate, fingerprint, chain and hostname; the route never fetches a CA or disables TLS verification.
- `TLL_STAGING_CART_DATABASE_PASSWORD`: a dedicated cart PostgreSQL runtime credential using the shared, default-disabled staging pool factory. It must have only the cart executor membership. Do not substitute a service role key, customer runtime credential or JWT signing key.

The route does not fetch or provision these credentials. Missing values leave it unavailable. No environment values or provider/SQL error bodies are logged. `migration 006` is an operator-reviewed staging artifact, not automatic runtime setup; its control remains false, no LOGIN role or runtime gateway membership is provisioned, and it requires both an explicit staging context and the existing operator-bound staging marker. The installing database administrator retains table/control ownership (as in inventory 004) and one explicit ADMIN-only membership on the gateway with INHERIT FALSE / SET FALSE. This permits a later reviewed grant/revoke to a separate runtime LOGIN; it does not grant effective gateway use or owner-role membership. Gateway/runtime roles cannot read private tables or change the control. This differs from 005's narrower operator-function interface. Applying it requires the narrow operator GUCs `tll.cart_migration_environment=staging` and `tll.cart_expected_project_ref=<approved staging ref>`.

## Session, request and concurrency protocol

`GET /api/cart` reads an existing session and returns a safe projection. With no cookie it returns empty capability metadata without creating a local or Shopify cart. `POST {action:"open"}` commits a local empty session, then sets a random 32-byte `__Host-tll-staging-cart` cookie (Secure, HttpOnly, SameSite Strict, Path `/`, 24 hours). Only the cookie hash is stored. The browser receives a session/actor-bound CSRF token, not that cookie or the Shopify ID.

`PATCH {productId,quantity,revision}` sets the desired quantity; `DELETE {productId,revision}` removes the line. Both require the matching Origin, custom intent header, per-session CSRF token, UUID idempotency key and current revision. Request bodies, cookies and permitted fields are bounded. Method/path/query and same-origin checks happen before auth/database/provider work. Unknown inputs are rejected rather than interpreted as provider instructions.

`POST` accepts only the exact `{action:"open"}` body. Any other POST body, including an otherwise valid PATCH-shaped quantity change, returns 400 before authentication, repository or Storefront work.

Every request verifies the current Supabase user. The stored actor hash binds the cart to either a guest context or that verified identity. Sign-in, sign-out or switching to another account invalidates the prior context and clears its cookie. The UI discards late responses from the previous identity. This is still a session cart: there is no cross-device retrieval, buyer identity association or automatic merge. An expired or changed session must be opened anew; an old account's contents are not transferred.

Migration 006 reserves a request atomically before any Storefront write. The four fixed, parameterized RPC calls use an exclusive PostgreSQL connection with explicit BEGIN/COMMIT. No record, reservation or decrypted provider ID is released until COMMIT is acknowledged. Any BEGIN/SELECT/COMMIT failure destroys that connection; there is no automatic SQL retry. The durable reservation, expected revision and per-session request receipt prevent concurrent tabs or a new nonce from bypassing an outstanding write. Replayed request IDs do not send another Storefront mutation. A 45-second lease expires to a hold, not a retry. There are hard synthetic limits of 100 sessions and 100 operations per session; reaching them requires operator inspection, not silent deletion of unresolved carts. Disabling the control yields an unavailable repository without clearing the browser's existing capability, so a controlled resume does not silently replace a saved cart.

Admission is checked after acquiring the open-session advisory lock or existing session row lock. Each RPC then reads the control with `FOR SHARE`, retaining that lock through COMMIT; missing control also fails closed. A committed operator disable rejects requests still waiting for admission. If an RPC has already passed admission, disabling waits for its transaction to end. Commit disable in a separate short transaction before taking session locks for maintenance. The function owner has only the additional column privilege needed for this locking read; an UPDATE policy with `WITH CHECK(false)` still forbids its actual control updates, and the gateway has no direct access. Session expiry is evaluated against the database clock after both resource and control lock waits. These are database admission boundaries: expiry or disable cannot cancel Storefront work permitted by an earlier committed reservation, even if that work begins later. Such work may remain unresolved while disabled and must follow the existing hold/reconciliation protocol.

Storefront requests use API 2026-07 with 8-second timeouts, manual redirects, private-token auth, no cache and bounded 64 KiB response reading. Cart IDs are encrypted with the shared AES-GCM envelope primitive, using a separate cart key and AAD binding purpose, staging project, shop, exact deployment, session hash and actor hash. This runtime supplies one active key; retiring or rotating it without a reviewed retained-key strategy makes existing carts unreadable and held. Do not replace keys casually.

An uncertain cart creation may have succeeded remotely without returning its ID. Shopify documents no lookup for this application's request ID, so the session remains held; it never automatically creates another cart. A known-cart mutation can be read afterward to show observed quantities/prices, but that read does not prove an older timed-out write cannot finish later. The hold remains and further edits stay disabled. A successful DB commit with a lost response is recoverable through GET; the client never blindly repeats the mutation. Operator reconciliation/reset and abandoned synthetic Shopify-cart cleanup remain explicit acceptance work.

## Customer-facing limits and local evidence

The cart shows plain listed GBP prices and item subtotals. Delivery/final taxes are explicitly unavailable; the agreed delivery-cost pricing policy is not inferred from this item subtotal. Checkout is absent. Uncertain states label their subtotal as an observation with an unresolved change. Controls have 44px minimum height, native dialog inertness, keyboard wrapping, Escape/dismissal focus restoration and an atomic live result region.

Run offline checks from the repository root with Node 24 and locked dependencies:

```sh
node --test tests/staging-cart.test.mjs
python3 tests/staging-cart/acceptance.py
TEST_BROWSER_CHANNEL=chrome node tests/browser/staging-cart.mjs
TEST_BROWSER_CHANNEL=chrome npm run test:accessibility
npm test
npm run typecheck
npm run lint
```

The Python acceptance uses only the existing local `tll-stage0-postgres` container and a newly created disposable `tll_staging_cart` database. It refuses any pre-existing database/roles of its names and removes only artifacts it created. It neither links to Supabase nor adopts a hosted database. CI may run the browser script without `TEST_BROWSER_CHANNEL` after installing Playwright Chromium. Tests use fresh headless profiles, synthetic local responses and no customer, checkout or provider calls. Viewport coverage is 320/390/768/1024/1280/1440; this is not screen-reader or native-device certification.

The browser fixture exercises the actual provider, shared product/manual-stack action, header, cart contents and native dialog. The existing accessibility fixture separately exercises the actual full StackBuilder/FAB and all prior assessment/outbox flows with the cart disabled. It does not claim a combined hosted account/cart journey. Local SQL checks exercise the real PG17 migration/reservations and role grants; injected connection tests cover explicit COMMIT loss, and provider tests cover create/update/remove/read failures. A hosted Cart API run, exact installed-scopes/version confirmation, dedicated runtime provisioning, migrated-control enablement, multi-device account binding, actual delivery/tax policy and checkout acceptance are still required before any wider release.

## Primary implementation references

- [Next15 route handlers](https://nextjs.org/docs/15/app/api-reference/file-conventions/route) and [cookies](https://nextjs.org/docs/15/app/api-reference/functions/cookies). The repository's requested bundled Next docs directory was absent, so official versioned docs were used.
- [Shopify cart management and cart key secrecy](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage).
- [Storefront cartCreate](https://shopify.dev/docs/api/storefront/latest/mutations/cartCreate), [Cart](https://shopify.dev/docs/api/storefront/latest/objects/Cart) and [cartLinesUpdate](https://shopify.dev/docs/api/storefront/latest/mutations/cartLinesUpdate). The adapter pins 2026-07 and checks the actual response version; `latest` links may advance.

## Recorded local acceptance

The implementation candidate passed 28 focused cart tests, 27 real PG17 SQL checks, the new cart browser fixture at all six widths, the prior accessibility fixture at all six widths, full 873 unit tests, type checking and lint (zero errors; six pre-existing warnings). The actual Next build/runtime harness also passed with all external connections blocked, including inert synthetic-preview GET/PATCH cart requests. The build cannot substitute for an enabled hosted cart run. The shared runtime's separate driver/TLS checks are recorded in its own documentation.

The 17 September follow-up reproduced a valid mutation accepted as POST, all three existing-session RPCs accepting expired state after an unchanged-row lock wait, and an open/claim succeeding after an acknowledged disable while waiting for its resource lock. The corrected unapplied migration 006 and handler pass 29 focused cart tests and 44 real PG17 checks. The added SQL cases use observed PostgreSQL lock barriers, cover both session and control waits, prove disable waits for admitted work to commit, and verify missing-control and privilege denials. Type checking and focused lint also pass. These are local synthetic results; no hosted migration, runtime provision or provider call was performed.
