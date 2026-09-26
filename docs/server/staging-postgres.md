# Disabled staging PostgreSQL transport

`createStagingPostgresRuntime` is a Node-only infrastructure factory. Importing the module, constructing its default-disabled result, and closing an unused result open no connection. It does not load passwords from an environment map or credential store, provision a LOGIN, change SQL controls, mount a route, make a provider request or permit production use. The source pins the approved public staging endpoint identifiers; all passwords and application encryption keys remain separately injected server secrets.

The options are `purpose: 'customer' | 'cart' | 'broker' | 'provisional' | 'bridge'`, optional `enabled` (default false), an injected `password`, and optional `tlsCa: {pem, sha256}`. The result contains `{enabled, pool, close}`. `pool.connect()` exclusively leases an idle client with `query(text, values?)` and `release(destroy?)`. Both existing repository interfaces accept this structural contract. There is no pool-level query method, URL input, arbitrary username, driver query-config object, named prepared statement or automatic retry. The caller owns explicit BEGIN/COMMIT, statement parameters and acknowledgement handling.

The five explicit purposes select distinct runtime usernames: `tll_customer_runtime`, `tll_cart_runtime`, `tll_broker_runtime`, `tll_provisional_runtime` and `tll_bridge_runtime`, each suffixed with `.qdmvngjwkcsilzmqksme`. They use `aws-0-eu-west-2.pooler.supabase.com:6543`, database `postgres`. The purpose allowlist rejects unknown and inherited object-property names before driver creation. Provision each LOGIN separately with membership only in its reviewed executor/gateway; the bridge identity must receive only bridge-executor authority, never broker/provisional executor membership. Never combine repository authority or use a platform administrator as the mounted runtime identity. Adding these transport identities does not create the roles or their credentials. Mounting code must compare its Auth URL, environment marker and vault purpose/project binding to exported `STAGING_POSTGRES_PROJECT_REF`. Explicitly enabling this transport allows connection attempts only; application gates, database controls and any provider activation remain separate.

## TLS and configuration

TLS requires certificate-chain verification, exact host verification/SNI and TLS1.2 or later. There is no insecure switch. A supplied public CA must be one PEM certificate, have a valid X.509 CA designation and current validity period, and match its independently reviewed SHA256 fingerprint over certificate DER. The factory does not obtain CA bytes from a path, fetch URL, or environment variable. If no CA is supplied, strict Node trust is used; it may reject this hosted pooler's chain. The public CA source, fingerprint and actual hosted trust/hostname acceptance must be verified before mounting. Never resolve a trust failure by disabling certificate verification. Key/password/CA rotation requires replacing and closing the runtime; there is no ambient reconfiguration.

All nonempty `PG*` environment settings, native-driver forcing and `NODE_TLS_REJECT_UNAUTHORIZED=0` cause an enabled factory/acquisition to fail closed. This prevents inherited host, password, replication, SSL or startup options from filling any driver's omitted defaults. A host with no `process` object, or a `process` without `process.env`, has none of those Node overrides. Supabase Edge Deno is that case: the check does not throw, and the host is treated as safe. When `process.env` is present, Node and Vercel behaviour is unchanged. No environment values are printed. Connection strings are never parsed or accepted, because their SSL parameters can override a supplied TLS configuration. Only the purpose and validated secret/CA fields are copied into the driver config; extra caller fields cannot change destination or TLS.

`pg` is pinned to 8.23.0 and `@types/pg` to 8.23.1, resolved from the primary npm registry with npm11.19.0. The implementation uses documented `getTransactionStatus()` to require an idle backend before checkout/reuse. It disables query pipelining, keeps positional values separate from SQL, and sends no named prepared statements. Transaction pooling cannot promise session affinity across transactions: use one leased client for each explicit transaction and avoid session-level state, LISTEN, SQL PREPARE or other affinity assumptions. The generic trusted SQL transport is not itself a SQL allowlist; each repository remains responsible for its fixed operations and database least privilege.

## Bounds and failure semantics

| Bound | Value |
| --- | ---: |
| Pool size per runtime/warm process | 1 |
| Pending acquisitions per runtime | 2 |
| Driver connection/queue timeout | 3 seconds |
| Outer acquisition deadline, including driver creation | 4 seconds |
| Server statement / lock / idle transaction timeouts | 10 / 5 / 15 seconds |
| Client query deadline | 12 seconds |
| Whole leased-client lifetime | 30 seconds |
| Idle client expiry | 10 seconds |
| Client maximum age / reuse count | 300 seconds / 100 uses |
| Close acknowledgement deadline | 2 seconds |

An idle pool error is handled without logging raw driver objects. A leased-client error, query rejection/timeout, simultaneous use or malformed query discards the client. `release(true)` is idempotent; a normal release also discards any client with an active/aborted/unknown transaction or outstanding query. Acquiring a dirty session never exposes it. Late acquisition success is destroyed after its deadline or close, and late query results are discarded. Close cancels pending/active work and awaits driver shutdown within its bound; if a late constructor cannot finish in that window, close rejects and its later cleanup is still attempted. It does not report a hung shutdown as complete.

Every outward error is the fixed, data-free `Staging database unavailable`, without raw causes, SQL, binds, host error text or credentials. No failed statement/COMMIT is retried. A destroyed connection does **not** prove a statement or COMMIT did not execute: repository nonce receipts, fences and uncertainty holds remain required. This module adds no metrics sink or automatic incident notification. Operator monitoring should record a coarse outcome outside this module, without logging raw clients/configuration or secrets. JavaScript strings cannot be reliably erased from process memory; secret custody and process lifecycle remain operational responsibilities.

## Verification and remaining gates

Run the portable offline suite with `node --test tests/staging-postgres.test.mjs`. It uses a trusted injected driver and simulated deadlines, tests disabled/import laziness, configuration/environment refusal, TLS hostname/public-CA validation, private errors, client/idle failures, late resolution, dirty transactions, queue bounds and cleanup. The injection is an explicit fixture seam, not a sandbox or a route-exposed alternate connection setting.

`node tests/staging-postgres/local-acceptance.mjs` uses the **already approved** local `tll-stage0-postgres` container and marked `tll_customer_repository` database. It verifies the local Docker endpoint and exact `127.0.0.1:55432` publication, requires database control disabled, and changes no permanent table/role/data. Only a temporary table is created and dropped within the test. Its injected actual `pg.Pool` deliberately selects the known synthetic loopback identity and plaintext local fixture instead of the production factory's immutable TLS endpoint. This proves the real driver contract, parameter binding, committed idle reuse, dirty-transaction discard, query-error suppression and fresh-session recovery. It does **not** prove hosted CA trust, Supavisor startup-GUC support, deployed bundling, runtime LOGIN grants or cross-purpose denial; those require separate approved staging acceptance. No customer data, credentials or hosted requests are used here.

Primary references: [pg client configuration and transaction status](https://node-postgres.com/apis/client), [pg pool lifecycle and errors](https://node-postgres.com/apis/pool), [pg TLS configuration](https://node-postgres.com/features/ssl), [Supabase connection modes and transaction-pooler constraints](https://supabase.com/docs/guides/database/connecting-to-postgres).
