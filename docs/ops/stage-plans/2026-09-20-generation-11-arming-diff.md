# Generation 11 arming diff

## Outcome

Arm Generation 11 for one independently reviewed staging credential window. This change flips only the Gen 11 native/Keychain/manifest/policy gates. It does not run the live launcher and does not mutate staging or production.

## Exact flags flipped

| Location | Flag | Before | After |
|----------|------|--------|-------|
| `scripts/staging-generation-11-transport.mjs` | `NATIVE_GENERATION_11_TRANSPORT_ENABLED` | `false` | `true` |
| `scripts/staging-generation-11-database-transport.mjs` | `NATIVE_GENERATION_11_DATABASE_TRANSPORT_ENABLED` | `false` | `true` |
| `scripts/staging-generation-11-keychain.py` | `APPROVED_NATIVE_READ` | `False` | `True` |
| `scripts/staging-account-activation-manifest.mjs` → `generation11Successor.nativeTransportEnabled` | | `false` | `true` |
| `generation11Successor.status` | | `DISABLED_SUCCESSOR_PENDING_ARMING_REVIEW` | `ONE_STAGING_WINDOW_AUTHORIZED` |
| `stageSafety.generation11Armed` / `config/project-stage-gate-policy.json` `currentHold.generation11Armed` | | `false` | `true` |
| Policy hold reason | | `generation-11-disabled-package-pending-arming-review` | `generation-11-one-reviewed-staging-window-authorized-requires-direct-live-launcher-and-phase-journal-ordinary-tests-forbidden-while-armed` |

Pinned sha256 values for every Gen 11 source whose content changed are recomputed in `config/staging-account-activation-manifest.json`. Staging target remains `qdmvngjwkcsilzmqksme`. Production `wrhgscovsgsudtedbljr` stays excluded.

## Gen 10 lessons that still bind

1. Never run `npm test` (or any ordinary suite that runs `check:live-boundaries`) while armed.
2. One direct launcher process only: `scripts/staging-generation-11-live-launcher.mjs`, invoked after separate Phase 3 approval.
3. Monitor only from a separate read-only observer that reads the phase journal and its phase-specific deadlines. Do not infer a stall from silence, missing children, or sockets.
4. Exclusive dispatch journal is claimed before material generation.
5. Generation 10 remains consumed and non-replayable.

## Merge = arm; live run is later

Merging this PR **is** the arm. A live Gen 11 attempt is a separate Phase 3 that still requires explicit Toby yes. Do not merge without that arming yes. Do not run the live launcher from this PR tip without Phase 3 approval.

On the armed tip, `npm run check:live-boundaries` is expected to report violations (`enabled-native-gate`, `enabled-keychain-read`, and `policy:currentHold`). That fail-closed behaviour is correct until the window is disarmed.

## Disarm

After any live attempt — success, failure, interruption, or abandonment of the arm — disarm by restoring every Gen 11 gate above to the disabled values, regenerating manifest pins, and restoring `generation11Armed: false` with an updated hold reason. Do not leave the repository armed.

## Reviewer diff

Use `gh pr diff` (or the forge PR files view) for the machine-readable unified diff. Do not invent credential or journal files under `implementation-state`; that tree is local-only.
