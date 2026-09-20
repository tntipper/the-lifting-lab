# Generation 12 interrupted live attempt

## What happened

Phase 3 ran `scripts/staging-generation-12-live-launcher.mjs` once on the armed tip (merge of PR #23). The phase journal advanced to `VERCEL_STAGE` (within its bound). The launcher process then exited without writing a terminal journal outcome. This was treated as an **interrupted** creator process, not a stall (Gen 10/11 lesson). Operator waited until `assessStagingWindowProgress` reported `STALE_REQUIRES_RECONCILIATION`, then ran read-only reconcile.

## Actions taken

1. Did **not** restart or replay Generation 12 on the same journals.
2. Ran provider cleanup remove for staged Vercel/Supabase generated names (`ATTEMPTED_ERROR` / `PROVIDER_VALIDATION`, same class as Gen 11).
3. Independent readback: zero generated Vercel values, zero generated Supabase secrets, zero sessions.
4. Left dispatch journal at `INTENT_RECORDED` (replay lock). Left phase journal non-terminal as interrupt evidence.
5. Wrote local recovery evidence (`RECOVERY_AFTER_INTERRUPTED_LIVE_LAUNCHER`; window `6d4c5ed4-08a3-4d20-b580-cd03ab000e83`; package `tll-staging-generation-12-credentials/v1`; project `qdmvngjwkcsilzmqksme`; production excluded `wrhgscovsgsudtedbljr`; `replayPermitted: false`).
6. Disarmed Gen 12 native/Keychain/manifest/policy gates.

## Root cause (ops)

The live launcher was started via a short-lived remote shell/`nohup` session that did not keep the process alive for the full Vercel staging budget. Prevention: run the dedicated launcher in a long-lived foreground session (`block_until` covering Vercel+connection budgets, ~45 minutes) or a true launchd/detached service, with a separate journal observer (`scripts/staging-generation-12-journal-watch.mjs`). Never kill while `assessStagingWindowProgress` reports `ACTIVE_WITHIN_PHASE_BOUND`.

## Replay

Forbidden. Prepare a fresh successor generation only after this root cause is accepted and prevention is in place.
