# Generation 10 runtime diagnosis and launcher correction plan

## Outcome

Establish the strongest evidence-supported explanation for the interrupted Generation 10 process and remove the architecture that allowed test-imported modules to contain callable live launchers. Leave the repository safe, fully verified and ready for a future developer to plan the next stage without repeating this investigation.

## Acceptance criteria

- Reconstruct the observed Generation 10 timeline against every configured provider, database and connection timeout.
- Distinguish proven facts, supported inference and remaining uncertainty.
- Update the incident record with the complete causal chain, including any incorrect operator decision.
- Remove native live-launcher functions from every consumed Generation 6--10 transport module imported by ordinary tests.
- Add a reusable, secret-free phase-journal contract for future direct launchers, with exclusive ownership, atomic updates, monotonic phases and interruption evidence.
- Extend the live-boundary checker to reject native launcher definitions in ordinary transport modules as well as calls from tests.
- Pin the correction in the activation manifest.
- Pass focused tests, the full repository suite, typecheck, lint and generated-artifact checks.
- Do not create or arm Generation 11 and do not access hosted systems.

## Authoritative evidence

- `../implementation-state/staging/tll-generation-10-credential-dispatch.json`
- `../implementation-state/staging/generation-10-controlled-window-recovered-2026-09-20.json`
- `../implementation-state/staging/generation-10-arming-diff-2026-09-20.patch`
- process observations retained in the current handover and incident record;
- provider, database and connection timeout constants in the committed source.

## Planned changes

- Incident and execution-protocol documentation.
- Consumed Generation 6--10 transport modules and their tests.
- New reusable phase-journal module and tests.
- Live-boundary policy/checker and activation-manifest pins.

## Stop conditions

Stop on any credential read, network request, hosted mutation, enabled native gate, attempt to replay a consumed generation, or evidence that contradicts the recovered inert state. This stage is repository-local.

## Review and verification order

1. Reconstruct and document the timing before implementation changes.
2. Implement the smallest shared phase-journal contract and remove embedded live launchers.
3. Run boundary and focused tests.
4. Inspect the final diff against this plan.
5. Run the full suite, typecheck and lint.
6. Commit, update the handover and stop.

## Diagnosis

Generation 10 was not shown to be stalled. The process was terminated while its observed work remained inside the explicit phase bounds: it was still staging sequential provider values at roughly 45 seconds and had reached database work by roughly 90 seconds. The apparent absence of a child process or socket at one snapshot was compatible with the verifier's intentional 16-second in-process convergence wait. The exact last phase is unavailable because no durable phase journal existed.

The complete causal chain is therefore: an ordinary test could call an embedded live launcher; the armed test suite started the window; monitoring lacked durable phase receipts; a still-bounded process was misclassified as stalled and manually terminated. Recovery subsequently made the staging state inert and Generation 10 remains consumed and non-replayable.

## Implemented correction

- Removed callable live launchers and credential-bearing native imports from consumed Generation 6--10 transport modules.
- Extended the repository boundary to reject live-launcher definitions outside dedicated `*-live-launcher.mjs` modules.
- Added an exclusive, secret-free, mode-0600 phase journal with monotonic transitions and explicit per-phase deadlines.
- Updated the incident record and execution protocol so observers cannot infer a stall from process or socket snapshots inside a recorded deadline.

## Verification result

- Local Generation 10 evidence rechecked: the mode-0600 dispatch journal remains `INTENT_RECORDED`; recovery records five retired roles, zero login roles, zero passwords, zero sessions, disabled controls, and zero generated provider values. Replay remains prohibited.
- Live-boundary check passed with zero violations.
- Focused safety, phase-journal, manifest and Generation 6--10 transport checks passed: 39 tests, zero failures.
- Full repository suite passed: 1,624 tests, zero failures.
- Typecheck passed.
- Lint completed with zero errors and the same six pre-existing warnings.
- No credential read, network request, hosted mutation, Generation 11 creation or production action occurred.
