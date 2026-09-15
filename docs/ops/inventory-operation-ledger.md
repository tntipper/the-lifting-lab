# Durable inventory operation boundary

This foundation adds a private PostgreSQL ledger and a single-operation worker around the existing Shopify adapter. There is no deployed worker, schedule, environment-key reader, automatic stock feed, price/order writer or hosted database change. Both the database control row and the worker's `enabled` option default to disabled. Adapter mutations also remain independently disabled by default.

## Persisted evidence and dispatch

An issued prepared plan can be described through `adapter.describePreparedPlan(plan)`. Its frozen manifest includes the exact endpoint/request document and SHA-256, canonical shop/product/variant/item/location/SKU binding, binding hash, policy/mapping/stock review versions, formula/flavour/label/pack identity and original stock/read timestamps. It contains no access token or headers. Describing a clone, a foreign plan or an already-attempted plan returns HOLD. There is no restore, import, reset or retry API.

`enqueuePreparedInventoryOperation` stores the exact serialized manifest before a worker can attempt a request. The database verifies its hashes, unique JSON keys, exact shape, fixed 2026-07 endpoint/query, one item/location, non-null integer CAS and matching provenance versions. It permits no extra request headers or arbitrary GraphQL. The manifest, derived target/request fields and creation timestamps are immutable; event rows are append-only. These hashes prove consistency of recorded bytes, not external authenticity of a label, stock feed or review. A trusted worker credential can submit structured evidence; the existing adapter is still responsible for verifying the issued plan and business approvals.

Enqueue is idempotent only for the same operation ID and identical document bytes. Reuse of an ID with different evidence returns `operation_conflict`. A partial unique index permits one outstanding operation per stable Shopify shop-ID/inventory-item/location, including held work. No cost, customer identity, email, access token or session secret belongs in a manifest or event.

## State and crash behaviour

| State | Meaning | Next permitted action |
| --- | --- | --- |
| `queued` | Evidence committed; no claim | First claim while unexpired, or read-only recovery after expiry |
| `claimed` | Current fenced lease; no committed attempt marker | Confirm `begin_attempt` transaction, or begin a not-sent reconciliation |
| `attempted` | Attempt marker committed; request may or may not have been sent | Record acknowledgement/unknown/rejection and reread |
| `reconciling` | Current fenced lease and reconciliation token | Store an exact observation and complete or hold |
| `held` | Uncertain, rejected, divergent, or no original executable plan | Operator investigation; target remains unavailable for new jobs |
| `completed` | Current attempt acknowledged and fresh desired state observed | New separately reviewed operation may be enqueued |
| `cancelled` | Operator released held work that has never been attempted | New separately reviewed operation may be enqueued |

