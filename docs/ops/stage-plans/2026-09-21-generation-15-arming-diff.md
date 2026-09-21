# Generation 15 arming diff

## Outcome

Arm Generation 15 for one independently reviewed staging credential window. This change flips only the Gen 15 native/Keychain/manifest/policy gates. It does not run the live launcher and does not mutate staging or production.

## Exact flags flipped

| Location | Flag | Before | After |
|----------|------|--------|-------|
| `scripts/staging-generation-15-transport.mjs` | `NATIVE_GENERATION_15_TRANSPORT_ENABLED` | `false` | `true` |
| `scripts/staging-generation-15-database-transport.mjs` | `NATIVE_GENERATION_15_DATABASE_TRANSPORT_ENABLED` | `false` | `true` |
| `scripts/staging-generation-15-keychain.py` | `APPROVED_NATIVE_READ` | `False` | `True` |
| `scripts/staging-account-activation-manifest.mjs` → `generation15Successor.nativeTransportEnabled` | | `false` | `true` |
| `generation15Successor.status` | | `DISABLED_SUCCESSOR_AWAITING_ARMING_REVIEW` | `ONE_STAGING_WINDOW_AUTHORIZED` |
| `stageSafety.generation15Armed` / `config/project-stage-gate-policy.json` `currentHold.generation15Armed` | | `false` | `true` |
| Policy hold reason | | `generation-15-disabled-successor-prepared-gen14-reconciliation-required-no-replay-awaiting-arming-review` | `generation-15-one-reviewed-staging-window-authorized-requires-direct-live-launcher-and-phase-journal-ordinary-tests-forbidden-while-armed` |

Pinned sha256 values for every Gen 15 / stage-safety source whose content changed are recomputed in `config/staging-account-activation-manifest.json`. Staging target remains `qdmvngjwkcsilzmqksme`. Production `wrhgscovsgsudtedbljr` stays excluded. Credentials `windowId` / `packageId` are unchanged from the disabled successor mint (`2ec1dcbb-dd43-4a45-893b-3b4dc4140188` / `tll-staging-generation-15-credentials/v1`).

## Merge = arm; live run is later (Phase 3)

Merging this PR **is** the arm. A live Gen 15 attempt is a **separate Phase 3** that still requires explicit Toby yes and must use **only**:

```text
scripts/staging-generation-15-run-live-once.mjs
```

Long foreground only — never `nohup`, never a short-lived remote shell. Operator must be present for Phase 3; do not merge overnight unattended.

Do not merge without that arming yes. Do not run the live launcher from this PR tip without Phase 3 approval.

## Long-session contract (required while armed)

When gates are true, the live launcher refuses native work / journal claim unless:

1. `TLL_LIVE_LONG_SESSION=1`
2. Parent-held keepalive JSON via `TLL_LIVE_KEEPALIVE_PATH` (held by `run-live-once`)
3. Process is not an orphan (`ppid<=1`) or `nohup` child

Plan ~45 minutes wall clock (VERCEL_STAGE alone up to 660s; CONNECTION_VERIFICATION up to 420s). Monitor only from a **separate** read-only observer (`scripts/staging-generation-15-journal-watch.mjs` / `assessStagingWindowProgress`). Never kill while `ACTIVE_WITHIN_PHASE_BOUND`.

## Bake-ins already in the package (do not remint)

- **Bridge own_probe fixed on tip** — shared verifier uses allow-listed `register` + `{}` + expected raise-mode `'error'` (Gen 14 FAIL root cause; already on `codex/tll-integration` via PR #32).
- **SCRAM from projected passwords** — Gen 15 transport derives SCRAM verifiers from projected base64url passwords, not raw material buffers.
- **connectionFailure evidence required** — secret-free `{purpose,check,status,reason}` plus allow-listed extras (`sqlstate`, `expectedMode`, `purposesPassed`, host/port constants) remain wired into launcher stdout, implementation-state evidence, and live-session summary.
- **Pinned CA** — `readPinnedSupabaseCa()` remains wired into the live launcher connection verifier.
- Predecessor Gen 14 `expiresAt` **`2026-09-21T07:18:57.000Z`** confirmed from the Gen 14 live dispatch journal.

## Never `npm test` while armed

On the armed tip, `npm run check:live-boundaries` **must fail closed**. Observed on this tip:

```text
Staging live boundary unavailable: enabled-keychain-read:scripts/staging-generation-15-keychain.py, enabled-native-gate:scripts/staging-generation-15-database-transport.mjs, enabled-native-gate:scripts/staging-generation-15-transport.mjs, policy:currentHold
```

That is correct. Never run ordinary `npm test` (or any suite that runs the boundary preflight) while Gen 15 is armed. Focused injected Gen 15 / manifest tests may be run without the boundary preflight; that is not a green full suite.

Do **not** “fix” the live-boundary failure by disarming on this arming branch.

## Gen 11 / Gen 12 / Gen 13 / Gen 14 — no replay

Generation 11, Generation 12, Generation 13, and Generation 14 remain non-replayable. `generation11Armed`, `generation12Armed`, `generation13Armed`, and `generation14Armed` stay `false`. Replay of Gen 11–14 is forbidden. Gen 14 remains the role/DB predecessor for Gen 15 (intent-locked / reconciliation-required; no replay).

## Gen 11/12 interrupt lessons that bind this arm

1. One supported operator entry only: `scripts/staging-generation-15-run-live-once.mjs` (sets long-session env, holds keepalive, foreground launcher).
2. Never start via short-lived remote-shell/`nohup` — that was the Gen 11/12 interrupt root cause.
3. Separate journal-watch / `assessStagingWindowProgress` observer only.
4. Exclusive dispatch journal is claimed before material generation.
5. Disarm after any live attempt or if the arm is abandoned.

## Disarm

After any live attempt — success, failure, interruption, or abandonment of the arm — disarm by restoring every Gen 15 gate above to the disabled values, regenerating manifest pins, and restoring `generation15Armed: false` with an updated hold reason. Do not leave the repository armed. Disarm before any other work.

## Reviewer diff

Use `gh pr diff` (or the forge PR files view) for the machine-readable unified diff. Do not invent credential or journal files under `implementation-state`; that tree is local-only.
