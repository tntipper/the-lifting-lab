# Generation 15 disabled successor (Phase 1)

## Outcome

Prepare a fresh, fully disabled Generation 15 credential package and dedicated live-launcher stack derived from the Generation 14 Phase 1 shape. Bake in the Gen 14 bridge `own_probe` contract fix and richer secret-free connection-failure evidence from day one, along with the already-proven SCRAM projection, long-session, journal-watch follow, and pinned-CA bake-ins. Leave every native gate disarmed. Do not arm, do not run a live attempt, and do not touch production.

## Acceptance criteria

- Generation 15 package ids, window id, transport modules, database transport, keychain helper, recovery artefacts, credentials dispatch journal schema and tests exist and mirror Generation 14 with mandatory bake-ins applied from day one.
- Shared `scripts/staging-generation-6-connection-verifier.mjs` bridge `own_probe` calls allow-listed `register` with empty `{}` and expects raise-mode `'error'` (same pattern as cart). Soft-reject `admit`/`rejected` is gone.
- Secret-free connection-failure evidence for Gen 15 persists core `{status,reason,purpose,check}` plus allow-listed extras when known: `sqlstate`, `expectedMode`, `purposesPassed`, host/port constants (never password/SQL/keychain).
- Ordinary Gen 15 transport modules are injected-only: no native credential window runner, no credential-bearing imports, `NATIVE_*_ENABLED = false`, keychain `APPROVED_NATIVE_READ = False`.
- SCRAM verifiers are derived from projected passwords (`projection.passwords[purpose]`), never raw material bytes.
- Pinned CA via `readPinnedSupabaseCa()` remains wired into the live launcher connection verifier.
- `scripts/staging-generation-15-live-launcher.mjs` is the only module that may define/invoke Gen 15 native live work; `scripts/staging-generation-15-run-live-once.mjs` is the only supported Phase 3 operator entry.
- `scripts/staging-generation-15-journal-watch.mjs` supports `--follow --interval N`.
- Long-session contract (`TLL_LIVE_LONG_SESSION=1`, keepalive FD, reject nohup/orphan) is enforced when gates are armed; when disabled, launcher returns `NATIVE_TRANSPORT_DISABLED` without requiring long-session env.
- Manifest pins Gen 15 artefacts with `nativeTransportEnabled: false`, `generation15Armed: false`, and keeps Gen 11–14 non-replayable.
- No arming diff, no live process, no hosted mutation, no Gen 6–14 journal rewrite.

## Lessons baked in from day one

| Source | Lesson | Gen 15 enforcement |
|--------|--------|--------------------|
| Gen 14 live FAIL `bridge`/`own_probe` | Verifier called `admit` expecting soft `rejected`; bridge SQL only allows `register\|hold\|cancel\|inspect` and **raises** (`22023`) | Shared verifier: `register` + `{}` + expected `'error'` |
| Gen 14 diagnosis | Evidence allow-list too thin (`status,reason,purpose,check` only) | Gen 15 evidence + report extras: `sqlstate`, `expectedMode`, `purposesPassed`, host/port constants |
| Gen 13 / PR #28 | SCRAM from raw Buffer ≠ projected password | `deriveScramVerifier(projection.passwords[purpose], …)` + transport test |
| Gen 11/12 interrupted live | Short-lived/`nohup` kill | Long-session contract + `run-live-once` only + journal-watch `--follow` |
| Gen 9 | Omitted public Supabase CA | `readPinnedSupabaseCa()` → tls into verifier |

## Planned artefacts

