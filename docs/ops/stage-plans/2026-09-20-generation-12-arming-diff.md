# Generation 12 arming diff

## Outcome

Arm Generation 12 for one independently reviewed staging credential window. This change flips only the Gen 12 native/Keychain/manifest/policy gates. It does not run the live launcher and does not mutate staging or production.

## Exact flags flipped

| Location | Flag | Before | After |
|----------|------|--------|-------|
| `scripts/staging-generation-12-transport.mjs` | `NATIVE_GENERATION_12_TRANSPORT_ENABLED` | `false` | `true` |
| `scripts/staging-generation-12-database-transport.mjs` | `NATIVE_GENERATION_12_DATABASE_TRANSPORT_ENABLED` | `false` | `true` |
| `scripts/staging-generation-12-keychain.py` | `APPROVED_NATIVE_READ` | `False` | `True` |
| `scripts/staging-account-activation-manifest.mjs` → `generation12Successor.nativeTransportEnabled` | | `false` | `true` |
| `generation12Successor.status` | | `DISABLED_SUCCESSOR_AWAITING_ARMING_REVIEW` | `ONE_STAGING_WINDOW_AUTHORIZED` |
| `stageSafety.generation12Armed` / `config/project-stage-gate-policy.json` `currentHold.generation12Armed` | | `false` | `true` |
| Policy hold reason | | `generation-12-disabled-successor-prepared-gen11-intent-locked-no-replay-awaiting-arming-review` | `generation-12-one-reviewed-staging-window-authorized-requires-direct-live-launcher-and-phase-journal-ordinary-tests-forbidden-while-armed` |

Pinned sha256 values for every Gen 12 source whose content changed are recomputed in `config/staging-account-activation-manifest.json`. Staging target remains `qdmvngjwkcsilzmqksme`. Production `wrhgscovsgsudtedbljr` stays excluded.

## Gen 11 long-session lessons that bind this arm

1. Never run `npm test` (or any ordinary suite that runs `check:live-boundaries`) while armed. Focused injected tests may pass when invoked without the boundary preflight; that is not a green full suite.
2. One direct launcher process only: `scripts/staging-generation-12-live-launcher.mjs`, invoked after separate Phase 3 approval. Plan ~45 minutes wall clock (VERCEL_STAGE alone up to 660s; CONNECTION_VERIFICATION up to 420s).
3. Do **not** start the launcher via short-lived remote-shell/`nohup` that dies with the parent session — that was the Gen 11 interrupt root cause. Use a long-lived foreground session (or equivalent) that covers the full phase budgets.
4. Monitor only from a **separate** read-only observer (`scripts/staging-generation-12-journal-watch.mjs` / `assessStagingWindowProgress`) that reads the phase journal and its phase-specific deadlines. Do not infer a stall from silence, missing children, or sockets.
5. Never kill or reconcile while `assessStagingWindowProgress` reports `ACTIVE_WITHIN_PHASE_BOUND`.
6. Exclusive dispatch journal is claimed before material generation.
7. Generation 10/11 remain consumed and non-replayable.

## Merge = arm; live run is later

Merging this PR **is** the arm. A live Gen 12 attempt is a separate Phase 3 that still requires explicit Toby yes. Do not merge without that arming yes. Do not run the live launcher from this PR tip without Phase 3 approval.

On the armed tip, `npm run check:live-boundaries` is expected to fail closed. Observed on this tip:

```
Staging live boundary unavailable: enabled-keychain-read:scripts/staging-generation-12-keychain.py, enabled-native-gate:scripts/staging-generation-12-database-transport.mjs, enabled-native-gate:scripts/staging-generation-12-transport.mjs, policy:currentHold
```

That fail-closed behaviour is correct until the window is disarmed. Never claim a green full `npm test` while armed.

## Disarm

After any live attempt — success, failure, interruption, or abandonment of the arm — disarm by restoring every Gen 12 gate above to the disabled values, regenerating manifest pins, and restoring `generation12Armed: false` with an updated hold reason. Do not leave the repository armed.

## Reviewer diff

Use `gh pr diff` (or the forge PR files view) for the machine-readable unified diff. Do not invent credential or journal files under `implementation-state`; that tree is local-only.
