# Disabled durable subject broker repository

Migration `202609150007_customer_subject_broker_repository.sql` and `lib/identity/customer-subject-broker-repository.ts` implement the existing subject broker port against PostgreSQL 17. They are unmounted and default disabled. The adapter accepts an injected private, bounded pool; it creates no pool, LOGIN, credential, route, provider or deployment. Its explicit synthetic gate and the independent SQL control must both allow execution. `liveEnabled:true` cannot activate the adapter.

This is local database acceptance. Migration007 has not been applied to hosted staging. The shared staging transport currently supports customer/cart purposes only. A broker runtime and its narrowly delegated executor, hosted database installation, provisional OAuth store, actual Shopify/Supabase journey and final identity reconciliation remain separate gates.

## Authority and data

The private `tll_broker_private` schema is owned by a dedicated NOLOGIN owner. The separate NOLOGIN executor has only schema USAGE and EXECUTE on `repository(text,jsonb)`. Browser roles, authenticated users, service_role and the executor have no table, sequence or helper-function privileges. Creation ACLs, including indirect grants inherited through default privileges, are removed from scoped objects. No shared role or default privileges are changed. RLS is enabled on all private tables; only the SECURITY DEFINER owner performs transitions.

The installing operator is recorded by role OID. It retains aggregate status, the enable/disable function, schema USAGE and ADMIN-only delegation of the executor (`ADMIN TRUE, INHERIT FALSE, SET FALSE`). It cannot SET the executor or owner, execute repository operations, read stored identity metadata or modify tables. The operator functions require its exact session identity; acquiring its role with SET ROLE is insufficient. Platform administrators retain their inherent authority; this migration does not add that authority.

The repository stores immutable browser/outer-request hashes, registration and PKCE **challenges**, operation/fence metadata, minimal verified Shopify/session receipts, code/bearer **hashes**, deadlines, and stable opaque subject reservations. It does not store email, raw browser secrets, authorization codes, broker bearers, access/refresh/ID tokens, PKCE verifiers or nonces. The adapter projects only allowed fields; SQL independently rejects extra registration/proof fields. The receipt is trusted server verifier metadata, not cryptographic proof supplied by an arbitrary client. Inner transaction/token material belongs to the distinct provisional orchestration vault.

Provisional sign-in has no Supabase UUID. Migration retains a pending original UUID/session reservation, with no Auth foreign key, `auth.users`/`auth.identities` mutation or completed identity promotion. A subject maps uniquely to `(shop, issuer, Shopify subject)` and reuses its random `tllb_` identifier. Conflicting target users or a provisional-to-migration claim fail. A target user cannot reserve two distinct Shopify subjects in this staging shop. Held evidence is not deleted through user deletion or automatic retention.

## Atomic transitions and uncertainty

One short control-row lock serializes transitions, quota checks and disable/quarantine races. The database samples `clock_timestamp()` **after** obtaining the lock. Registration lasts at most five minutes. Readiness is limited by the registration, Shopify proof age (under five seconds), credential expiry and, for migration, the original session proof and recent authentication. Code redemption and userinfo check that same deadline; a bearer lifetime of up to sixty seconds does not extend it.

Admission and readiness claims are one-use. Only the intentional `claimReadiness` → `finishReadiness` pair shares an operation ID. Recorded operation IDs cannot be reused by another method/flow. The claim fence and generation must still match at finish. Cancellation advances the generation. Code replay denies a new token and quarantines an outstanding bearer; userinfo consumes the bearer before releasing the opaque subject. Unique IDs, code/bearer hashes and receipt IDs are never recycled.

The adapter owns BEGIN/COMMIT and returns success only after COMMIT acknowledgement. It sets bounded server lock/statement/idle-in-transaction timeouts, discards an uncertain connection, redacts errors and never retries a transition. The injected pool must also enforce bounded acquisition, connection, query and lease deadlines. A thrown or malformed response is handled by the protocol core's `holdOperation` call using the original locator; calling repository methods outside that protocol requires the same recovery discipline.

