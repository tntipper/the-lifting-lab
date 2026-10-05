# Generation 16 disabled successor (Phase 1)

## Outcome

Prepare a fresh, fully disabled Generation 16 credential package and dedicated live-launcher stack derived from the Generation 15 Phase 1 shape. Bake in a **pooler-drain before zero-sessions proof** so post-probe Supavisor sessions can converge (leading Gen 15 RECOVERY_REQUIRED inference), inherit Gen 15 RECOVERY_* evidence fields, and add allow-listed `failureReason` on zero-sessions failures. Leave every native gate disarmed. Do not arm, do not run a live attempt, and do not touch production.

## Acceptance criteria

- Generation 16 package ids, window id, transport modules, database transport, keychain helper, recovery artefacts, credentials dispatch journal schema and tests exist and mirror Generation 15 with zero-sessions drain + evidence bake-ins from day one.
- After Gen-6 connection probes succeed (runtimes closed in `finally`), the live launcher waits `POOLER_CONVERGENCE_MS` then proves zero sessions, with bounded retries only while `failureReason === 'runtime_sessions_remain'`.
- Zero-sessions permanent failures always surface `failureStep: 'zero_sessions'` plus allow-listed `failureReason`: `runtime_sessions_remain` | `control_enabled` | `receipt_mismatch` | `unavailable`.
- RECOVERY_* evidence retains Gen 15 fields (`failedPhase`, `connectionFailurePresent`, `recoveryOutcome`, `failureStep`, optional `connectionFailure`) and projects `failureReason` when present.
- Bridge own_probe remains `register` + `{}` + expected `error` on the shared Gen-6 verifier.
- SCRAM verifiers derive from projected passwords; pinned Supabase CA remains wired; long-session `run-live-once` + keepalive + journal-watch `--follow` remain.
- Ordinary Gen 16 transport modules are injected-only: no native credential window runner, no credential-bearing imports, `NATIVE_*_ENABLED = false`, keychain `APPROVED_NATIVE_READ = False`.
- Manifest pins Gen 16 artefacts with `nativeTransportEnabled: false` / `generation16Armed: false`, and keeps Gen 11–15 non-replayable.
- No arming diff, no live process, no hosted mutation, no Gen 6–15 journal rewrite.

## Lessons baked in from day one

| Source | Lesson | Gen 16 enforcement |
|--------|--------|--------------------|
| Gen 15 live RECOVERY_REQUIRED without connectionFailure | Zero-sessions after probes likely failed while pooler sessions still visible; evidence helpers lacked RECOVERY_* fields | Drain/`POOLER_CONVERGENCE_MS` before + bounded retry on `runtime_sessions_remain`; inherit evidence fields + `failureReason` |
| Gen 14 bridge own_probe | `register`+`{}`+`error` | Shared verifier unchanged; carried forward |
| Gen 13 SCRAM | Projected passwords only | Transport derives from `projection.passwords` |
| Gen 11/12 interrupt | Short shell / nohup | Long-session contract + run-live-once + journal-watch `--follow` |
| Gen 9 omitted CA | Pinned CA required | `readPinnedSupabaseCa()` → verifier |

## Planned artefacts

| Artefact | Path / value |
|----------|----------------|
| Package ID | `tll-staging-generation-16-credentials/v1` |
| Window ID | `313afec9-46d0-41bb-af47-0be277c6fa4f` |
| Role predecessor | Gen 15 / `2ec1dcbb-dd43-4a45-893b-3b4dc4140188` (RECOVERY_REQUIRED / RECONCILIATION_REQUIRED; no connectionFailure) |
| Predecessor expiresAt | `2026-09-21T07:47:28.000Z` — from live Mac Gen 15 dispatch journal `tll-generation-15-credential-dispatch.json` (state `RECONCILIATION_REQUIRED`). Prefer this dispatch-journal expiresAt over any contradictory recovery-SQL stamp. |
| Entry baseline | Expects `runtimeGeneration: 15` (Gen 15 retired inert runtime) |
| Staging project | credentials `PROJECT_REF` only (`qdmvngjwkcsilzmqksme`); production excluded forever |
| Manifest key | `generation16Successor` |
| Status | `DISABLED_SUCCESSOR_AWAITING_ARMING_REVIEW` |

## Zero-sessions drain contract (before → after)

**Before (Gen 15):** `verifyGeneration6Connections` → immediately `verifyGeneration15ZeroSessions` inside the same CONNECTION_VERIFICATION port. Pooler teardown can still show runtime sessions; proof raises; launcher tags `failureStep:'zero_sessions'` only (post-fix).

**After (Gen 16):** `verifyGeneration6Connections` (closes runtimes in `finally`) → `verifyGeneration16ZeroSessionsAfterPoolerDrain` which (1) waits `POOLER_CONVERGENCE_MS`, (2) proves ZERO_SESSIONS, (3) on `runtime_sessions_remain` only, waits again and retries up to a small bound, (4) on permanent failure throws with `failureStep:'zero_sessions'` and classified `failureReason`. SQL proof is not weakened.

## Explicit stop before arming

This stage ends when the disabled package, live launcher, run-live-once wrapper, journal-watch follow mode, zero-sessions drain, evidence helpers, boundary coverage, tests and documentation are committed. The next gate is **independent review of the exact arming diff**. This PR must not contain that diff.

## Exclusions

- No gate enablement, Keychain access, native credential dispatch or hosted mutation.
- No rewrite of consumed Gen 6–15 journals or recovery evidence.
- No production Supabase; staging project only.
- No purchases, emails or supplier orders.
- No merge to `main` / `codex/tll-integration` tip without review.
- No Gen 11–15 replay.
- No arming diff in this PR.

## Verification order

1. Focused Gen 16 credentials/transport/DB/recovery/long-session/evidence/zero-sessions-drain + boundary + manifest tests.
2. `npm run check:live-boundaries`.
3. Manifest regenerate / pin check.
4. Disabled launcher CLI returns native-disabled without long-session env.
5. Full `npm test` if feasible; otherwise report focused set.
6. Diff review against this plan; commit; open PR into `codex/tll-integration`.
