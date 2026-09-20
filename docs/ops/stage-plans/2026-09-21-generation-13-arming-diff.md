# Generation 13 arming diff

## Outcome

Arm Generation 13 for one independently reviewed staging credential window. This change flips only the Gen 13 native/Keychain/manifest/policy gates. It does not run the live launcher and does not mutate staging or production.

## Exact flags flipped

| Location | Flag | Before | After |
|----------|------|--------|-------|
| `scripts/staging-generation-13-transport.mjs` | `NATIVE_GENERATION_13_TRANSPORT_ENABLED` | `false` | `true` |
| `scripts/staging-generation-13-database-transport.mjs` | `NATIVE_GENERATION_13_DATABASE_TRANSPORT_ENABLED` | `false` | `true` |
| `scripts/staging-generation-13-keychain.py` | `APPROVED_NATIVE_READ` | `False` | `True` |
| `scripts/staging-account-activation-manifest.mjs` → `generation13Successor.nativeTransportEnabled` | | `false` | `true` |
| `generation13Successor.status` | | `DISABLED_SUCCESSOR_AWAITING_ARMING_REVIEW` | `ONE_STAGING_WINDOW_AUTHORIZED` |
| `stageSafety.generation13Armed` / `config/project-stage-gate-policy.json` `currentHold.generation13Armed` | | `false` | `true` |
| Policy hold reason | | `generation-13-disabled-successor-prepared-gen12-intent-locked-no-replay-awaiting-arming-review` | `generation-13-one-reviewed-staging-window-authorized-requires-direct-live-launcher-and-phase-journal-ordinary-tests-forbidden-while-armed` |

Pinned sha256 values for every Gen 13 / stage-safety source whose content changed are recomputed in `config/staging-account-activation-manifest.json`. Staging target remains `qdmvngjwkcsilzmqksme`. Production `wrhgscovsgsudtedbljr` stays excluded. Credentials `windowId` / `packageId` are unchanged from the disabled successor mint.

## Merge = arm; live run is later (Phase 3)

Merging this PR **is** the arm. A live Gen 13 attempt is a **separate Phase 3** that still requires explicit Toby yes and must use **only**:

```text
scripts/staging-generation-13-run-live-once.mjs
```

Do not merge without that arming yes. Do not run the live launcher from this PR tip without Phase 3 approval. Do not invoke the launcher via short-lived remote-shell/`nohup`.

## Long-session contract (required while armed)

When gates are true, the live launcher refuses native work / journal claim unless:

1. `TLL_LIVE_LONG_SESSION=1`
2. Parent-held keepalive JSON via `TLL_LIVE_KEEPALIVE_PATH` (held by `run-live-once`)
3. Process is not an orphan (`ppid<=1`) or `nohup` child

Plan ~45 minutes wall clock (VERCEL_STAGE alone up to 660s; CONNECTION_VERIFICATION up to 420s). Monitor only from a **separate** read-only observer (`scripts/staging-generation-13-journal-watch.mjs` / `assessStagingWindowProgress`). Never kill while `ACTIVE_WITHIN_PHASE_BOUND`.

## Never `npm test` while armed

On the armed tip, `npm run check:live-boundaries` **must fail closed**. That is correct. Never run ordinary `npm test` (or any suite that runs the boundary preflight) while Gen 13 is armed. Focused injected Gen 13 / manifest tests may be run without the boundary preflight; that is not a green full suite.

Do **not** “fix” the live-boundary failure by disarming on this arming branch.

## Gen 11 / Gen 12 — no replay

Generation 11 and Generation 12 remain `INTENT_RECORDED` / intent-locked. `generation11Armed` and `generation12Armed` stay `false`. Replay of Gen 11 or Gen 12 is forbidden. Gen 10 remains the role/DB predecessor for Gen 13.

## Gen 11/12 interrupt lessons that bind this arm

1. One supported operator entry only: `scripts/staging-generation-13-run-live-once.mjs` (sets long-session env, holds keepalive, foreground launcher).
2. Never start via short-lived remote-shell/`nohup` — that was the Gen 11/12 interrupt root cause.
3. Separate journal-watch / `assessStagingWindowProgress` observer only.
4. Exclusive dispatch journal is claimed before material generation.
5. Disarm after any live attempt or if the arm is abandoned.

## Disarm

After any live attempt — success, failure, interruption, or abandonment of the arm — disarm by restoring every Gen 13 gate above to the disabled values, regenerating manifest pins, and restoring `generation13Armed: false` with an updated hold reason. Do not leave the repository armed.

## Reviewer diff

Use `gh pr diff` (or the forge PR files view) for the machine-readable unified diff. Do not invent credential or journal files under `implementation-state`; that tree is local-only.