Quarantine is bound to the original transaction/browser/outer-request, exact registered code/client/callback/S256, or bearer hash. It checks any observed claim fence and generation. Pre-registration uncertainty inserts a permanent immutable transaction tombstone; a NEW operation ID cannot bypass it. A precommit failure on an existing flow quarantines the flow even when the attempted operation was never recorded. Quarantine and a late transaction serialize on the same lock. A recorded hold cannot authorize operation reuse on another flow. The adapter does not report a rejected or unacknowledged hold as persisted.

If hold persistence itself is unavailable, the protocol releases no credential/subject. Recovery must establish durable state under operator review; it must not clear a tombstone, reuse the identity/transaction or retry an uncertain exchange. This repository cancels one browser-bound transaction. Coordinated owner-wide logout and authoritative final identity reconciliation are still required before activation.

## Conservative allocation and retention

| Limit | Persisted enforcement |
| --- | --- |
| Registration | 500 per UTC day; 10 per browser hash per ten minutes |
| Normal flow allocation | 10,000 retained flow records |
| Subject reservation | 5,000 retained subjects |
| Operation ledger | 100,000 retained operations |
| Unknown-flow quarantine | Up to 20,000 total flow records, only while operation-ledger capacity remains |

Known-flow quarantine and cancellation remain available when normal operation capacity is exhausted and when SQL execution is disabled. They do not reopen a flow or release material. At full quarantine capacity an unknown hold fails closed. Because there is no automatic tombstone deletion and registration uses stricter caps under the same lock, a delayed registration cannot reopen space after that refusal. These are small staging limits; a reviewed retention/deletion and recovery procedure is required before broader use. Repeated fresh holds on an already held flow do not grow its ledger.

The operator can inspect aggregate counts and switch the foundation off with `operator_status()` and `operator_set_enabled(false, 'reason_code')`. Disable waits for the current serialized transition and then blocks new material use; it permits revocation. It is not a substitute for provider logout or final identity cleanup.

## Reproducible local proof

Use only the existing approved `tll-stage0-postgres` container with a local Unix Docker endpoint and a `postgres:17` image. The setup refuses an existing database; it never starts Docker, creates another container, resets a database or provisions a LOGIN. Shared `anon`, `authenticated` and `service_role` fixture roles must already exist.

```sh
node tests/subject-broker-repository/setup.mjs --create-once
node tests/subject-broker-repository/migration-regression.mjs
node --experimental-strip-types --test tests/subject-broker-repository/acceptance.test.mjs
node --experimental-strip-types --test tests/customer-subject-broker-repository.test.mjs tests/customer-subject-broker.test.mjs
npm run typecheck
```

The owned database is `tll_broker_repository`, marked `tll-subject-broker-repository-synthetic-v1`. Its migrator, owner and executor are broker-specific NOLOGIN roles. Setup installs through the non-superuser migrator and tests hostile inherited creation ACLs inside a rollback-only transaction. The separate migration regression reconstructs the canonical migration only inside a rollback and proves operator privileges, session identity and grant/revoke using an uncommitted NOLOGIN probe. It first checks that the broker roles have no object dependencies in any other database.

**Validation:** 28 actual PG17 cases and the canonical migration regression pass; 58 focused offline cases (51 protocol and seven adapter), typecheck and focused lint pass.

Actual PG17 tests use independent persistent `psql` connections to execute the concrete adapter's parameterized contract, including full protocol → durable adapter → SQL → one-use userinfo. They exercise concurrency, DB-clock lock waits, provisional/migration conflicts, quotas, cancellation, pre-SQL/lost-query/lost-COMMIT uncertainty and private ACLs. Faults interrupt replies around real committed or rolled-back transactions; they do not simulate a physical server crash or prove hosted transaction-pooler interoperability. Test teardown clears only this marked fixture's synthetic broker rows and leaves its control disabled. It does not touch the 005/customer or 006/cart fixtures.

Offline transport tests separately verify commit ordering, immutable input projection, result validation, redaction and no automatic retry. Existing protocol tests remain distinct from SQL/hosted acceptance.
