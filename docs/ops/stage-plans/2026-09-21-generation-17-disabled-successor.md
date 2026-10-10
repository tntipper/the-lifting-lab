# Generation 17 disabled successor (Phase 1)

## Outcome

Prepare a fresh, fully disabled Generation 17 credential package and dedicated live-launcher stack derived from the Generation 16 tip (post–PR #37). Inherit Gen 16’s **zero-sessions drain** and the **management-API non-201 body classification** fix from day one so allow-listed SQL RAISE phrases (`runtime sessions remain` / `control enabled`) are no longer collapsed to generic `unavailable` before drain retries. Leave every native gate disarmed. Do not arm, do not run a live attempt, and do not touch production.

## Acceptance criteria

- Generation 17 package ids, window id, transport modules, database transport, keychain helper, recovery artefacts, credentials dispatch journal schema and tests exist and mirror Generation 16 tip helpers (`postManagementQuery`, `classifyZeroSessionsFailure` cause walk, `verifyGeneration17ZeroSessionsAfterPoolerDrain`).
- Management non-201 JSON bodies are drained; allow-listed RAISE phrases are promoted to secret-free messages; drain retries arm only for `runtime_sessions_remain`.
- After Gen-6 connection probes succeed (runtimes closed in `finally`), the live launcher waits `POOLER_CONVERGENCE_MS` then proves zero sessions, with bounded retries only while `failureReason === 'runtime_sessions_remain'`.
- RECOVERY_* evidence retains Gen 16 fields (`failedPhase`, `connectionFailurePresent`, `recoveryOutcome`, `failureStep`, `failureReason`, optional `connectionFailure`) and may persist secret-free `managementStatusCode` (HTTP number only) when known.
- Bridge own_probe remains `register` + `{}` + expected `error` on the shared Gen-6 verifier.
- SCRAM verifiers derive from projected passwords; pinned Supabase CA remains wired; long-session `run-live-once` + keepalive + journal-watch `--follow` remain.
- Ordinary Gen 17 transport modules are injected-only: no native credential window runner, no credential-bearing imports, `NATIVE_*_ENABLED = false`, keychain `APPROVED_NATIVE_READ = False`.
- Manifest pins Gen 17 artefacts with `nativeTransportEnabled: false` / `generation17Armed: false`, and keeps Gen 11–16 non-replayable.
- No arming diff, no live process, no hosted mutation, no Gen 6–16 journal rewrite.

## Lessons baked in from day one

| Source | Lesson | Gen 17 enforcement |
|--------|--------|--------------------|
| Gen 16 live `zero_sessions` / `unavailable` (PR #37 diagnosis) | Tip `postManagementQuery` discarded non-201 bodies → classifier never saw RAISE text → drain retries never armed | Clone Gen 16 tip transport: drain non-201 bodies; promote allow-listed phrases; `classifyZeroSessionsFailure` walks `cause`; retries only for `runtime_sessions_remain` |
| Gen 16 zero-sessions drain | Post-probe pooler sessions can linger | `POOLER_CONVERGENCE_MS` wait + bounded retries |
| Gen 15/16 RECOVERY_* evidence | Operators need secret-free failure fields | Carry `failedPhase`, `connectionFailurePresent`, `recoveryOutcome`, `failureStep`, `failureReason`; optional `managementStatusCode` |
| Gen 14 bridge own_probe | `register`+`{}`+`error` | Shared verifier unchanged; carried forward |
| Gen 13 SCRAM | Projected passwords only | Transport derives from `projection.passwords` |
| Gen 11/12 interrupt | Short shell / nohup | Long-session contract + run-live-once + journal-watch `--follow` |
| Gen 9 omitted CA | Pinned CA required | `readPinnedSupabaseCa()` → verifier |

## Planned artefacts

| Artefact | Path / value |
|----------|----------------|
| Package ID | `tll-staging-generation-17-credentials/v1` |
| Window ID | `5728d807-701a-486b-a8c5-34bf89238275` |
| Role predecessor | Gen 16 / `313afec9-46d0-41bb-af47-0be277c6fa4f` (RECOVERY_REQUIRED / RECONCILIATION_REQUIRED; `failureStep: zero_sessions`; `failureReason: unavailable`; no connectionFailure) |
| Predecessor expiresAt | `2026-09-21T08:42:01.000Z` — from live Mac Gen 16 dispatch journal `tll-generation-16-credential-dispatch.json` (state `RECONCILIATION_REQUIRED`). Prefer this dispatch-journal expiresAt over any contradictory recovery-SQL stamp. |
| Entry baseline | Expects `runtimeGeneration: 16` (Gen 16 retired inert runtime) |
| Staging project | credentials `PROJECT_REF` only (`qdmvngjwkcsilzmqksme`); production excluded forever |
| Manifest key | `generation17Successor` |
| Status | `DISABLED_SUCCESSOR_AWAITING_ARMING_REVIEW` |

## Zero-sessions + management classification contract

1. Connection probes close runtimes in `finally`.
2. Wait `POOLER_CONVERGENCE_MS`.
3. Prove ZERO_SESSIONS via Management API.
4. On non-201 responses, drain the JSON body; if it contains allow-listed phrases, reject with a normalized secret-free message (and attach numeric `managementStatusCode` when known).
5. `classifyZeroSessionsFailure` walks `error.cause` (depth-bounded).
6. Retry only while `failureReason === 'runtime_sessions_remain'` within a small bound; otherwise surface `failureStep: 'zero_sessions'` + classified `failureReason`.
7. SQL proof text and ZERO_SESSIONS receipt requirements are unchanged (not weakened).

## Explicit stop before arming

This stage ends when the disabled package, live launcher, run-live-once wrapper, journal-watch follow mode, zero-sessions drain, management error mapping, evidence helpers, boundary coverage, tests and documentation are committed. The next gate is **independent review of the exact arming diff**. This PR must not contain that diff.

## Exclusions

- No gate enablement, Keychain access, native credential dispatch or hosted mutation.
- No rewrite of consumed Gen 6–16 journals or recovery evidence.
- No production Supabase; staging project only.
- No purchases, emails or supplier orders.
- No merge to `main` / `codex/tll-integration` tip without review.
- No Gen 11–16 replay.
- No arming diff in this PR.

## Verification order

1. Focused Gen 17 credentials/transport/DB/recovery/long-session/evidence/zero-sessions-drain + boundary + manifest tests.
2. `npm run check:live-boundaries`.
3. Manifest regenerate / pin check.
4. Disabled launcher CLI returns native-disabled without long-session env.
5. Full `npm test` if feasible; otherwise report focused set.
6. Diff review against this plan; commit; open PR into `codex/tll-integration`.
