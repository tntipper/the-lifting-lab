# Generation 15 connection recovery (RECOVERY_REQUIRED)

## What happened

Phase 3 ran `scripts/staging-generation-15-run-live-once.mjs` once on the armed tip (merge of PR #33, HEAD around `816389f`) in a **long-lived foreground session** with caffeinate (~06:52–06:56Z on 2026-09-21). The Gen 11/12 short-shell/`nohup` kill did **not** recur — the long-session contract held the launcher alive through the phase budget.

Observed phase journal (watch):

`VERCEL_STAGE` → `PROVIDER_READBACK` → `CONNECTION_VERIFICATION` (~80s) → `DATABASE_RECOVERY` → `VERCEL_CLEANUP` → `SUPABASE_CLEANUP`

Terminal outcome:

- Phase journal: `TERMINAL` / phase `SUPABASE_CLEANUP` / outcome **`RECOVERY_REQUIRED`**
- Dispatch journal: **`RECONCILIATION_REQUIRED`** (replay locked)
- Live-session summary: `launcherStatus: RECOVERY_REQUIRED`, **no `connectionFailure` field**
- **No** `tll-generation-15-connection-failure.json` on disk

Contrast Gen 14: same `RECOVERY_REQUIRED` / `RECONCILIATION_REQUIRED`, but with persisted secret-free evidence:

```json
{"status":"FAIL","reason":"connection_verification_failed","purpose":"bridge","check":"own_probe"}
```

## Evidence (secret-free; observed)

- windowId `2ec1dcbb-dd43-4a45-893b-3b4dc4140188`
- package `tll-staging-generation-15-credentials/v1`
- projectRef / target `qdmvngjwkcsilzmqksme`
- expiresAt `2026-09-21T07:47:28.000Z`
- Phase journal: `TERMINAL` / `SUPABASE_CLEANUP` / `RECOVERY_REQUIRED`
- Dispatch journal: `RECONCILIATION_REQUIRED` (replay locked)
- `replayPermitted: false`
- **Missing:** `connectionFailure` on live-session summary and on-disk connection-failure evidence file

## Actions taken

1. Did **not** restart or replay Generation 15 on the same journals.
2. Disarmed Gen 15 native/Keychain/manifest/policy gates.
3. Status → `CONNECTION_RECOVERY_REQUIRED_RECONCILIATION_REQUIRED_NO_REPLAY`.
4. Recorded recovery diagnosis in `2026-09-21-generation-15-recovery-diagnosis.md`.
5. Closed the Gen 15 evidence gap so any future RECOVERY_* path persists `failedPhase`, `connectionFailurePresent`, and `recoveryOutcome` even when probe evidence is absent (inherited by Gen 16 helpers; Gen 16 package not implemented).

## Long-session prevention

Worked. Foreground `run-live-once` + keepalive/caffeinate contract prevented the Gen 11/12 interrupt class. Do not regress to short-lived remote-shell/`nohup` for any future live attempt.

## Next (no new window yet)

Do **not** open a new credential window on Gen 15. Diagnosis in the sibling doc. Fresh successor is Gen 16+ only after diagnosis acceptance. Replay of Gen 15 remains forbidden.

## Replay

Forbidden. Fresh successor only after recovery-diagnosis acceptance — not before.
