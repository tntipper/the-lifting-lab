# Disabled atomic admission registration bridge

Migration `202609170010_customer_admission_bridge.sql` adds a local-tested SQL boundary between 008 provisional admission and 007 broker registration. It installs after the reviewed maintainable-owner versions of 007/008, while both are disabled. It creates no LOGIN, credential, route, cookie, provider setting, network request or Node bridge adapter. Its own control starts disabled. Existing installations without 010 retain their original standalone repository behavior and tests.

The bridge uses one database transaction. A successful SQL result is still not a COMMIT acknowledgement: a future Node adapter must return its result only after acknowledged COMMIT, destroy uncertain connections and never retry. The local tests deliberately lose query and COMMIT acknowledgements. Separate pools with compensating updates do not substitute for this transaction.

## Fixed authority and gate

`tll_bridge_private` has a separate NOLOGIN owner and executor. The executor receives only schema USAGE and EXECUTE on `repository(text,jsonb)`. It has no 007/008 executor membership, table access, vault key or decryption method. The two existing executors keep their existing external schemas and function signatures. Machine broker code has no bridge or provisional schema access.

Owner-held helpers provide only locking, exact source projection, source-derived registration and terminal propagation. The bridge owner has EXECUTE on those helpers and necessary pure validators, with no 007/008 table grants or owner membership. Every private function has a fixed safe search path. Migration 010 removes every nonowner function ACL before rebuilding an explicit allowlist, including ACLs on the renamed original functions. Runtime executors and the installer cannot call the ungated originals. The final postflight checks raw function ACLs, no nonowner GRANT OPTION, effective schema/table/column/sequence/function authority and exact ADMIN-only membership for all six broker/provisional/bridge owner and executor roles. Hostile inherited creation/default ACLs are tested.

The installer must be the existing recorded operator and have the reviewed ADMIN-only owner upgrade delegation. It temporarily obtains owner access for DDL and retires that access, retaining the deliberate ADMIN-only maintenance/provisioning edges and narrow operator functions. The trusted installer may already inherit platform SELECT through `pg_read_all_data`;010 allows only that implicit read authority, rejects explicit data ACLs and all direct mutation/MAINTAIN/sequence-use authority, and preserves zero effective data authority for browser/service/executor roles. No platform role is changed. See [the migration authority contract](repository-migration-authority.md). The bridge's owner/executor follow the same maintenance policy. Those edges are trusted administration authority; they are not a claim that an installer cannot intentionally reopen a maintenance window.

Operator status exposes only enabled/epoch/reason and aggregate grant/operation counts, so an empty postflight requires no private-table access.

All installed repository transitions and all three enable/disable functions acquire locks in the order **bridge G → broker B → provisional P**. Only then do they sample database time and inspect the relevant state. Existing functions are renamed to owner-only `repository_v1` / `operator_set_enabled_v1`; same-signature wrappers call them only behind the gate. 007 direct `register` always rejects after 010. Aggregate operator status has no transition authority.

The shared epoch is captured at each 008 preparation. Existing pre-010 rows have no epoch and cannot gain authority. Disabling any one control increments the epoch in the same transaction; re-enabling never revives old prepared intents, grants, codes or bearers. Ordinary preparation/admission and broker transitions require all controls enabled. Metadata inspection and terminal actions remain available when disabled. No network work happens under these locks.

## SQL contract

`tll_bridge_private.repository(op,p)` accepts bounded JSON with an exact field set. The retained binding consists of `transactionId`, `browserHash`, source `configHash`, `intentHash`, `applicationPkceChallenge`, `admissionOperationId`, `admissionFence`, `generation` and `outerHash`. The admission fence is the source operation's claim fence; it is not the later row fence advanced by 008 finish. A new `operationId` is captured before bridge dispatch. IDs cannot be reused across transactions or bridge phases.

| Operation | Required authority and result |
| --- | --- |
| `register` | The source is admitted, unexpired, in the current epoch, and its exact paired admission operation is complete. `releaseHash` is a canonical SHA-256 digest. Sign-in supplies null `currentMigrationProof`; migration supplies the actual verifier's original UUID/session/token hash and fresh narrow proof metadata. SQL derives 007's record solely from locked 008 metadata/outer tuple, preserves the original creation and expiry, enforces quotas and creates 007 `registered` plus bridge `pending_browser` together. Return is only status, transaction ID and original expiry. |
| `hold` / `cancel` | Exact original source binding and admission claim. Hold can use the captured registration operation; cancellation requires a new terminal operation. Atomically terminalize both stores and the grant, clear provisional material and release hash, retain reservations. A pre-registration grant tombstone fences a late registration even when no 007 row was created. |
| `inspect` | Exact original binding. Return only state, original expiry, database observation time and whether the epoch is current. No outer URL, verifier, release hash, credentials or resume authority. |

Migration proof metadata must match the original user UUID, session UUID and token hash, authenticated staging issuer/audience, nonanonymous status, authentication age below five minutes, check age below five seconds and live expiry **after the gate wait**. SQL does not authenticate a Supabase token. Future server wiring must obtain this proof from the actual request-scoped session reader and reread the retained token before the bridge call; no browser `verified` flag or caller-selected target is accepted. Existing broker readiness must still repeat the required session/proof checks.

