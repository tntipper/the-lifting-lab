# Generation 16 connection recovery (RECOVERY_REQUIRED / zero_sessions unavailable)

## What happened

Phase 3 ran `scripts/staging-generation-16-run-live-once.mjs` once on the armed tip (merge of PR #36, HEAD around `b13a36c`) in a **long-lived foreground session** with caffeinate (~07:47–07:51Z on 2026-09-21). The Gen 11/12 short-shell/`nohup` kill did **not** recur — the long-session contract held the launcher alive through the phase budget.

Observed phase journal (watch):

`VERCEL_STAGE` (~60s) → `CONNECTION_VERIFICATION` (~100s including drain/retries) → `DATABASE_RECOVERY` → `VERCEL_CLEANUP` → `SUPABASE_CLEANUP`

Terminal outcome:

- Phase journal: `TERMINAL` / phase `SUPABASE_CLEANUP` / outcome **`RECOVERY_REQUIRED`**
- Dispatch journal: **`RECONCILIATION_REQUIRED`** (replay locked)
- Live-session summary / on-disk connection-failure evidence (secret-free):

```json
{"failedPhase":"CONNECTION_VERIFICATION","recoveryOutcome":"RECOVERY_REQUIRED","connectionFailurePresent":false,"failureStep":"zero_sessions","failureReason":"unavailable"}
```

Note: `failureReason` is **`unavailable`**, not `runtime_sessions_remain` or `control_enabled`. Drain retries for session-remain either did not apply, or the throw was classified as generic unavailable (receipt/API/SQL shape).

## Evidence (secret-free; observed)

- windowId `313afec9-46d0-41bb-af47-0be277c6fa4f`
- package `tll-staging-generation-16-credentials/v1`
- projectRef / target `qdmvngjwkcsilzmqksme`
- expiresAt `2026-09-21T08:42:01.000Z`
- Phase journal: `TERMINAL` / `SUPABASE_CLEANUP` / `RECOVERY_REQUIRED`
- Dispatch journal: `RECONCILIATION_REQUIRED` (replay locked)
- `replayPermitted: false`
- On-disk connection-failure.json present with the fields above
- `connectionFailurePresent: false` (no probe purpose/check evidence)
- `failureStep: zero_sessions`
- `failureReason: unavailable`

## Actions taken

1. Did **not** restart or replay Generation 16 on the same journals.
2. Disarmed Gen 16 native/Keychain/manifest/policy gates.
3. Status → `CONNECTION_RECOVERY_REQUIRED_RECONCILIATION_REQUIRED_NO_REPLAY`.
4. Recorded zero-sessions/`unavailable` diagnosis in `2026-09-21-generation-16-zero-sessions-unavailable-diagnosis.md`.
5. Fixed Gen 16 management-query classification so allow-listed SQL RAISE text (`runtime sessions remain` / `control enabled`) is no longer collapsed to generic `unavailable` before drain retries (Gen 17 inherits; Gen 17 package not implemented).

## Long-session prevention

Worked. Foreground `run-live-once` + keepalive/caffeinate contract prevented the Gen 11/12 interrupt class. Do not regress to short-lived remote-shell/`nohup` for any future live attempt.

## Next (no new window yet)

Do **not** open a new credential window on Gen 16. Diagnosis in the sibling doc. Fresh successor is Gen 17+ only after diagnosis acceptance. Replay of Gen 16 remains forbidden.

## Replay

Forbidden. Fresh successor only after recovery-diagnosis acceptance — not before.
