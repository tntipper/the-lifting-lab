# Stage 3 credential-reader diagnostic repair (disabled source)

## Outcome and boundary

Make a future staging Keychain precheck explain **why** the exact provider-normalization helper fails, without printing a credential or consuming either provider-mutation journal. This is a diagnostic repair, not authorization to resume the provider change. Acceptance: the disabled helper returns distinct fixed process exit codes for disabled gate, Keychain timeout, command failure, invalid credential shape and output failure; ordinary launcher behavior remains fail-closed; offline tests prove those cases; source and activation manifest pass; an independent reviewer accepts the change and the incident remains HOLD.

Production, hosted changes, new credentials, Keychain permission changes, customer messages, purchases, deployment, connected-branch push and provider mutation are excluded. Do not arm the helper or run a native credential read as part of this repair.

## Starting evidence and assumption

Integration HEAD `6701b51822c2894b435f8f2331c4e55f98e11945` has six unrelated untracked paths to preserve. Sibling provider-normalization worktree is disarmed at `c08633e300ab22b8cc711c42d331bc0f7c1b1391`; both mutation journals are absent. The incident record is `docs/ops/evidence/2026-09-24-stage3-provider-credential-storage-incident.md`. The exact helper currently collapses all failures into exit 1. A direct non-journaled diagnostic read, with values suppressed, returned PASS under normal and PATH/LANG-only environments, so the environment-stripping theory is unproved. The underlying cause remains unknown. No current read result establishes future cold-start reliability.

## Allowed changes and failure controls

Only `scripts/staging-provider-normalization-keychain.py`, a focused isolated test, the generated activation manifest and this plan/evidence/handover may change. Keep `APPROVED_NATIVE_READ = False`, all other gates false and the main launcher unchanged. Use fixed exit codes only; never emit a Keychain value, selector, item metadata, subprocess stderr, exception text or traceback on failure. Preserve credential validation and buffer wiping. The test copies the helper and replaces its `/usr/bin/security` command with `/bin/false` **before import**; mocked subprocess results are installed before enabling the copy's in-memory gate. Tests run offline and prove no real native invocation or mutation journal. A direct disabled-helper invocation must return the disabled code without native access. If categorization changes a successful read's bytes or exposes data, stop and revert the repair.

## Execution and review

1. Verify repository and sibling identity, statuses, disabled gates and absent mutation journals.
2. Implement the helper's fixed categories and isolated tests. Regenerate the activation manifest while disabled.
3. Run the focused tests, disabled helper, activation-manifest check, `npm run check:live-boundaries`, targeted lint/typecheck as relevant and `git diff --check`. Do not run ordinary tests while any gate is armed.
4. Obtain independent read-only review of the exact disabled diff for secret leakage, fail-closed behavior and test isolation. Correct and rerun focused checks if review finds a defect.
5. Commit the secret-free disabled repair and update the incident/handover. A later separate plan and owner approval must cover a fresh, bounded credential-readiness window, its exact all-selector check, hosted baseline and any provider mutation. Do not reuse the previous arming commit.
