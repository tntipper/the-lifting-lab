# Generation 14 connection recovery (RECOVERY_REQUIRED)

## What happened

Phase 3 ran `scripts/staging-generation-14-run-live-once.mjs` once on the armed tip (merge of PR #30, HEAD around `e0039c9`) in a **long-lived foreground session** (~06:23–06:27Z on 2026-09-21). The Gen 11/12 short-shell/`nohup` kill did **not** recur — the long-session contract held the launcher alive through the phase budget.

The attempt completed a terminal phase journal outcome: `RECOVERY_REQUIRED` at phase `SUPABASE_CLEANUP`. Connection verification failed; dispatch journal ended `RECONCILIATION_REQUIRED` (replay locked). Unlike Gen 13’s `RECOVERY_VERIFIED`, database recovery did not fully verify before cleanup continued.

## Evidence (secret-free; persisted)

```json
{"status":"FAIL","reason":"connection_verification_failed","purpose":"bridge","check":"own_probe"}
```

- windowId `a8955fc3-2347-4544-b04e-55a2cb6fe7aa`
- package `tll-staging-generation-14-credentials/v1`
- projectRef / target `qdmvngjwkcsilzmqksme`
- Phase journal: `TERMINAL` / phase `SUPABASE_CLEANUP` / outcome `RECOVERY_REQUIRED`
- Dispatch journal: `RECONCILIATION_REQUIRED` (replay locked)
- `replayPermitted: false`

## Actions taken

1. Did **not** restart or replay Generation 14 on the same journals.
2. Disarmed Gen 14 native/Keychain/manifest/policy gates.
3. Status → `CONNECTION_RECOVERY_REQUIRED_RECONCILIATION_REQUIRED_NO_REPLAY`.
4. Recorded bridge/`own_probe` diagnosis in `2026-09-21-generation-14-bridge-own-probe-diagnosis.md`.

## Long-session prevention

Worked. Foreground `run-live-once` + keepalive contract prevented the Gen 11/12 interrupt class. Do not regress to short-lived remote-shell/`nohup` for any future live attempt.

## Next (no new window yet)

Do **not** open a new credential window on Gen 14. Diagnosis in the sibling doc: SCRAM projection fix from PR #28 held far enough that earlier purposes passed; failure is at bridge `own_probe`, not connect/auth. Fresh successor is Gen 15+ only after diagnosis acceptance and probe/evidence fixes. Replay of Gen 14 remains forbidden.

## Replay

Forbidden. Fresh successor only after bridge/`own_probe` root-cause acceptance — not before.
