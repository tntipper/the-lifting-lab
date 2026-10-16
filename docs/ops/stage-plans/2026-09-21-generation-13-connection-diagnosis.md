# Generation 13 CONNECTION_VERIFICATION diagnosis

## Verdict (Optimus → Toby)

Generation 13 reached provider staging and database dispatch, then failed connection verification and recovered cleanly (`RECOVERY_VERIFIED` / `RECONCILIATION_REQUIRED`). Gen 9’s omitted public Supabase CA is **not** the Gen 13 cause: the Gen 13 launcher already calls `readPinnedSupabaseCa()` and passes `tlsCa` into `verifyGeneration6Connections`.

The strongest code-proven cause for a post-TLS `connect` / `connect_retry` failure is a **SCRAM / password projection mismatch**: SQL stored a SCRAM verifier derived from the raw material `Buffer`, while the verifier connected with the **base64url** password string that providers and runtimes use. Those are different secrets. That bug is fixed in this change for Gen 6–13 transports. Gen 13 itself must not be replayed; Gen 14 must bake in this fix plus secret-free `connectionFailure` persistence before arming.

## Proven vs inferred vs unknown

### Proven

| Fact | Evidence |
|------|----------|
| Long-session / `run-live-once` held through phase budget | Recovery note; Gen 11/12 interrupt class did not recur |
| Provider staging succeeded | Phase journal progressed past `VERCEL_STAGE` / `SUPABASE_STAGE` / `PROVIDER_READBACK` into database work |
| Database dispatch succeeded | Dispatch journal ended `RECONCILIATION_REQUIRED` (not intent-only interrupt); recovery found installed window to retire |
| Failure phase was `CONNECTION_VERIFICATION` | Terminal phase journal outcome at cleanup after verification failure; transport catch only attaches `connectionFailure` in that phase |
| Cleanup / recovery succeeded | Outcome `RECOVERY_VERIFIED`; post-cleanup provider readback zero generated values |
| Window locked / no replay | `windowId` `866b0e78-7530-493a-8963-e8cf24cf3067`; status `CONNECTION_RECOVERY_VERIFIED_RECONCILIATION_REQUIRED_NO_REPLAY` |
| Gen 13 supplied pinned CA | `scripts/staging-generation-13-live-launcher.mjs` → `readPinnedSupabaseCa()` → `tlsCa` into verifier |
| Gen 9 CA omission ≠ Gen 13 | Gen 9 native path omitted `tlsCa` until commit `a6eb3c1`; Gen 13 always wired CA |
| Launcher stdout dropped `connectionFailure` | CLI printed only `status/target/generation/windowId/phase/nextAction`; transport **did** return `connectionFailure` on the result object |
| Live-session summary also omitted it | `run-live-once` wrote exit codes only — no `purpose`/`check` |
| SCRAM raw ≠ projected base64url | Unit proof: same salt, `deriveScramVerifier(rawBuffer)` ≠ `deriveScramVerifier(base64urlString)` |
| Acceptance fixture already used projected strings | `tests/staging-generation-6-credentials-actual.mjs` derives SCRAM from `.toString('base64url')` passwords |
| Live transports derived from raw buffers (pre-fix) | Gen 6–13: `deriveScramVerifier(material.passwords[purpose], …)` then `verifyConnections({ passwords: projection.passwords })` |

### Inferred (strong)

| Inference | Why |
|-----------|-----|
| First failing purpose was likely `customer` | Verifier walks purposes in identity order; first connect failure throws before later purposes |
| Check class was `connect` or `connect_retry` | Auth mismatch fails at `pool.connect()`; verifier retries once after 16s then throws `connect_retry` |
| Gen 13 was the first post-CA live attempt to reach verification | Gen 10 mis-killed; Gen 11/12 interrupted mid-`VERCEL_STAGE`; Gen 9 failed earlier on missing CA |

### Unknown (cannot prove without hosted probe or lost live fields)

| Unknown | Why |
|---------|-----|
| Exact `{purpose,check}` from Gen 13 live | Evidence was computed then stripped from stdout/summary |
| Whether pooler convergence alone would have failed with aligned SCRAM | 16s wait may still be tight; not proven |
| Whether `enableChannelBinding` / `sslnegotiation: 'postgres'` interact badly with Supavisor | Possible secondary; not required to explain auth mismatch |
| Hosted role `valid_until` formatting vs `expiresAt` | Would fail at `identity`, not `connect_retry` |
| Exact Supavisor cache lag after `ALTER ROLE … PASSWORD` | Plausible residual risk after SCRAM fix |

## Phase timeline (committed code + journal patterns)

