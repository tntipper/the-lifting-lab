# Generation 19 arming diff

## Outcome

Arm Generation 19 for one independently reviewed staging credential window. This change flips only the Gen 19 native/Keychain/manifest/policy gates. It does not run the live launcher and does not mutate staging or production.

## Exact flags flipped

| Location | Flag | Before | After |
|----------|------|--------|-------|
| `scripts/staging-generation-19-transport.mjs` | `NATIVE_GENERATION_19_TRANSPORT_ENABLED` | `false` | `true` |
| `scripts/staging-generation-19-database-transport.mjs` | `NATIVE_GENERATION_19_DATABASE_TRANSPORT_ENABLED` | `false` | `true` |
| `scripts/staging-generation-19-keychain.py` | `APPROVED_NATIVE_READ` | `False` | `True` |
| `scripts/staging-account-activation-manifest.mjs` → `generation19Successor.nativeTransportEnabled` | | `false` | `true` |
| `generation19Successor.status` | | `DISABLED_SUCCESSOR_AWAITING_ARMING_REVIEW` | `ONE_STAGING_WINDOW_AUTHORIZED` |
| `stageSafety.generation19Armed` / `config/project-stage-gate-policy.json` `currentHold.generation19Armed` | | `false` | `true` |
| Policy hold reason | | `generation-19-disabled-successor-awaiting-arming-review-gen17-recovery-pin-fixed-gen18-entry-baseline-failed-no-replay` | `generation-19-one-reviewed-staging-window-authorized-requires-direct-live-launcher-and-phase-journal-ordinary-tests-forbidden-while-armed-gen17-predecessor-retirement-proven` |

Pinned sha256 values for every Gen 19 / stage-safety source whose content changed are recomputed in `config/staging-account-activation-manifest.json`. Staging target remains `qdmvngjwkcsilzmqksme`. Production `wrhgscovsgsudtedbljr` stays excluded. Credentials `windowId` / `packageId` are unchanged from the disabled successor mint (`51809dd4-bd4b-44c7-8609-7dd8ca063679` / `tll-staging-generation-19-credentials/v1`).

## Gen 17 predecessor retirement already proven — do not re-run cleanup

Operator-approved Gen 17 correct cleanup already executed on staging `qdmvngjwkcsilzmqksme` (2026-09-21): `recoverGeneration17Database` → `RECOVERY_VERIFIED` / `RETIRED_MARKERS_PROVEN` for window `5728d807-701a-486b-a8c5-34bf89238275`.

**Do not re-run Gen 17 cleanup in this PR or from this tip.** Window / package / predecessor / drain **30s × 5** / SCRAM / bridge own_probe / recovery pins are unchanged from Phase 1.

### Pre-arm gate + local retirement evidence

`scripts/staging-generation-19-pre-arm-gate.mjs` → `assertGeneration19PreArmReady({ requireArmedGatesFalse: false, retirementEvidence })` accepts secret-free evidence:

```json
{
  "schema": "tll-generation-19-predecessor-retirement-evidence/v1",
  "status": "RETIRED_MARKERS_PROVEN",
  "predecessorGeneration": 17,
  "predecessorWindowId": "5728d807-701a-486b-a8c5-34bf89238275",
  "predecessorExpiresAt": "2026-09-21T09:31:04.000Z",
  "state": "retired",
  "provenAt": "2026-09-21T12:00:00.000Z",
  "source": "operator-approved-gen17-correct-cleanup"
}
```

Optional local-only proof file (gitignored / never invent remote secrets):

```text
implementation-state/staging/tll-generation-19-predecessor-retirement-evidence.json
```

CLI: `node scripts/staging-generation-19-pre-arm-gate.mjs --retirement-evidence=<local-path> --allow-armed-gates`

Without a local evidence file, the reviewed cleanup path listed in `docs/ops/stage-plans/2026-09-21-generation-17-correct-cleanup.md` still satisfies the pre-arm gate (artefacts only — cleanup already done; do not execute again).

## Merge = arm; live run is later (Phase 3)

Merging this PR **is** the arm. A live Gen 19 attempt is a **separate Phase 3** that still requires explicit Toby yes and must use **only**:

```text
scripts/staging-generation-19-run-live-once.mjs
```

Long foreground only — never `nohup`, never a short-lived remote shell. Operator must be present for Phase 3; do not merge overnight unattended.

Do not merge without that arming yes. Do not run the live launcher from this PR tip without Phase 3 approval.

