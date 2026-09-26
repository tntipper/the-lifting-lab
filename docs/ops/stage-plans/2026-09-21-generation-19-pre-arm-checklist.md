# Generation 19 pre-arm / Phase 2 checklist

> **Historical, consumed window.** Generation 19 completed its one authorised window and is now disarmed and non-replayable. The Phase 2 wording below records the state at arming time; it is not a current instruction. Current policy is authoritative: `generation19Armed: false`, `generation19ReplayPermitted: false`, and no successor is permitted before a new boundary review.

## Marker

`PREDECESSOR_RETIREMENT_OR_REVIEWED_CLEANUP_REQUIRED`

## Refuses arming Gen 19 unless

1. **Recovery pins correct** — Gen 17 / 18 / 19 `staging-generation-N-recovery.mjs` successor `{generation,windowId}` equals that generation’s credentials `GENERATION` + `WINDOW_ID` (regression: `tests/staging-generation-recovery-pin-contract.test.mjs`).
2. **Predecessor retirement proven** via secret-free evidence (`RETIRED_MARKERS_PROVEN` for Gen 17 window `5728d807-701a-486b-a8c5-34bf89238275`), **OR**
3. **Reviewed cleanup path listed** — `docs/ops/stage-plans/2026-09-21-generation-17-correct-cleanup.md` (`OPERATOR_REVIEWED_CLEANUP_PATH`) targeting Gen 17 package `tll-staging-generation-17-credentials/v1` / window `5728d807-701a-486b-a8c5-34bf89238275`.

Gate helper: `scripts/staging-generation-19-pre-arm-gate.mjs` → `assertGeneration19PreArmReady()`.

## Gen 17 retirement status (2026-09-21)

Operator-approved Gen 17 correct cleanup **already executed** on staging `qdmvngjwkcsilzmqksme`: `recoverGeneration17Database` → `RECOVERY_VERIFIED` / `RETIRED_MARKERS_PROVEN` for window `5728d807-701a-486b-a8c5-34bf89238275`.

**Do not re-run cleanup.** Optional local-only evidence file (never invent remote secrets / never commit secrets):

```text
implementation-state/staging/tll-generation-19-predecessor-retirement-evidence.json
```

CLI while armed: `node scripts/staging-generation-19-pre-arm-gate.mjs --retirement-evidence=<path> --allow-armed-gates`

## Mint checklist (every Gen N)

When minting Gen N from Gen N−1:

- [ ] New `WINDOW_ID` / `PACKAGE_ID`
- [ ] Credentials `PREDECESSOR` = actual role/DB predecessor (skip generations that never dispatched)
- [ ] **Recovery successor pin** = **this** generation’s `GENERATION` + `WINDOW_ID` (never leave Gen N−1 leftover)
- [ ] Regenerate `config/staging-generation-N-recovery*.sql`
- [ ] Recovery test asserts **this** generation’s pins (not N−1)
- [ ] Run recovery-pin regression for Gen 15–N
- [ ] All native / Keychain / manifest / policy gates **FALSE** (Phase 1 only)
- [ ] Stage plan documents the recovery-pin mint step

## Historical Gen 19 Phase 2 status

At the time of this checklist, gates were armed for one reviewed staging window (`ONE_STAGING_WINDOW_AUTHORIZED`). That window was consumed and subsequently disarmed. Predecessor retirement remains proven and cleanup must not be re-run. Do not run `scripts/staging-generation-19-run-live-once.mjs`; replay is forbidden.