```text
ENTRY_PREFLIGHT → (optional ENTRY_PREFLIGHT_RETRY)
→ JOURNAL_INTENT
→ MATERIAL_GENERATION
→ VERCEL_STAGE                    (up to 660s)
→ SUPABASE_STAGE
→ PROVIDER_READBACK               ← Gen 13 passed
→ DATABASE_PACKAGE
→ DATABASE_DISPATCH               ← Gen 13 passed (receipt validated shape)
→ CONNECTION_VERIFICATION         ← failed here
→ DATABASE_RECOVERY               ← succeeded
→ VERCEL_CLEANUP / SUPABASE_CLEANUP
→ terminal RECOVERY_VERIFIED; dispatch journal RECONCILIATION_REQUIRED
```

`CONNECTION_VERIFICATION` budget is 420s and includes one intentional `POOLER_CONVERGENCE_MS` (16s) fresh-pool retry per purpose.

## `verifyGeneration6Connections` / staging-postgres failure map

Checks that can throw **after** a valid `tlsCa` is supplied (factory already created with CA):

| check | When |
|-------|------|
| `connect` | First `pool.connect()` fails (TLS/auth/network/pooler) |
| `connect_wait` | Closing first pool / waiting 16s (internal; failure usually surfaces as retry) |
| `factory_retry` | Recreating runtime after wait |
| `connect_retry` | Second `pool.connect()` also fails ← Gen 9 symptom class; Gen 13 likely |
| `identity` | DB/role/flags/`valid_until`/`application_name` (expects `Supavisor` via pooler) mismatch |
| `membership` | Executor grant shape wrong |
| `matrix` | Function privilege matrix wrong |
| `own_probe` | Purpose-owned probe did not return expected reject/error |
| `table_denial` | Private table read was not denied |
| `release` / `close` | Cleanup of client/pool failed after an otherwise successful check |

`staging-postgres.ts` username format is `tll_*_runtime.<projectRef>` on transaction pooler host/port 6543 — consistent with Supabase pooler conventions; no clear format bug found.

## Why stdout only showed `RECOVERY_VERIFIED`

1. Transport catch correctly built `connectionFailure` via `connectionFailureReport(error)` and returned it on the result.
2. Live launcher CLI **omitted** that field from `JSON.stringify({ status, target, generation, windowId, phase, nextAction })`.
3. `run-live-once` summary recorded exit code only.

So operators saw recovery success without the diagnostic that already existed in memory.

## Ranked hypotheses for Gen 13 (post-CA)

1. **SCRAM/password projection mismatch (code-proven; fixed here)** — SQL verifier from raw bytes; client password base64url. Produces first-purpose `connect`/`connect_retry`. Matches acceptance-fixture intent and Gen 9-class symptom after CA was fixed.
2. **Pooler convergence / auth cache** — role password not visible to Supavisor within 16s. Residual after (1); safe probe is longer wait or read-only management checks without a new window.
3. **Channel binding / SSL negotiation with pooler** — secondary transport hypothesis; no code evidence it alone explains Gen 13.
4. **Role not LOGIN-ready despite receipt** — unlikely: receipt SQL requires login + password + `valid_until` before commit.
5. **Username `role.projectRef` wrong** — not supported by code review; format matches pooler docs and factory pin.
6. **`valid_until` / identity mismatch** — would surface as `identity`, not connect class.
7. **Gen 9 CA repeat** — **ruled out**; CA path present on Gen 13.

## Safe next probes (no new credential window)

- Code-only: keep the SCRAM alignment tests; confirm Gen 14 transport copies the projected-password derivation.
- Synthetic dummy-role TLS probe already used in Gen 9 evidence era — TLS trust is established; do not re-run hosted mutations.
- Optional **read-only** management API inspection already supported by existing preflight packages (no role password install, no purchases).
- Do **not** replay Gen 13 journals or re-arm Gen 13.

## What Gen 14 must bake in before arming

1. SCRAM verifiers derived from **projected base64url** passwords (this fix).
2. Secret-free persistence of `{purpose,check,status,reason}` (+ phase) on verification failure:
   - launcher stdout via `secretFreeLauncherTerminal`
   - `implementation-state/staging/tll-generation-*-connection-failure.json`
   - `run-live-once` live-session summary fields
3. Long-session / `run-live-once` contract retained.
4. Pinned CA wiring retained.
5. No arming until this diagnosis is accepted and the above is on the disarmed successor tip.

## Changes in this PR

- Fix SCRAM derivation in Gen 6–13 transports.
- Add Gen 13 connection-failure evidence helpers + launcher/run-live-once persistence.
- Tests for SCRAM alignment and secret-free evidence.
- This diagnosis document.

No arming, no live launcher run, no hosted mutations, no Gen 13 replay.