Claims use row locks and `SKIP LOCKED`; each lease has a worker ID and increasing fence. A live lease excludes competitors. Every state-changing worker call checks that identity, fence and database-clock expiry after locking the row. An expired lease can only be reclaimed as `reconcile_only`, even if its old process still holds the original adapter plan. There is no lease extension or automatic dispatch retry. PostgreSQL documents this locking approach for queue consumers. [PostgreSQL 17 SELECT locking](https://www.postgresql.org/docs/17/sql-select.html).

Before dispatch, the repository opens an exclusive idle connection, starts a transaction, explicitly sets `synchronous_commit = on`, records the attempt, and waits for COMMIT acknowledgement. Only then can the worker call the adapter. A lost COMMIT response returns `ledger_uncertain` and causes no send. A crash after that commit is conservatively considered possibly sent even if it actually happened before the network call. Every failed transaction discards its connection after best-effort rollback; a future runtime driver must honour the `release(discard)` contract. PostgreSQL durability also requires correctly configured persistent storage/WAL; this code cannot make an ephemeral database durable. [PostgreSQL WAL settings](https://www.postgresql.org/docs/17/runtime-config-wal.html).

Completion requires the current attempt fence, its validated adjustment-group acknowledgement, the adapter's successful reconciliation, and an additional exact read containing the full observation for the ledger. The read must start after reconciliation began and show the desired quantity with the same binding, active tracked non-bundle single-variant inventory and deny-backorder policy. A database/app clock discrepancy can cause a conservative hold. Completion describes a point-in-time observation, not permanent stock state.

Recovery never reconstructs an executable plan from JSON. A queued operation after a process restart, a reclaimed lease, unknown outcome, failed read, or desired state without proven acknowledgement goes to a hold. Stale workers cannot record an acknowledgement or finish after another fence claims the operation. A PostgreSQL fence cannot cancel an already-running HTTP request or prevent an old process from reaching Shopify after its lease expires. Keeping all uncertain/held targets occupied prevents this ledger from authorizing a competing mutation; Shopify CAS remains the remote state guard. Other systems and manual stock edits remain outside this ledger's lock.

Only the migration operator can call `cancel_never_attempted`, and only for held rows without an attempt marker. It requires an operator evidence UUID which is recorded in the event. The worker cannot call it or activate the control row. There is deliberately no function to release possibly-sent held work, reuse an old key, or declare causality from a matching quantity. Such cases require a separately reviewed operational resolution procedure. Do not delete ledger rows or bypass the outstanding-target index to clear a hold.

## Database authority

Migration `202609150004_inventory_operation_ledger.sql` requires PostgreSQL 17 and is a one-time, atomic migration; existing private schema or role names cause a collision error. Migration-role ownership of schema/tables is retained. NOLOGIN, NOINHERIT `tll_inventory_owner` owns the SECURITY DEFINER functions and receives only their required table grants; its search paths are empty and all relations are qualified. A transaction-only role helper removes PostgreSQL 17's automatic creator ADMIN membership before commit. The owner ends with no memberships or schema CREATE. [PostgreSQL SECURITY DEFINER guidance](https://www.postgresql.org/docs/17/sql-createfunction.html).

NOLOGIN `tll_inventory_worker` has only private-schema USAGE and an explicit worker-function allowlist. It has no direct table/column, configuration, cancellation or DDL grants. `anon`, `authenticated`, `service_role` and PUBLIC have no inventory privileges. The migration checks effective grants and memberships, including inherited/default ACLs, and aborts if any platform API role can reach the private authority. There is no public RPC wrapper or HTTP route.

Worker UUIDs/fences coordinate trusted processes; they do not create separate authentication identities or defend against a compromised worker credential. Provisioning a dedicated runtime login and granting this worker role are future controlled deployment steps. Do not give the existing Supabase browser/API roles this membership. The runtime pool must provide exclusive, initially idle PostgreSQL connections using verified TLS and the dedicated role, honour discard-on-error and not wrap mutations with retries. The pool/credentials are injected; no database URL or default network transport is present here. Activation requires an operator change to the control row plus explicit worker and adapter configuration. Missing control configuration fails closed.

## Verification and integration gates

Run the synthetic suite on Linux with `bash tests/inventory-ledger/run-local.sh`. It creates a uniquely named PostgreSQL 17 container with `--network none`, no published ports and a synthetic password, then removes it. The only supported existing-container mode is `TLL_INVENTORY_TEST_CONTAINER=tll-stage0-postgres`; it additionally requires the exact `tll_inventory_ledger` database and an existing synthetic marker before resetting that database's test schema/roles. It preserves other databases and existing platform roles, and disables the test control row when the run exits. New fixture containers are prohibited on macOS by the runner.

The suite exercises the migration under `SET SESSION AUTHORIZATION` to a non-superuser CREATEROLE migrator, so a postgres session's SET ROLE privileges cannot mask ownership failures. Real SQL checks cover idempotency, immutable evidence, exact manifest/snapshot validation, disabled/missing activation, row leases/fences, concurrent enqueue/claim, pre-/post-attempt crashes, late acknowledgements, lease expiry while waiting on a lock, held-target exclusion, operator cancellation and inherited schema/table ACL rollback. A second test connects the actual repository and worker to PostgreSQL through a test-only `psql` bridge, with the Shopify transport entirely injected and synthetic. The bridge is not a production database driver.

Validated locally: **93 real SQL checks**, **3 actual PostgreSQL worker flows**, **108 adapter unit tests** and **15 repository/worker unit tests**; the full **587 unit tests**, TypeScript and lint checks pass (six pre-existing lint warnings, zero errors). Linux CI execution is pending until the branch is pushed; the workflow job is included. No hosted migration or Shopify operation is claimed.

Before production use:

1. Review this migration and authority model alongside the current migration chain; run the isolated Linux job and apply only to approved staging first.
2. Provide a dedicated runtime pool with durable database storage and bounded connection/statement/transport timeouts. Verify authentication, grants, TLS, recovery and connection disposal in that environment.
3. Connect every inventory mutation path through this ledger. Retain the same in-memory issuing adapter only for the original attempt; restart is a read/hold boundary, not a restoration mechanism.
4. Complete the adapter's development-store schema/scope/CAS/response-loss acceptance. Approve source-of-truth policy, exact inventory bindings and supplier stock freshness separately.
5. Add monitored hold handling, evidence retention/backups, operator investigation and an explicitly reviewed resolution procedure for possibly-sent work before any unattended supplier scheduler is enabled.
