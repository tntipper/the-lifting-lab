# Generation 17 correct cleanup (operator-reviewed artefacts — do not run in Phase 1)

## Markers

- `OPERATOR_REVIEWED_CLEANUP_PATH`
- `DO_NOT_RUN_IN_PHASE_1`

## Why this exists

Gen 17 live ended `RECOVERY_REQUIRED` / `RECONCILIATION_REQUIRED` with `failureStep: zero_sessions` / `failureReason: runtime_sessions_remain`. Tip recovery generator wrongly pinned **Gen 16** successor (`313afec9-46d0-41bb-af47-0be277c6fa4f`). After Gen 17 dispatch, role markers are Gen 17 **active** (`5728d807-701a-486b-a8c5-34bf89238275`). Recovery SQL expecting Gen 16 markers fails closed → Gen 18 entry baseline saw Management **400**.

Gen 19 Phase 1 **fixes the pins** and regenerates recovery SQL artefacts. This document lists the **operator-approved cleanup path** Gen 19 pre-arm requires before Phase 2 arming. **Do not execute live cleanup in the Gen 19 Phase 1 PR.**

## Correct cleanup targets

| Field | Value |
|-------|--------|
| generation | 17 |
| windowId | `5728d807-701a-486b-a8c5-34bf89238275` |
| packageId | `tll-staging-generation-17-credentials/v1` |
| expiresAt (dispatch journal) | `2026-09-21T09:31:04.000Z` |
| expected retired marker state | `retired` |
| recovery generator | `scripts/staging-generation-17-recovery.mjs` |
| recovery SQL | `config/staging-generation-17-recovery.sql` |
| recovery postcommit SQL | `config/staging-generation-17-recovery-postcommit.sql` |

Pin contract after Phase 1 fix:

```text
successor = { generation: 17, windowId: '5728d807-701a-486b-a8c5-34bf89238275' }
```

**Not** Gen 16 leftover `313afec9-46d0-41bb-af47-0be277c6fa4f`.

## Operator procedure (separate approval; not this PR)

1. Read-only inspect staging role markers / sessions / controls (secret-free notes only).
2. Confirm Gen 17 recovery pins match the table above (`node scripts/staging-generation-17-recovery.mjs --check`).
3. Under explicit operator approval, apply Gen 17 recovery SQL + postcommit **once** against staging project `qdmvngjwkcsilzmqksme` only.
4. Verify retired marker JSON equals:

```json
{"expiresAt":"2026-09-21T09:31:04.000Z","generation":17,"projectRef":"qdmvngjwkcsilzmqksme","state":"retired","windowId":"5728d807-701a-486b-a8c5-34bf89238275"}
```

5. Optionally record secret-free `tll-generation-19-predecessor-retirement-evidence/v1` with `status: RETIRED_MARKERS_PROVEN`.
6. Only then open Gen 19 Phase 2 arming review.

## Exclusions

- No Gen 17 live replay.
- No Gen 18 replay / re-arm.
- No production project.
- No cleanup execution inside Gen 19 Phase 1.
