# Project stage execution protocol

Every stage of the TLL implementation must be planned, verified and closed as a coherent unit before the next stage starts. Previous chat history is not authorization to skip a gate.

## Required stage plan

Write the stage plan before changing code or an external system. Record:

1. intended outcome and measurable acceptance criteria;
2. explicit exclusions, including production, purchases, customer communication and supplier orders when applicable;
3. authoritative repository and hosted starting state;
4. assumptions that require evidence before mutation;
5. exact files and external systems that may change;
6. pre-mutation checks and the command or observation that proves each one;
7. failure modes, stop conditions and recovery procedure;
8. independent review point;
9. execution command or manual action, with maximum attempts and deadline;
10. post-execution checks, durable evidence and handover requirements.

If implementation reveals a new assumption or changes the mutation surface, stop and revise the plan before continuing.

## Execution order

Use this order for every externally effective stage:

1. Commit and test the disabled implementation.
2. Run `npm run check:live-boundaries`; ordinary tests run only while every native gate is disabled.
3. Capture a fresh read-only hosted baseline.
4. Prepare the smallest arming or deployment diff without executing it.
5. Complete independent review of that exact diff.
6. Commit the reviewed arming diff.
7. Invoke the reviewed live launcher directly. Never run the ordinary test suite while an arming gate is enabled. The launcher must update its durable phase journal before each externally effective phase.
8. Stop after the single allowed attempt, whether it succeeds, fails or becomes uncertain.
9. Reconcile database and provider state from a separate read-only process.
10. Disarm, verify the disabled boundary, commit the outcome and update `.agent/HANDOVER.md`.

Live launchers must exist only in dedicated `*-live-launcher.mjs` modules and must not be imported or called by ordinary tests. Consumed transport modules expose injected orchestration only. Ordinary tests must also be read-only with respect to generated repository artifacts; generation occurs before the suite and tests use `--check`. Tests use injected ports or static source checks. `scripts/staging-live-boundary-check.mjs` enforces these rules and rejects embedded launchers and enabled native or Keychain gates.

Every live launcher must use `scripts/staging-window-phase-journal.mjs` or a reviewed successor to record a secret-free, mode-0600 phase receipt before work starts and at each phase change. Monitoring uses the receipt's phase deadline. Absence of a child process, socket or new console line does not prove a stall. Do not terminate or reconcile an active window before its recorded phase becomes stale unless there is direct evidence of unsafe external state. Once stale, stop the execution attempt and reconcile from a separate read-only process; do not resume or replay it.

## Incident learning gate

An incident blocks the successor stage until its record contains:

- the direct technical cause;
- the process decision that allowed it;
- contributing conditions;
- the resulting external state;
- recovery evidence;
- a preventive control in code or process;
- a test or check proving that control works;
- any uncertainty that remains.

Creating a new generation, retrying the failed action or changing an assertion is not a preventive control. A successor requires a fresh identifier and journal only after the root cause and preventive control have been independently reviewed.

## Stop conditions

Stop immediately on unexpected hosted state, a consumed journal, unreviewed mutation, test access to a live launcher, enabled gates during ordinary tests, uncertain acknowledgement, missing recovery evidence, or a difference between the stage plan and actual execution. Preserve evidence and reconcile; never retry to discover what happened.
