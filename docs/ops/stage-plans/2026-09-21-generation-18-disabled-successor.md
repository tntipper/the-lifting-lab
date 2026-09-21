# Generation 18 disabled successor (Phase 1)

## Outcome

Prepare a fresh, fully disabled Generation 18 credential package and dedicated live-launcher stack derived from the Generation 17 tip (post–PR #40). Inherit Gen 17’s **SCRAM** derivation, **bridge own_probe** (`register` + `{}` + expected `error`), **zero-sessions drain after probes** with the longer tip defaults (**30s × 5** — do not weaken), **management-API non-201 body classification**, and secret-free **`zeroSessionsAttempts`** on failure from day one. Leave every native gate disarmed. Do not arm, do not run a live attempt, and do not touch production.

## Acceptance criteria

- Generation 18 package ids, window id, transport modules, database transport, keychain helper, recovery artefacts, credentials dispatch journal schema and tests exist and mirror Generation 17 tip helpers (`postManagementQuery`, `classifyZeroSessionsFailure` cause walk, `verifyGeneration18ZeroSessionsAfterPoolerDrain`).
- Management non-201 JSON bodies are drained; allow-listed RAISE phrases are promoted to secret-free messages; drain retries arm only for `runtime_sessions_remain`.
- After Gen-6 connection probes succeed (runtimes closed in `finally`), the live launcher waits `ZERO_SESSIONS_DRAIN_CONVERGENCE_MS` (30s default) then proves zero sessions, with bounded retries (max 5 default) only while `failureReason === 'runtime_sessions_remain'`.
- RECOVERY_* evidence retains Gen 17 fields (`failedPhase`, `connectionFailurePresent`, `recoveryOutcome`, `failureStep`, `failureReason`, optional `connectionFailure`, optional `zeroSessionsAttempts`, optional `managementStatusCode`) and may persist secret-free `managementStatusCode` (HTTP number only) when known.
- Bridge own_probe remains `register` + `{}` + expected `error` on the shared Gen-6 verifier.
- SCRAM verifiers derive from projected passwords; pinned Supabase CA remains wired; long-session `run-live-once` + keepalive + journal-watch `--follow` remain.
- Ordinary Gen 18 transport modules are injected-only: no native credential window runner, no credential-bearing imports, `NATIVE_*_ENABLED = false`, keychain `APPROVED_NATIVE_READ = False`.
- Manifest pins Gen 18 artefacts with `nativeTransportEnabled: false` / `generation18Armed: false`, keeps Gen 17 disarmed (`generation17Armed: false`), and keeps Gen 11–17 non-replayable.
- No arming diff, no live process, no hosted mutation, no Gen 6–17 journal rewrite.

## Lessons baked in from day one

| Source | Lesson | Gen 18 enforcement |
|--------|--------|--------------------|
| Gen 17 live `zero_sessions` / `runtime_sessions_remain` (PR #40 diagnosis) | Drain budget 3 × 16s was shorter than hosted pooler idle TTL despite correct mgmt body mapping | Inherit tip drain defaults `ZERO_SESSIONS_DRAIN_CONVERGENCE_MS = 30_000`, `ZERO_SESSIONS_DRAIN_MAX_ATTEMPTS = 5`; persist `zeroSessionsAttempts` on failure; do not weaken |
| Gen 16/17 mgmt non-201 mapping (PR #37) | Non-201 bodies must be drained so RAISE phrases classify | Clone tip `postManagementQuery` + allow-listed phrase promotion + cause walk |
| Gen 15/16/17 RECOVERY_* evidence | Operators need secret-free failure fields | Carry `failedPhase`, `connectionFailurePresent`, `recoveryOutcome`, `failureStep`, `failureReason`; optional `managementStatusCode` / `zeroSessionsAttempts` |
| Gen 14 bridge own_probe | `register`+`{}`+`error` | Shared verifier unchanged; carried forward |
| Gen 13 SCRAM | Projected passwords only | Transport derives from `projection.passwords` |
| Gen 11/12 interrupt | Short shell / nohup | Long-session contract + run-live-once + journal-watch `--follow` |
| Gen 9 omitted CA | Pinned CA required | `readPinnedSupabaseCa()` → verifier |

## Planned artefacts

| Artefact | Path / value |
|----------|----------------|
| Package ID | `tll-staging-generation-18-credentials/v1` |
| Window ID | `44e3fff5-5dff-4183-af6b-3cdfb367f1af` |
| Role predecessor | Gen 17 / `5728d807-701a-486b-a8c5-34bf89238275` (RECOVERY_REQUIRED / RECONCILIATION_REQUIRED; `failureStep: zero_sessions`; `failureReason: runtime_sessions_remain`; no connectionFailure) |
| Predecessor expiresAt | `2026-09-21T09:31:04.000Z` — from live Mac Gen 17 dispatch journal / connection-recovery record (state `RECONCILIATION_REQUIRED`). Prefer this dispatch-journal expiresAt over any contradictory recovery-SQL stamp. |
| Entry baseline | Expects `runtimeGeneration: 17` (Gen 17 retired inert runtime) |
| Staging project | credentials `PROJECT_REF` only (`qdmvngjwkcsilzmqksme`); production excluded forever |
| Manifest key | `generation18Successor` |
| Status | `DISABLED_SUCCESSOR_AWAITING_ARMING_REVIEW` |

## Zero-sessions + management classification contract

1. Connection probes close runtimes in `finally`.
2. Wait `ZERO_SESSIONS_DRAIN_CONVERGENCE_MS` (default 30s; hard cap 90s).
3. Prove ZERO_SESSIONS via Management API.
4. On non-201 responses, drain the JSON body; if it contains allow-listed phrases, reject with a normalized secret-free message (and attach numeric `managementStatusCode` when known).
5. `classifyZeroSessionsFailure` walks `error.cause` (depth-bounded).
6. Retry only while `failureReason === 'runtime_sessions_remain'` within `ZERO_SESSIONS_DRAIN_MAX_ATTEMPTS` (default 5; hard cap 8); otherwise surface `failureStep: 'zero_sessions'` + classified `failureReason` and optional `zeroSessionsAttempts`.
7. SQL proof text and ZERO_SESSIONS receipt requirements are unchanged (not weakened).

## Explicit stop before arming

This stage ends when the disabled package, live launcher, run-live-once wrapper, journal-watch follow mode, zero-sessions drain, management error mapping, evidence helpers, boundary coverage, tests and documentation are committed. The next gate is **independent review of the exact arming diff**. This PR must not contain that diff.

## Exclusions

- No gate enablement, Keychain access, native credential dispatch or hosted mutation.
- No rewrite of consumed Gen 6–17 journals or recovery evidence.
- No production Supabase; staging project only.
- No purchases, emails or supplier orders.
- No merge to `main` / `codex/tll-integration` tip without review.
- No Gen 11–17 replay.
- No arming diff in this PR.
- No Gen 17 replay.

## Verification order

1. Focused Gen 18 credentials/transport/DB/recovery/long-session/evidence/zero-sessions-drain + boundary + manifest tests.
2. `npm run check:live-boundaries`.
3. Manifest regenerate / pin check.
4. Disabled launcher CLI returns native-disabled without long-session env.
5. Full `npm test` if feasible; otherwise report focused set.
6. Diff review against this plan; commit; open PR into `codex/tll-integration`.
