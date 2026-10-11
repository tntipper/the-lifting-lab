# Generation 13 connection recovery (RECOVERY_VERIFIED)

## What happened

Phase 3 ran `scripts/staging-generation-13-run-live-once.mjs` once on the armed tip (merge of PR #26) in a **long-lived foreground session**. The Gen 11/12 short-shell/`nohup` kill did **not** recur — the long-session contract held the launcher alive through the phase budget.

The attempt completed a terminal phase journal outcome: `RECOVERY_VERIFIED` at phase `SUPABASE_CLEANUP`. Connection verification failed (Gen 9 class); cleanup succeeded. Dispatch journal ended `RECONCILIATION_REQUIRED` (not an INTENT_RECORDED-only interrupt).

## Evidence

- windowId `866b0e78-7530-493a-8963-e8cf24cf3067`
- package `tll-staging-generation-13-credentials/v1`
- projectRef `qdmvngjwkcsilzmqksme`; productionExcluded `wrhgscovsgsudtedbljr`
- Post-cleanup provider readback: 0 generated Vercel values, 0 generated Supabase secrets
- `replayPermitted: false`

## Actions taken

1. Did **not** restart or replay Generation 13 on the same journals.
2. Confirmed independent provider zero readback after cleanup.
3. Disarmed Gen 13 native/Keychain/manifest/policy gates.
4. Status → `CONNECTION_RECOVERY_VERIFIED_RECONCILIATION_REQUIRED_NO_REPLAY`.

## Long-session prevention

Worked. Foreground `run-live-once` + keepalive contract prevented the Gen 11/12 interrupt class. Do not regress to short-lived remote-shell/`nohup` for any future live attempt.

## Next (no new window yet)

Diagnosis accepted in `2026-09-21-generation-13-connection-diagnosis.md`: Gen 9 CA omission is not Gen 13; strongest cause is SCRAM/password projection mismatch (fixed on the diagnosis branch). Do not open a new credential window until Gen 14 bakes in that fix plus secret-free `connectionFailure` persistence. Replay of Gen 13 remains forbidden.

## Replay

Forbidden. Fresh successor only after connection root-cause acceptance — not before.