Registration preserves the exact 008 metadata times. It can therefore register an attempt more than five seconds after preparation without resetting the original deadline. The legacy protocol core's fresh `createdAt`/five-minute extension is not used. Later broker readiness, code redemption and userinfo continue to enforce both original expiry and their existing shorter deadlines.

## Release capability and acknowledgement boundary

The future trusted server continuation generates a fresh canonical 32-byte release secret once before registration. It hashes that secret with a versioned ordered digest of the original source binding, outer hash and registration operation ID. Only `releaseHash` enters SQL. The raw secret and normalized URL must remain private until registration COMMIT is acknowledged, then may be delivered by separately reviewed protected browser wiring. This slice neither implements nor mounts that delivery.

Installed 007 `admit` requires `releaseHash` in addition to the original browser/outer binding. A future browser adapter computes it from a separate server-created HttpOnly release cookie and the exact retained binding. No read API exposes the stored hash. Successful admit consumes the release capability and moves the grant to `browser_admitted` in the same transaction as 007 admission. Missing, wrong, transplanted or reused capability fails. Later readiness/token/userinfo require that admitted grant plus matching source generation, source row fence, metadata/outer tuple, epoch, controls and expiry.

The existing TypeScript broker adapter deliberately remains unchanged in this SQL slice: it does not supply the new capability, so its old admission path fails closed when 010 is installed. A separately reviewed server/protocol adapter change is required before the combined browser path can run. SQL installation alone is not completed runtime wiring.

The database cannot prove that the application received an earlier acknowledgement. An 008 metadata read must never cause registration: the future continuation may register only following the admission coordinator's acknowledged finish result. SQL verifies the durable completed operation independently. On lost registration acknowledgement, release nothing and attempt one exact atomic hold. If hold also has an unknown result, a pending row can remain, but its never-released secret is unavailable to a browser. Inspection cannot recover it, and a new registration/secret/operation cannot reopen that immutable transaction. Lost browser delivery after ACK requires separate explicit fencing and a fresh transaction; no recovery reissues the capability here.

## Terminal propagation and limits

Existing 008 holds/cancellations now fence corresponding broker authority atomically. Existing 007 holds/cancellations and implicit code-reuse quarantine also terminalize the source/grant. This includes holding a flow after an uncertain consumed-userinfo acknowledgement. Invalid original locators cannot affect a foreign source. A normal consumed userinfo result retains private provisional material for later final exchange; it does not promote a UUID, decrypt tokens or authenticate a browser.

Grant capacity is 10,000 ordinary rows with 20,000 quarantine headroom; bridge operation capacity is 100,000 ordinary operations with at most one additional terminal row per known grant. Existing 007/008 quotas still apply. Terminal records retain immutable IDs and reservations. There is no cleanup/retry/reclaim path. Disable waits for preceding transitions and fences future use; it cannot retract a result already delivered or undo an upstream side effect that already occurred.

Cancellation requires its own operation ID; reusing a registration or held operation ID is rejected. A flow already held cannot be relabelled cancelled even with a new operation. The first terminal state remains retained across both stores and the grant. A successful `cancelled` response therefore describes the resulting state, not merely the caller's safety intent. Only hold may reuse an earlier operation ID to quarantine that exact uncertain operation.

## Isolated local verification

The fixture uses only the existing local PostgreSQL17 container and a new marked database `tll_admission_bridge`. Setup refuses an existing database, nonlocal Docker endpoint, unexpected container or existing fixture roles. Canonical 007/008 source SHA-256 hashes are pinned in `tests/admission-bridge/sources.mjs`. Because roles are cluster-wide, the exact enumerated canonical owner/executor names map to dedicated `tll_ab_broker_*`, `tll_ab_provisional_*` and `tll_ab_bridge_*` roles using whole-identifier replacements. Reversing the map must restore every source byte. Schema, table, function and protocol semantics are unchanged; other fixtures' roles and data are untouched.

```sh
node tests/admission-bridge/setup.mjs --create-once
node --experimental-strip-types --test tests/admission-bridge/acceptance.test.mjs
node tests/admission-bridge/migration-regression.mjs
node tests/managed-admin-read-authority.mjs bridge
```

Acceptance uses actual 008 repository/vault and admission/session adapters with signed synthetic provider HTTP, then real same-database bridge/broker transitions on independent connections. Tests cover source/target/PKCE binding, expiry, capability use, lost responses/commits, terminal propagation, replay, disable epochs, lock order, post-lock freshness and effective ACLs. The migration regression reconstructs only the owned fixture's bridge in a rollback, with hostile inherited defaults, non-superuser installation and future DDL delegation, then verifies the exact original function/membership/control/row baseline. Tests leave every control disabled and synthetic rows empty. Do not run the two suites concurrently.

Author validation: 61 actual PostgreSQL cases passed; the canonical rollback reconstruction, exact 18 installed function-body checks and nine ACL/control mutation probes passed. Type checking, focused lint and staged diff checks passed. The fixture was verified disabled with no private workload, other sessions or runtime LOGIN roles.

This proves local SQL behavior, not hosted pooler interoperability, actual provider registration, receipt delivery, browser protection, full logout or final reconciliation. The bounded Node continuation, release-cookie wiring, Shopify orchestration, final exchange/promotion and activation remain separate reviewed work.
