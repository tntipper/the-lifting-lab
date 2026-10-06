# Stage 3 provider normalization launcher — disabled preparation

## Intended result

Prepare a dedicated, bounded staging-only launcher for the reviewed provider-normalization coordinator. In this unit build and verify its **disabled phase journal** first. No credential lookup, hosted read or provider update may occur. Maximum hosted attempts: zero. Production, purchases, customer messages, supplier orders and deployment are excluded.

## Starting evidence and assumptions

At local HEAD `f6c8708`, the one-use provider intent journal, coordinator and read-only preflight adapter have independent GO reviews for offline continuation. The exact staging custom provider was last observed enabled with JWKS; this is historical UI evidence, not a fresh official Admin pre-read. The current Preview is behind local HEAD, and its manifest metadata writer remains absent. No credential window is approved. Existing unrelated untracked files and all consumed journals must be preserved.

The generic `staging-window-phase-journal.mjs` cannot be reused unchanged: its creation and replacement paths ignore `writeSync` byte counts, so a short write could yield a truncated durable phase file. The provider intent journal already has a checked write-all loop and fault tests. The process mistake would be treating an older phase journal as safe merely because it is used elsewhere. Use a distinct reviewed successor for this new stage, rather than altering historical generation journal semantics during this work unit.

## Disabled phase-journal design

- Fixed schema, fixed staging project/provider, fixed path under `../implementation-state/staging/`; exclusive mode-0600 creation, one owner run ID, fsync file and directory before returning; never delete or replay a prior file.
- Secret-free phases: `LAUNCH_STARTED`, `PREFLIGHT`, `PROVIDER_PREREAD`, `INTENT_RECORDED`, `UPDATE_DISPATCH`, `UPDATE_ACKNOWLEDGED`, `POSTREAD`, with a terminal `VERIFIED`, `STOPPED_BEFORE_UPDATE` or `RECONCILIATION_REQUIRED`. A monotonic phase order and one terminal result are required. Phase deadlines must be explicit and less than the credential window; a stale or malformed journal requires separate read-only reconciliation.
- Checked write-all loop for both exclusive creation and atomic replacement. Reject zero/invalid progress, fsync before rename/return, preserve malformed or orphaned evidence after failure. Do not infer success from a write exception or a later read.
- Fault tests must cover partial/zero/thrown writes on creation and replacement, fsync/rename failure, cross-instance replay, permissions, phase ordering, deadlines, redaction and malformed existing files. Keep the journal module disabled and without ambient transport.

## Subsequent launcher gates

After independent phase-journal review, plan and implement a disabled launcher that uses the fixed Supabase/Vercel/surface read bindings, an explicit abort deadline through every operation, the official two-field provider-update port, and both distinct journals. The launcher must obtain the staging project secret through a separately reviewed bounded mechanism; it must never log or persist that secret. Verify the exact hosted API response shapes before any arming. The phase journal starts before credential reads, and the provider intent journal remains the only update-dispatch authority. On disagreement or timeout after intent, stop and reconcile from a separate read-only process with no retry. Require fresh hosted baseline, independent review of the exact arming diff, and separate action-time authorization for new credential/permission access. One maximum run, then disarm and verify.

## Verification and handover

Run focused tests and fault probes, activation manifest check, full disabled suite, typecheck, lint and live-boundary check after the final source change. Record independent GO/HOLD before wiring the launcher. Update `.agent/HANDOVER.md` with the exact commit, tests, remaining assumptions and next gate. No native gate may be armed in this unit.

## Independent-review correction gate

The first phase-journal review found that `record()` could advance a phase after its deadline and reset `updatedAt`, making a stale run appear active again. `finish(VERIFIED)` had the same missing check. The direct cause was implementing deadline assessment as a separate observer without making it an invariant of state transitions. No hosted work ran. Before continuing, reject normal phase progress and successful/early-stop terminal completion once the current phase is stale; allow only `RECONCILIATION_REQUIRED` to record the held outcome. Test the exact deadline edge and one millisecond later for both progress and completion. Re-run checks and request independent re-review. Do not wire a launcher while this HOLD remains.

The corrected dedicated phase journal is now at `scripts/staging-provider-normalization-phase-journal.mjs`. It uses exclusive private creation, checked write-all and fsync on creation/replacement, fixed phase order and deadlines, secret-free receipts, replay rejection and fail-closed stale transitions. Real-file fault tests include partial/zero/thrown writes, file/directory fsync and rename failure. Independent re-review returned **GO for disabled launcher preparation**; hosted arming remains HOLD. Focused phase/manifest 14/14, full disabled 2,346/2,346, typecheck, both manifest checks and live-boundary passed; lint had zero errors and 20 existing warnings. No credential, hosted request or provider edit occurred. The next unit must still enforce cancellation during operations, check the current phase before dispatch, and use the separate provider intent journal as the only update authority.
