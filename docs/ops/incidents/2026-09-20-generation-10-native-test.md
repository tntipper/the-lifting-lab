# Generation 10 native-test incident

## Scope and result

The approved Generation 10 staging credential window was started by an ordinary test after its native gates were armed. The process was interrupted after provider staging and database dispatch. The pinned recovery retired all five runtime roles. Independent readbacks verified zero runtime sessions, disabled controls, no role passwords, and zero generated Vercel or Supabase values. Production, purchases, customer email and supplier orders were not involved.

The consumed mode-0600 journal remains `INTENT_RECORDED`. This is the deliberate replay lock after the creating process was interrupted. Generation 10 must never be retried.

## Root cause

`tests/staging-generation-10-transport.test.mjs` called `runNativeGeneration10CredentialWindow()` to assert its disabled response. The arming diff changed the native gate to true but left that ordinary test in place. Running the test suite therefore invoked the live launcher.

The process error was ordering: the arming diff was tested before independent review. A separate gate test expecting `true` could not protect the following test because Node continued running independent tests.

Contributing conditions were that the live launcher was exported from a module imported by ordinary tests, verification and live execution shared the same source toggle, and the existing checks did not prohibit native calls from test files.

## Preventive controls

- Ordinary tests no longer invoke the Generation 10 native launcher.
- `scripts/staging-live-boundary-check.mjs` rejects any ordinary test that calls a generation native launcher or imports a live-launcher module.
- The same check rejects enabled JavaScript native gates and Python Keychain gates during ordinary verification.
- The check rejects ordinary tests that rewrite generated artifacts, preventing parallel manifest/hash races.
- `npm test` runs the boundary check before loading the test suite.
- `config/project-stage-gate-policy.json` blocks a successor until root cause and preventive controls are recorded and verified.
- `docs/ops/project-stage-execution-protocol.md` requires disabled tests, then review, then a direct launcher invocation in a separate process. The ordinary test suite must never run while armed.

## Verification

The boundary has positive and negative tests: the disabled repository passes, a synthetic native test call fails, and synthetic enabled JavaScript and Keychain gates fail. Generation 10 recovery evidence is in `../implementation-state/staging/generation-10-controlled-window-recovered-2026-09-20.json`.

## Remaining uncertainty

The precise reason the live test process stopped making progress is not proven. Diagnose that with local and read-only evidence before designing a successor. This uncertainty does not permit Generation 10 replay.
