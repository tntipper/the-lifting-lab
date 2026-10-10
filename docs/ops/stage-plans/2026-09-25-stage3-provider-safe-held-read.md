# Stage 3 provider reconciliation: one read-only observation

Status: disabled preparation. The new launcher and shared Keychain reader remain off. This plan does not authorise a provider update.

The [partial-update incident](../evidence/2026-09-25-stage3-provider-two-field-incident.md) left both mutation journals consumed. Supabase's UI shows the custom provider disabled with its old staging JWKS URL retained. One official read-only observation must establish its present API state before deciding whether that is an acceptable holding state.

## One-run boundary

The only target is staging Supabase project `qdmvngjwkcsilzmqksme` and custom provider `custom:tll-staging-subject-broker-v1`. The disabled launcher reuses the existing fixed Supabase reader. It reads the Supabase CLI Keychain item locally and permits only: one read-only database-control query, one Edge secret-name listing, the service-role key retrieval required by Supabase Auth Admin, and one official provider GET. It contains no provider update call. Results expose fixed status and identifiers, never token or provider values. The retained JWKS comparison is pinned to the exact value observed in Supabase's UI after the partial update.

A new one-use private journal `../implementation-state/staging/tll-provider-safe-held-read-v1.json` is distinct from every previous journal. A failed or uncertain run consumes it and cannot be repeated. The old mutation journals must exist with their expected terminal state; the old and new mutation launchers must remain disabled.

## Gates before access

1. Verify current Git HEAD/status, the two consumed mutation journals, absence of the new read journal, private state-directory permissions, pinned Python interpreter hash, and activation manifest. Preserve the unrelated untracked files.
2. Resolve all dynamic imports in the exact isolated checkout before arming; fresh Git worktrees do not inherit installed libraries. Run focused injected tests, typecheck, lint, manifest and live-boundary checks with all gates off.
3. Obtain independent review of the disabled source and the exact minimal arming diff. Fix any blocker first.
4. Ask the owner for fresh action-time approval for this new credential read. Arm only the new launcher and shared Keychain helper plus their generated manifest hashes, run once, then immediately disarm and verify the journal and source.

## Acceptance and limits

`SAFE_HELD_PROVIDER_OBSERVED` means the present official response is schema-valid; this provider is disabled; its retained JWKS matches the known staging URL; its client, endpoints, scope, PKCE and other pinned settings match; staging database controls are off; and the broker secret name is absent. It does **not** prove no other field changed during the previous update, because the original full provider object was not retained. It does not authorise account/cart activation. Any other result remains HOLD and requires diagnosis before a new plan. No mutation is to be attempted under this read-only approval.
