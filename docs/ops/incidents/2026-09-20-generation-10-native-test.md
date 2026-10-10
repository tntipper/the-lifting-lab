# Generation 10 native-test incident

## Scope and result

The approved Generation 10 staging credential window was started by an ordinary test after its native gates were armed. The process was manually interrupted after provider staging and database dispatch. The pinned recovery retired all five runtime roles. Independent readbacks verified zero runtime sessions, disabled controls, no role passwords, and zero generated Vercel or Supabase values. Production, purchases, customer email and supplier orders were not involved.

The consumed mode-0600 journal remains `INTENT_RECORDED`. This is the deliberate replay lock after the creating process was interrupted. Generation 10 must never be retried.

## Root cause

`tests/staging-generation-10-transport.test.mjs` called `runNativeGeneration10CredentialWindow()` to assert its disabled response. The arming diff changed the native gate to true but left that ordinary test in place. Running the test suite therefore invoked the live launcher.

The first process error was ordering: the arming diff was tested before independent review. A separate gate test expecting `true` could not protect the following test because Node continued running independent tests.

The second process error was classifying the bounded execution as stalled and terminating it. The journal was created at `2026-09-20T20:13:17.490Z`. At roughly 45 seconds the process was visibly staging one of 21 sequential Vercel values. At roughly 86--91 seconds it had reached database dispatch and was still alive. This remained inside the configured bounds: Vercel staging alone allowed up to 21 sequential 30-second calls; database dispatch allowed 40 seconds; connection verification allowed 420 seconds and deliberately waits 16 seconds before a fresh-pool retry. A momentary snapshot with no child process or network socket was therefore compatible with an intentional in-process convergence wait. It was not evidence of a hang.

The exact last in-process phase was not durably recorded, so it cannot be reconstructed after termination. That is narrower than the earlier stated uncertainty: there is no evidence the process stopped making progress, and the decision to terminate it as stalled was unsupported by its configured deadlines.

Contributing conditions were that the live launcher was exported from a module imported by ordinary tests, verification and live execution shared the same source toggle, the existing checks did not prohibit native calls from test files, and the launcher emitted no durable phase receipts or phase-specific stale deadline for an observer to use.

## Preventive controls

- Ordinary tests no longer invoke the Generation 10 native launcher.
- `scripts/staging-live-boundary-check.mjs` rejects any ordinary test that calls a generation native launcher or imports a live-launcher module.
- Consumed Generation 6--10 transport modules no longer contain callable live launchers. The boundary rejects a launcher definition outside a dedicated `*-live-launcher.mjs` module.
- The same check rejects enabled JavaScript native gates and Python Keychain gates during ordinary verification.
- The check rejects ordinary tests that rewrite generated artifacts, preventing parallel manifest/hash races.
- `npm test` runs the boundary check before loading the test suite.
- `config/project-stage-gate-policy.json` blocks a successor until root cause and preventive controls are recorded and verified.
- `docs/ops/project-stage-execution-protocol.md` requires disabled tests, then review, then a direct launcher invocation in a separate process. The ordinary test suite must never run while armed.
- `scripts/staging-window-phase-journal.mjs` provides a mode-0600, exclusive, monotonic and secret-free phase record with phase-specific deadlines. Future observers must use that record and must not infer a stall from process or socket snapshots while the current phase remains within its bound.

## Verification

The boundary has positive and negative tests: the disabled repository passes, a synthetic native test call fails, a synthetic embedded launcher fails, and synthetic enabled JavaScript and Keychain gates fail. The phase journal tests prove exclusive ownership, mode-0600 persistence, monotonic transitions, redacted content and phase-aware stale assessment. Generation 10 recovery evidence is in `../implementation-state/staging/generation-10-controlled-window-recovered-2026-09-20.json`.

## Remaining uncertainty

The exact phase at the instant of manual termination is unavailable because the process had no phase journal. This does not change the diagnosis or permit Generation 10 replay: the process was terminated while still within its designed bounds, then fully recovered and made inert.
