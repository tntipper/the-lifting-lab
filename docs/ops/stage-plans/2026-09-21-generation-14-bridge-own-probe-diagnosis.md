# Generation 14 bridge / own_probe diagnosis

## Verdict

Generation 14 reached provider staging, database dispatch, and connection verification. Secret-free evidence names the failure:

```json
{"status":"FAIL","reason":"connection_verification_failed","purpose":"bridge","check":"own_probe"}
```

This is **not** a repeat of Gen 13’s SCRAM raw≠projected connect failure. SCRAM derivation for Gen 14 already uses `projection.passwords[purpose]` (including `bridge`) for both SQL verifiers and `verifyConnections`. Reaching `own_probe` on purpose `bridge` means earlier purposes (`customer` → `provisional`) completed connect/identity/membership/matrix/own_probe/table_denial, and bridge itself completed connect through matrix.

Strongest code-proven cause: the Gen 6 connection verifier’s bridge `own_probe` calls `tll_bridge_private.repository('admit', '{}')` and expects a soft `{status:'rejected'}` row, but the hosted bridge repository **does not accept `admit`** — it only allows `register|hold|cancel|inspect` and **raises** `Admission bridge request unavailable` (ERRCODE `22023`) for invalid ops / payloads. The verifier therefore fails closed at `own_probe`.

## Proven vs inferred vs unknown

### Proven

| Fact | Evidence |
|------|----------|
| Long-session / `run-live-once` held | Recovery note; Gen 11/12 interrupt class did not recur |
| Failure phase CONNECTION_VERIFICATION | Transport only attaches `connectionFailure` in that phase; live evidence present |
| Exact `{purpose,check}` | Persisted: `bridge` / `own_probe` |
| Terminal cleanup outcome `RECOVERY_REQUIRED` | Phase journal TERMINAL at `SUPABASE_CLEANUP` |
| Dispatch locked | Journal `RECONCILIATION_REQUIRED`; no replay |
| SCRAM uses projected passwords for all purposes including bridge | `scripts/staging-generation-14-transport.mjs`: `deriveScramVerifier(projection.passwords[purpose], …)` then `verifyConnections({ passwords: projection.passwords })`; unit test asserts SQL embeds projected SCRAM and rejects raw-buffer equivalent |
| Pinned CA still wired | Live launcher: `readPinnedSupabaseCa()` → `tlsCa` into `verifyGeneration6Connections` with `createStagingPostgresRuntime` |
| Bridge identity differs only in login/membership/entrypoint list | `IDENTITIES.bridge` → `tll_bridge_runtime` / `tll_bridge_executor`; passwords projected the same way as other purposes |
| Bridge own_probe shape in verifier | `ownProbe.bridge = [SELECT tll_bridge_private.repository('admit',$1::jsonb) …, '{}', 'rejected']` in `staging-generation-6-connection-verifier.mjs` |
| Bridge SQL op allow-list | Migration `202609170010_customer_admission_bridge.sql`: `op NOT IN ('register','hold','cancel','inspect')` → `RAISE EXCEPTION` (not soft reject) |

### Inferred (strong)

| Inference | Why |
|-----------|-----|
| Customer/cart/broker/provisional verification passed | Verifier walks purposes in identity order; first failure throws; failure purpose is `bridge` |
| Bridge TLS/SCRAM/login/membership/matrix passed | `own_probe` is after those checks |
| Probe mismatch is latent and newly exposed | Prior live gens failed earlier at CA/connect; Gen 14 SCRAM fix advanced past connect into purpose probes |
| Soft-reject expectation is wrong for this call | Empty `{}` also fails uuid/hash validation and would raise before any soft reject path; even a valid-shaped invalid op raises |

### Unknown (evidence still insufficient)

| Unknown | Why |
|---------|-----|
| Exact Postgres error code / message class from live probe | Current secret-free evidence allow-list is only `{status,reason,purpose,check}` — no `sqlstate`, no exception class |
| Whether recovery SQL failed vs postcommit proof | Outcome is `RECOVERY_REQUIRED` (recovery catch), not which sub-step |
| Hosted function md5 vs migration pin drift | Would require read-only management inspection; not done in this disarm |
| Whether changing probe to `register` + empty payload (still raises) vs expecting `error` like cart is the intended Gen 15 fix | Product choice; do not implement here |

## What `purpose: bridge` and `check: own_probe` mean

1. Live launcher wraps `verifyGeneration6Connections({ passwords, expiresAt, tlsCa, createRuntime: createStagingPostgresRuntime })`.
2. For each purpose, after connect + identity + membership + matrix, the verifier runs that purpose’s `ownProbe`.
3. For `bridge`, expected mode is soft JSON status `rejected` (not the cart `error`=must-throw mode).
4. Failure at `own_probe` means the query did not return exactly one row with `result.status === 'rejected'` — including when the SQL raises (caught and remapped to `unavailable(purpose,'own_probe')`).

## SCRAM / projection / CA (ruled in or out)

- **SCRAM for bridge uses `projection.passwords['bridge']` after PR #28** — yes, same map as other purposes; Gen 14 baked that in.
- **Bridge password projection differs from other purposes?** — no material difference; same `projectGeneration6Secrets` path; only role names/entrypoints differ.
- **Pinned CA** — still present; not the Gen 9 omission class.

## Secret-free evidence we still lack (Gen 15 prevention)

Persist richer probe-failure fields without secrets, e.g.:

- `sqlstate` / allow-listed exception class (e.g. `22023`) when the probe raises
- `ssl` negotiated / `servername` / host+port constants used (`aws-0-eu-west-2.pooler.supabase.com:6543`) — never password
- `purposeIndex` / `purposesPassed` count
- Whether expected mode was `rejected` vs `error`
- Recovery sub-outcome (`RECOVERY_COMMITTED` vs postcommit fail) separate from connectionFailure

Do **not** implement Gen 15 in this PR — diagnosis + disarm only.

## Ranked hypotheses

1. **Bridge own_probe op mismatch (code-proven; strongest)** — verifier calls `admit` on a function that only accepts `register|hold|cancel|inspect` and raises; soft-reject expectation fails.
2. **Empty `{}` payload always invalid** — even for `register`, validation requires many hash/uuid fields; raise path is by design for malformed input. Cart correctly expects `error`; bridge incorrectly expects `rejected`.
3. **Recovery_REQUIRED secondary** — cleanup path after verification failure; investigate only after probe fix acceptance; does not explain `own_probe`.

## Replay / successor

- Do not replay Gen 14 journals or re-arm Gen 14.
- Gen 15+ only after fixing the bridge probe contract (and optionally richer evidence) on a disabled successor tip, with independent review before any arm.
