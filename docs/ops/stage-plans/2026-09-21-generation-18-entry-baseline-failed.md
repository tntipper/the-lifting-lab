# Generation 18 entry baseline failed (ENTRY_BASELINE_FAILED / ENTRY_PREFLIGHT_RETRY)

## What happened

Phase 3 ran `scripts/staging-generation-18-run-live-once.mjs` once on the armed tip (merge of PR #42, HEAD around `a7fb462`) in a **long-lived foreground session** with caffeinate (~09:45:36–09:45:38Z on 2026-09-21, Europe/Madrid ~11:45). The launcher held ~2s then exited. The Gen 11/12 short-shell/`nohup` kill did **not** recur — the long-session contract held for the short entry window.

Never reached `VERCEL_STAGE` / `SUPABASE_STAGE` / `CONNECTION_VERIFICATION`. Gen 17’s longer zero-sessions drain (30s × 5) was **not** retested.

Observed phase journal:

`ENTRY_PREFLIGHT` → `ENTRY_PREFLIGHT_RETRY` → terminal **`STOPPED_BEFORE_DATABASE`**

Terminal outcome (secret-free stdout / live-session summary):

```json
{"status":"ENTRY_BASELINE_FAILED","target":"qdmvngjwkcsilzmqksme","generation":18,"windowId":"44e3fff5-5dff-4183-af6b-3cdfb367f1af","phase":"ENTRY_PREFLIGHT_RETRY","nextAction":"REVIEW_ENTRY_BASELINE","failedPhase":"ENTRY_PREFLIGHT_RETRY","recoveryOutcome":"NOT_REQUIRED","connectionFailurePresent":false,"managementStatusCode":400}
```

Session summary: launcherStatus `ENTRY_BASELINE_FAILED`, launcherFailedPhase `ENTRY_PREFLIGHT_RETRY`, recovery `NOT_REQUIRED`.

## Evidence (secret-free; observed)

- windowId `44e3fff5-5dff-4183-af6b-3cdfb367f1af`
- package `tll-staging-generation-18-credentials/v1`
- projectRef / target `qdmvngjwkcsilzmqksme`
- Phase journal: `STOPPED_BEFORE_DATABASE` / phase `ENTRY_PREFLIGHT_RETRY`
- Dispatch journal: not claimed (stopped before `JOURNAL_INTENT`)
- `replayPermitted: false`
- `connectionFailurePresent: false`
- `managementStatusCode: 400`
- Live tip did **not** yet persist `failureStep` / `failureReason` for entry (collapsed to generic unavailable). This disarm PR adds allow-listed entry classification for the next successor tip.

## Actions taken

1. Did **not** restart or replay Generation 18 on the same journals.
2. Disarmed Gen 18 native/Keychain/manifest/policy gates.
3. Status → `ENTRY_BASELINE_FAILED_NO_REPLAY`.
4. Recorded entry-baseline diagnosis in `2026-09-21-generation-18-entry-baseline-diagnosis.md`.
5. Helper improvements on Gen 18 tip (gates remain off): allow-listed entry RAISE phrase promotion, `failureStep: preflight` + allow-listed `failureReason`, persist `ENTRY_BASELINE_FAILED` evidence with `managementStatusCode`. Gen 19 package **not** built. No arm. No live.

## Long-session prevention

Worked for the short entry window. Foreground `run-live-once` + keepalive/caffeinate remain mandatory for any future live attempt. Do not regress to short-lived remote-shell/`nohup`.

## Next (no new window yet)

Do **not** open a new credential window on Gen 18. Diagnosis in the sibling doc. Fresh successor is Gen 19+ only after diagnosis acceptance. Replay of Gen 18 remains forbidden.

## Replay

Forbidden. Fresh successor only after entry-baseline diagnosis acceptance — not before.
