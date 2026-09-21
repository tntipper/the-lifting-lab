# Generation 19 pre-arm / Phase 2 checklist

## Marker

`PREDECESSOR_RETIREMENT_OR_REVIEWED_CLEANUP_REQUIRED`

## Refuses arming Gen 19 unless

1. **Recovery pins correct** — Gen 17 / 18 / 19 `staging-generation-N-recovery.mjs` successor `{generation,windowId}` equals that generation’s credentials `GENERATION` + `WINDOW_ID` (regression: `tests/staging-generation-recovery-pin-contract.test.mjs`).
2. **Predecessor retirement proven** via secret-free evidence (`RETIRED_MARKERS_PROVEN` for Gen 17 window `5728d807-701a-486b-a8c5-34bf89238275`), **OR**
3. **Reviewed cleanup path listed** — `docs/ops/stage-plans/2026-09-21-generation-17-correct-cleanup.md` (`OPERATOR_REVIEWED_CLEANUP_PATH`) targeting Gen 17 package `tll-staging-generation-17-credentials/v1` / window `5728d807-701a-486b-a8c5-34bf89238275`.

Gate helper: `scripts/staging-generation-19-pre-arm-gate.mjs` → `assertGeneration19PreArmReady()`.

## Mint checklist (every Gen N)

When minting Gen N from Gen N−1:

- [ ] New `WINDOW_ID` / `PACKAGE_ID`
- [ ] Credentials `PREDECESSOR` = actual role/DB predecessor (skip generations that never dispatched)
- [ ] **Recovery successor pin** = **this** generation’s `GENERATION` + `WINDOW_ID` (never leave Gen N−1 leftover)
- [ ] Regenerate `config/staging-generation-N-recovery*.sql`
- [ ] Recovery test asserts **this** generation’s pins (not N−1)
- [ ] Run recovery-pin regression for Gen 15–N
- [ ] All native / Keychain / manifest / policy gates **FALSE**
- [ ] Stage plan documents the recovery-pin mint step

## Gen 19 Phase 1 status

Gates remain false. Cleanup path is listed; live cleanup is **not** run here. Next: operator-approved Gen 17 cleanup (if markers still active), then independent Gen 19 arming review.
