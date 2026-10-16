# Generation 17 connection recovery (RECOVERY_REQUIRED / zero_sessions runtime_sessions_remain)

## What happened

Phase 3 ran `scripts/staging-generation-17-run-live-once.mjs` once on the armed tip (merge of PR #39, HEAD around `ef4ac01`) in a **long-lived foreground session** with caffeinate (~08:36–08:41Z on 2026-09-21). The Gen 11/12 short-shell/`nohup` kill did **not** recur — the long-session contract held the launcher alive through the phase budget.

Observed phase journal (watch):

`VERCEL_STAGE` → `SUPABASE_STAGE` → `CONNECTION_VERIFICATION` (~134s — longer than Gen 16’s ~100s, consistent with drain retries firing) → `VERCEL_CLEANUP` → `SUPABASE_CLEANUP` / `RECOVERY_REQUIRED`

Terminal outcome:

- Phase journal: `TERMINAL` / phase `SUPABASE_CLEANUP` / outcome **`RECOVERY_REQUIRED`**
- Dispatch journal: **`RECONCILIATION_REQUIRED`** (replay locked)
- Live-session summary / on-disk connection-failure evidence (secret-free):

```json
{"failedPhase":"CONNECTION_VERIFICATION","recoveryOutcome":"RECOVERY_REQUIRED","connectionFailurePresent":false,"failureStep":"zero_sessions","failureReason":"runtime_sessions_remain"}
```

Note: `failureReason` is **`runtime_sessions_remain`**, not Gen 16’s collapsed `unavailable`. PR #37 management non-201 body mapping **worked**. Bounded drain (3 × 16s) was **not** enough for hosted pooler/session teardown.

## Evidence (secret-free; observed)

- windowId `5728d807-701a-486b-a8c5-34bf89238275`
- package `tll-staging-generation-17-credentials/v1`
- projectRef / target `qdmvngjwkcsilzmqksme`
- expiresAt `2026-09-21T09:31:04.000Z`
- Phase journal: `TERMINAL` / `SUPABASE_CLEANUP` / `RECOVERY_REQUIRED`
- Dispatch journal: `RECONCILIATION_REQUIRED` (replay locked)
- `replayPermitted: false`
- On-disk connection-failure.json present with the fields above
- `connectionFailurePresent: false` (no probe purpose/check evidence)
- `failureStep: zero_sessions`
- `failureReason: runtime_sessions_remain`

## Actions taken

1. Did **not** restart or replay Generation 17 on the same journals.
2. Disarmed Gen 17 native/Keychain/manifest/policy gates.
3. Status → `CONNECTION_RECOVERY_REQUIRED_RECONCILIATION_REQUIRED_NO_REPLAY`.
4. Recorded runtime-sessions-remain diagnosis in `2026-09-21-generation-17-runtime-sessions-remain-diagnosis.md`.
5. Increased Gen 17 tip drain constants (convergence wait + max attempts) and persist secret-free `zeroSessionsAttempts` on failure so Gen 18 can clone helpers. SQL proof unchanged. Gen 18 package **not** built. No arm. No live.

## Long-session prevention

Worked. Foreground `run-live-once` + keepalive/caffeinate contract prevented the Gen 11/12 interrupt class. Do not regress to short-lived remote-shell/`nohup` for any future live attempt.

## Next (no new window yet)

Do **not** open a new credential window on Gen 17. Diagnosis in the sibling doc. Fresh successor is Gen 18+ only after diagnosis acceptance. Replay of Gen 17 remains forbidden.

## Replay

Forbidden. Fresh successor only after recovery-diagnosis acceptance — not before.
