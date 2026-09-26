# Generation 20 entry-baseline incident and prevention

## Outcome

Generation 20 window `a009f2b4-86df-4701-a8bc-1112597e3c42` was invoked once and stopped at the read-only entry baseline. The launcher returned `ENTRY_BASELINE_FAILED` in `ENTRY_PREFLIGHT_RETRY` with `recoveryOutcome: NOT_REQUIRED`. Database credential installation, provider staging, runtime connections, controls, customer traffic, checkout and purchase were never attempted. The window is consumed and replay is prohibited.

The secret-free local session summary is `implementation-state/staging/tll-generation-20-live-session-2026-09-22T12-35-17-951Z.json`.

## Root cause

The predecessor check combined two values with different purposes:

- the retired Generation 19 marker correctly retains its audited active-window expiry, `2026-09-21T11:08:34.000Z`;
- the Generation 19 recovery contract disables login, clears passwords and leaves PostgreSQL `VALID UNTIL infinity` as the canonical retired role shape.

Generation 20 incorrectly required each retired role's `rolvaliduntil` to equal the marker expiry. Fresh read-only diagnostics proved all five markers were exact parsed JSON, all five roles were `NOLOGIN`, all five passwords were absent, all five retained only the inert ADMIN-only operator edge, no execution edges or runtime sessions existed, all controls were disabled, and all five roles had `VALID UNTIL infinity`. Hosted staging was correctly retired; the entry assertion contradicted the recovery contract.

## Correction

Generation 20 is disarmed and made permanently non-replayable. Its entry-baseline source now documents and tests the canonical predecessor contract: exact retired marker, `NOLOGIN`, no password, `VALID UNTIL infinity`, exactly the reviewed inert role graph, zero runtime sessions and disabled controls. This correction is retained as the template invariant for any separately reviewed successor.

The preventive checks are:

1. `tests/staging-generation-20-database-transport.test.mjs` rejects the former expiry comparison and requires the infinity comparison alongside login/password checks.
2. `scripts/staging-generation-20-pre-arm-gate.mjs` refuses this consumed window with `generation20_consumed_no_replay` even if valid retirement evidence is supplied.
3. The project policy and activation manifest record `ENTRY_BASELINE_FAILED_NO_REPLAY` with all native and replay gates false.
4. A successor must undergo an independent disabled-package review before any new arming diff. It must derive its retired-predecessor invariant from the recovery/postcommit contract rather than copying an active-window invariant.

## Hosted state after the stop

No Generation 20 mutation occurred, so no Generation 20 recovery was required or permitted. The authoritative hosted state remains the previously proven Generation 19 `PASS_RETIRED` state, strengthened by the fresh read-only diagnostic above. A new successor still requires a fresh read-only baseline at its own arming gate.
