# Stage 3 fixture incident: disabled child-result classification slice

## Outcome and boundary

Retain the one-use synthetic cleanup in HOLD, but make its injected parent coordinator distinguish fixed, secret-free child failure classes instead of converting every result to `UNCERTAIN/CHILD`. This is the first, small diagnostic slice in the [revised remaining-work plan](../revised-remaining-work-plan-2026-09-24.md). It does **not** diagnose the already-consumed run, arm the launcher, read a credential, inspect the real fixture, delete a file, change a provider, push, deploy, purchase or send a message. Native Security.framework diagnostics and durable phase-specific result recording are later reviewed slices; this change must not be described as incident closure.

## Starting state and permitted files

At planning, repository `implementation-integration` is `codex/tll-integration` at `ea9dd7d8f8eab9577a3f90a485af9b14d73d594b`; all recovery gates are false. The preserved V1 journal is terminal `API_DELETE/UNCERTAIN`, and the fixture remains unchanged per [incident record](../evidence/2026-09-24-stage3-fixture-v1-recovery-uncertain-incident.md). Recheck Git status, disabled gates and manifest before editing. Only `scripts/staging-provider-keychain-fixture-recovery-session.mjs`, its focused test, the manifest's pinned hash, this stage plan, and evidence/handover may change. Preserve the six existing unrelated untracked paths and private journals.

## Assumption, proof and failure handling

The parent receives a Node `spawnSync` result with a status, signal, error and bounded buffers. Test injected combinations first. Map only known non-secret outcomes: spawn failure, signal/timeout, native exit 30 (undifferentiated native HOLD), native exit 31 (native guard), unknown exit, stderr and malformed receipt. All remain `UNCERTAIN` after a child may have started; category is diagnostic, never permission to retry. An unknown shape must fail closed. The session must carry the category it received to its result rather than collapse it. The journal's terminal outcome remains unchanged.

Run focused tests, `npm run typecheck`, manifest generation/check and `npm run check:live-boundaries` while gates are false. Inspect the exact diff and ensure no launcher, native gate or external transport changed. If any check fails, diagnose and correct the narrow code or stop; do not run the live launcher. Record results and update the canonical handover. Independent security review is required before using a later native diagnostic or successor deletion; this slice itself authorises no external step.