## Long-session contract (required while armed)

When gates are true, the live launcher refuses native work / journal claim unless:

1. `TLL_LIVE_LONG_SESSION=1`
2. Parent-held keepalive JSON via `TLL_LIVE_KEEPALIVE_PATH` (held by `run-live-once`)
3. Process is not an orphan (`ppid<=1`) or `nohup` child

Plan ~45 minutes wall clock (VERCEL_STAGE alone up to 660s; CONNECTION_VERIFICATION up to 420s). Monitor only from a **separate** read-only observer (`scripts/staging-generation-19-journal-watch.mjs` / `assessStagingWindowProgress`). Never kill while `ACTIVE_WITHIN_PHASE_BOUND`.

## Bake-ins already in the package (do not remint)

- **Zero-sessions drain + management error mapping already on tip** — Gen 19 waits `POOLER_CONVERGENCE_MS` after connection probes, proves zero sessions with bounded retry only while `failureReason === 'runtime_sessions_remain'`, drains non-201 Management bodies so allow-listed RAISE phrases are classified (PR #37/#40 tip defaults via Gen 19 Phase 1: **30s × 5** — do not weaken), and surfaces allow-listed `failureStep` / `failureReason` (plus optional secret-free `managementStatusCode` / `zeroSessionsAttempts`) on permanent zero-sessions failures.
- **Bridge own_probe fixed on tip** — shared verifier uses allow-listed `register` + `{}` + expected raise-mode `'error'` (Gen 14 FAIL root cause; carried forward).
- **SCRAM from projected passwords** — Gen 19 transport derives SCRAM verifiers from projected base64url passwords, not raw material buffers.
- **connectionFailure evidence required** — secret-free `{purpose,check,status,reason}` plus allow-listed extras remain wired into launcher stdout, implementation-state evidence, and live-session summary.
- **Pinned CA** — `readPinnedSupabaseCa()` remains wired into the live launcher connection verifier.
- **Entry preflight failureStep** — Gen 18 ENTRY_BASELINE_FAILED lesson: entry RAISE allow-list + `failureStep: preflight` (#43) inherited.
- Predecessor Gen 17 `expiresAt` **`2026-09-21T09:31:04.000Z`**; Gen 17 markers retired (`RETIRED_MARKERS_PROVEN`). Gen 18 attempt `44e3fff5-…` stays `ENTRY_BASELINE_FAILED_NO_REPLAY`.

## Never `npm test` while armed

On the armed tip, `npm run check:live-boundaries` **must fail closed**. Expected:

```text
Staging live boundary unavailable: enabled-keychain-read:scripts/staging-generation-19-keychain.py, enabled-native-gate:scripts/staging-generation-19-database-transport.mjs, enabled-native-gate:scripts/staging-generation-19-transport.mjs, policy:currentHold
```

That is correct. Never run ordinary `npm test` (or any suite that runs the boundary preflight) while Gen 19 is armed. Focused injected Gen 19 / manifest / pre-arm tests may be run without the boundary preflight; that is not a green full suite.

Do **not** “fix” the live-boundary failure by disarming on this arming branch.

## Gen 11–18 — no replay

Generation 11 through Generation 18 remain non-replayable. `generation11Armed` … `generation18Armed` stay `false`. Gen 18 stays no-replay after ENTRY_BASELINE_FAILED. Gen 17 remains the role/DB predecessor for Gen 19 (retired markers proven; no replay).

## Gen 11/12 interrupt lessons that bind this arm

1. One supported operator entry only: `scripts/staging-generation-19-run-live-once.mjs` (sets long-session env, holds keepalive, foreground launcher).
2. Never start via short-lived remote-shell/`nohup` — that was the Gen 11/12 interrupt root cause.
3. Separate journal-watch / `assessStagingWindowProgress` observer only.
4. Exclusive dispatch journal is claimed before material generation.
5. Disarm after any live attempt or if the arm is abandoned.

## Disarm

After any live attempt — success, failure, interruption, or abandonment of the arm — disarm by restoring every Gen 19 gate above to the disabled values, regenerating manifest pins, and restoring `generation19Armed: false` with an updated hold reason. Do not leave the repository armed. Disarm before any other work.

## Reviewer diff

Use `gh pr diff` (or the forge PR files view) for the machine-readable unified diff. Do not invent credential or journal files under `implementation-state`; that tree is local-only.
