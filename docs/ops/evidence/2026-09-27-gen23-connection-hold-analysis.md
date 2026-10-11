# Generation 23 connection HOLD: diagnosis before another staging run

Status: **unresolved cause; staging contained**. This note is based on the current repository and preserved one-use records, not a replay of the consumed run. Do not use it as approval to open another credential window.

## What is proven

- The whole-route v2 record reached `restrictedConnections` after verified baseline, settings replacement and database setup. It then ended `HOLD`; provider enable, database controls, Preview activation and owner journey were never reached. Record: `../../../../implementation-state/staging/tll-generation-23-whole-route-v2.json`, SHA-256 `686b08ce3e4902abd3c9d023d39b6df4aa4668104c079b760dd598296852e544`.
- A separate read found all five temporary logins active, all database controls OFF, and two sessions. A later read found zero sessions. The separately approved one-use retirement then removed all five logins/passwords/runtime grants and independently read back zero sessions and OFF controls. Retirement record SHA-256 `e64e7bf78b01190dc1500b26a0083c7c1ef29fa161bd4d6441d7f5ff70926880`.
- The published Preview remains protected and based on disabled source `526d25d206a4a6f21bd9797609d6efe35726e840`. The local branch is back at that source with 64 switches OFF and expiry UNSET. Focused verifier tests (20/20) and `npm run check:live-boundaries` pass after recovery.
- The route record stores only the phase-level HOLD. It cannot tell whether the first real login, a later role check, a changed-password rejection, or the final zero-session read failed. Two observed sessions do **not** establish which subcheck failed.

## Where the missing evidence is lost

`scripts/staging-generation-6-connection-verifier.mjs` already classifies a correct-login failure by role and check (`connect_retry`, `identity`, `membership`, `matrix`, `own_probe`, `table_denial`, release or close). `scripts/staging-generation-23-restricted-connections.mjs` invokes it without preserving that safe classification. The wrapper also collapses every wrong-password probe and final drain failure to the same generic error. `scripts/staging-generation-23-whole-run.mjs` then records only `RESTRICTEDCONNECTIONS_HOLD`. This explains the poor diagnosis; it does **not** prove the database failure's cause.

## Competing causes to distinguish

1. A correct login could fail to connect or still be waiting for pooler credential convergence. The verifier permits one 16-second retry per role.
2. A login could succeed but an exact role identity, membership, function privilege, disabled-operation or private-table check could fail. The code checks all five roles in order.
3. A modified password could produce a timeout or transport error instead of the required PostgreSQL `28P01` authentication denial. The raw probe has a three-second connection limit per role.
4. The final zero-session read could occur before the pooler has drained. This is distinct from a privilege or password error.

The 95-second gap between setup completion and route HOLD is compatible with several combinations above. It is not a reliable fingerprint for any one cause. Do not relax an access check to make the test pass without evidence that its expectation is wrong.

## Independent Astra audit: confirmed design gaps

An independent read-only review compared the current runner with earlier generations and the local tests. It confirmed these defects in the *test machinery*, not the exact cause of this particular HOLD:

- Gen21 preserved the verifier's safe role/check failure report and waited a bounded time for Supabase's pooler sessions to drain (`scripts/staging-generation-21-live-launcher.mjs`, `scripts/staging-generation-21-database-transport.mjs`). Gen23 discarded the report and reads session count once immediately after closing its connections. A healthy connection proof may therefore fail while sessions are still draining. The old wait alone could take 150 seconds, longer than Gen23's 140-second total connection allowance; the successor must redesign the budget or split the proof rather than copy the old wait unchanged.
- The joined local route substitutes a direct Docker PostgreSQL test for Gen23's real connection wrapper (`tests/staging-generation-23-composite-local-acceptance.mjs`). That test does not cover Supavisor's identity behaviour, the raw changed-password probe or session drain. Its pass is useful evidence for the local database rules but not for the complete hosted path.
- In `scripts/staging-generation-6-connection-verifier.mjs`, some negative checks accept *any* query exception as denial. The normal runtime also throws for a network fault or timeout and hides the underlying database code (`lib/server/staging-postgres.ts`). A future PASS could therefore mistake an outage for a proven permission/disabled-operation denial. This does not show that an unauthorised user has access; it means the proof is too weak. Require an allow-listed expected error class, and for cart/bridge run private-table denial independently after the intentional operation error.
- A HOLD stops the whole sequence before routine retirement. That is correct for an uncertain effect, but a separately prepared read-only reconciliation and retirement action must be available before another attempt. This run used that separate recovery successfully.

The project history shows different causes across generations (password representation, expected database responses, error handling, pooler drain, provider discovery and Management API identity). There is no evidence of one persistent Supabase outage. The repeated *process* error is that successor runners were accepted on component mocks and safety-to-publish checks while earlier real-route diagnosis and timing guarantees were not carried forward.

## Cheapest safe path forward

1. Preserve the v2 route, setup and retirement records unchanged. Keep all account/cart/provider/database controls OFF and the five roles retired.
2. Check whether existing official staging database/pooler logs for the exact run interval can distinguish connection denial, timeout and role failures without exposing credentials or customer data. This is read-only; if access needs a new credential window, obtain its separate action-time approval.
3. Before any successor run, repair the *complete* restricted-connection phase: add a fixed, secret-free diagnostic that persists only an allow-listed role/check label, changed-password outcome or drain outcome under a new exclusive one-use record; wait boundedly only while sessions remain; allocate enough time; and require the correct denial class. Never record raw PostgreSQL errors, passwords, SQL results or URLs.
4. Rehearse the actual assembled connection wrapper with only the network/driver boundary simulated, then the full successor sequence. Inject real-login, privilege, wrong-password, slow-drain, timeout, cancellation, lost-response and diagnostic-write failures. Verify that failure evidence survives worker exit, later activation is untouched, and recovery is a separate read-only assessment followed by an authorised one-use retirement, never an automatic replay.
5. Review the remaining provider, Preview and browser journey together. Recheck disabled source, protected Preview, exact new records, shutdown/retirement path and a realistic window before independent review and fresh owner approval for one supervised staging run. The live run itself must prove the real connection and denial/drain behaviour, owner sign-in and orders, cart transfer, exact item/price, GET-only checkout, POST logout and final OFF/retired readback.

If existing logs cannot explain the historical HOLD, say so. An unknowable old cause must not become an endless prerequisite: the fully instrumented successor can determine its own failure before permitting downstream activation.

No new hosted action, role recreation or customer test was performed while writing this note.
