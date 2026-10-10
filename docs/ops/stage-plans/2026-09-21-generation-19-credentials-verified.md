# Generation 19 credentials verified (CREDENTIALS_VERIFIED_CONTROLS_DISABLED)

## What happened

Phase 3 ran `scripts/staging-generation-19-run-live-once.mjs` once on the armed tip (merge of PR #45, HEAD around `12dd84b`) in a **long-lived foreground session** with caffeinate (~10:13–10:18Z on 2026-09-21). Exit 0. The Gen 11/12 short-shell/`nohup` kill did **not** recur — the long-session contract held.

Phases progressed `VERCEL_STAGE` → `CONNECTION_VERIFICATION` (~200s — Gen 17/19 drain budget 30s × 5 worked) → success. No `RECOVERY_REQUIRED`.

Terminal outcome (secret-free stdout / live-session summary):

```json
{"status":"CREDENTIALS_VERIFIED_CONTROLS_DISABLED","target":"qdmvngjwkcsilzmqksme","generation":19,"windowId":"51809dd4-bd4b-44c7-8609-7dd8ca063679","failedPhase":null,"recoveryOutcome":null,"connectionFailurePresent":false}
```

## Evidence (secret-free; observed)

- windowId `51809dd4-bd4b-44c7-8609-7dd8ca063679`
- package `tll-staging-generation-19-credentials/v1`
- projectRef / target `qdmvngjwkcsilzmqksme`
- `status: CREDENTIALS_VERIFIED_CONTROLS_DISABLED`
- `failedPhase: null`
- `recoveryOutcome: null`
- `connectionFailurePresent: false`
- `replayPermitted: false`
- CONNECTION_VERIFICATION completed (~200s); drain budget held

## Actions taken

1. Did **not** restart or replay Generation 19 on the same journals.
2. Disarmed Gen 19 native/Keychain/manifest/policy gates.
3. Status → `CREDENTIALS_VERIFIED_CONTROLS_DISABLED_NO_REPLAY`.
4. Recorded this secret-free evidence doc. No live re-run. WINDOW_ID / PACKAGE_ID unchanged. Drain / SCRAM / bridge / pin contracts unchanged.

## Long-session prevention

Worked through the full phase budget including ~200s CONNECTION_VERIFICATION. Foreground `run-live-once` + keepalive/caffeinate remain mandatory for any future live attempt. Do not regress to short-lived remote-shell/`nohup`.

## Next (no new window yet)

Do **not** open a new credential window on Gen 19. Replay of Gen 19 remains forbidden. Fresh successor only after independent boundary review.

## Replay

Forbidden. Verified window is closed and disarmed — no replay.