| Artefact | Path / value |
|----------|----------------|
| Package ID | `tll-staging-generation-15-credentials/v1` |
| Window ID | `2ec1dcbb-dd43-4a45-893b-3b4dc4140188` |
| Role predecessor | Gen 14 / `a8955fc3-2347-4544-b04e-55a2cb6fe7aa` (Gen 14 reached `DATABASE_DISPATCH` then failed at bridge `own_probe`; recovery left `RECONCILIATION_REQUIRED` / `CONNECTION_RECOVERY_REQUIRED`) |
| Predecessor expiresAt | `2026-09-21T07:18:57.000Z` — from live Mac Gen 14 dispatch journal `tll-generation-14-credential-dispatch.json` (state `RECONCILIATION_REQUIRED`). Live-confirmed. Recovery SQL stamps retired markers with the same window expiresAt via `tll.recovery_expires_at`; no contradictory fixed stamp found in recovery docs. |
| Superseded / locked | Gen 11–13 no-replay; Gen 14 `CONNECTION_RECOVERY_REQUIRED_RECONCILIATION_REQUIRED_NO_REPLAY` |
| Staging project | `qdmvngjwkcsilzmqksme` only |
| Production excluded forever | `wrhgscovsgsudtedbljr` |
| Manifest key | `generation15Successor` |
| Status | `DISABLED_SUCCESSOR_AWAITING_ARMING_REVIEW` |

## Bridge own_probe change (shared verifier)

**Before:**
```js
bridge:[`SELECT tll_bridge_private.repository('admit',$1::jsonb) AS result`,'{}','rejected'],
```

**After:**
```js
bridge:[`SELECT tll_bridge_private.repository('register',$1::jsonb) AS result`,'{}','error'],
```

Other purposes’ probes are unchanged (cart remains raise-mode; customer/broker/provisional remain soft-reject).

## Phase 3 start checklist (pass/fail — complete before any future arming merge is requested)

| Check | Pass | Fail |
|-------|------|------|
| Predecessor Gen 14 `expiresAt` confirmed from dispatch journal (`2026-09-21T07:18:57.000Z`); live-confirmed | ☑ | ☐ |
| Bridge own_probe is `register`+`{}`+`error` on tip | ☑ | ☐ |
| Richer secret-free connectionFailure extras wired | ☑ | ☐ |
| Long-session Shell / `node scripts/staging-generation-15-run-live-once.mjs` only | ☐ | ☐ |
| Separate observer: journal-watch `--follow --interval 20` | ☐ | ☐ |
| Never kill while `ACTIVE_WITHIN_PHASE_BOUND` | ☐ | ☐ |
| No `npm test` / ordinary suite while armed | ☐ | ☐ |
| `TLL_LIVE_LONG_SESSION=1` + keepalive held for whole run | ☐ | ☐ |
| Not started via nohup / detached short remote shell | ☐ | ☐ |
| Gen 11–14 journals remain non-replayable | ☐ | ☐ |
| SCRAM projected-password derivation still present on tip | ☐ | ☐ |
| Pinned CA still wired into launcher verifier | ☐ | ☐ |

## Explicit stop before arming

This stage ends when the disabled package, live launcher, run-live-once wrapper, journal-watch follow mode, evidence helpers, bridge probe fix, boundary coverage, tests and documentation are committed. The next gate is **independent review of the exact arming diff** (a separate change that flips native/Keychain gates). This PR must not contain that diff.

## Exclusions

- No gate enablement, Keychain access, native credential dispatch or hosted mutation.
- No rewrite of consumed Gen 6–14 journals or recovery evidence.
- No production Supabase `wrhgscovsgsudtedbljr`; staging only `qdmvngjwkcsilzmqksme`.
- No purchases, emails or supplier orders.
- No merge to `main` / `codex/tll-integration` tip without review.
- No Gen 11–14 replay.
- No arming diff in this PR.

## Verification order

1. Focused Gen 15 credentials/transport/DB/recovery/long-session/evidence + verifier bridge probe + boundary + manifest tests.
2. `npm run check:live-boundaries`.
3. Manifest regenerate / pin check.
4. Disabled launcher CLI returns `NATIVE_TRANSPORT_DISABLED` without long-session env.
5. Full `npm test` if feasible; otherwise report focused set.
6. Diff review against this plan; commit; open PR into `codex/tll-integration`.
