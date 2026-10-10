# Stage 3 fresh dashboard read — 25 September

Read-only observation through the newly connected Chrome profile. No provider setting was saved, no credential was read, and no customer/cart control was activated.

## Supabase staging

- Signed-in dashboard path identified project `qdmvngjwkcsilzmqksme` as `tll-staging` under My Lifting Lab. The dashboard labels its `main` branch `PRODUCTION`; this is the main branch of the **staging project**, not the separate production project `wrhgscovsgsudtedbljr`.
- Authentication → Sign In / Providers listed `custom:tll-staging-subject-broker-v1` as **ENABLED**.
- Opening its editor showed manual configuration, the expected displayed name, authorization/token/userinfo endpoints, JWKS URI and client ID. The JWKS field was labelled **Required for ID token verification**. The editor did not expose an enabled switch. It was closed with Cancel without saving.
- The row action menu offers `Update`, `Disable` and `Delete`. None was selected. A dashboard-only `Disable` could change enabled state, but the observed UI does not offer the reviewed combined `{enabled:false,jwks_uri:''}` change or full-field readback. It is therefore **not qualified** as the planned normalization route.

## Vercel Preview

- Signed-in Vercel dashboard for My Lifting Lab's projects showed deployment `dpl_9CFPQG6JChoGrkWidhh73BY1Qj1b` Ready in Preview, linked to project `the-lifting-lab`, branch `codex/tll-integration`, source commit `abd5a5258dd1072daf83a4447ce7110465f445e1`, immutable URL `https://the-lifting-7kom7bvbo-my-lifting-lab-s-projects.vercel.app` and branch alias `https://the-lifting-lab-git-codex-tll-4adea2-my-lifting-lab-s-projects.vercel.app`.
- A direct browser visit to the immutable deployment's `/api/staging/readiness` was blocked by the client before page content appeared (`net::ERR_BLOCKED_BY_CLIENT`). This is **not** a readiness result and does not prove current feature flags. No bypass credential was used.
- The signed-in project Environment Variables page displayed the Preview entries for `codex/tll-integration`; none of the displayed names was a broker secret or customer/cart activation flag. Its Shared tab said **No shared variables linked**. Values were not revealed. This is a useful name-level check, not a runtime-readiness or effective-value proof.

## Decision and next proof

The old hosted identity concern is narrowed, but runtime controls and official full provider fields remain unverified. The dashboard editor cannot perform the exact two-field update. Prepare a separate **disabled Supabase-only** operation using the existing exact provider contract, one saved Supabase management credential, one official provider preread, at most one two-field update, and a full independent provider readback. Its failure path must stop without retry or enabling sign-in. Keep the existing nine-gate launcher disabled; do not weaken or reuse its consumed planning assumptions. A current protected Preview/flag observation, independent diff review and fresh action-time owner approval remain necessary before any live mutation or activation.

## Offline implementation slice completed

`scripts/staging-provider-supabase-only-coordinator.mjs` now contains only the injected decision logic for that smaller operation. It cannot find a credential or make a network request. It reuses the existing strict two-field patch and complete provider-field comparison. It records durable intent through an injected journal before any update, calls the injected update once, then requires a separate readback; uncertainty consumes the journal and stops. Its live gate is false.

An independent security reviewer returned **GO for offline core preparation only**, with no concrete defect in the new coordinator. The reviewer identified missing committed failure-path tests; these were added without changing the reviewed coordinator. `tests/staging-provider-supabase-only-coordinator.test.mjs` now passes eight cases: verified one-update path, failed preread before intent, uncertain update with no replay, unrelated-field drift, failed readback, failed durable acknowledgement, malformed update acknowledgement and native-port mutation of its baseline argument. Targeted ESLint, typecheck, activation-manifest check, live-boundary check and diff check passed while all live gates stayed off. This proves **offline behaviour only**. The next slice is a separately reviewed, bounded Supabase-only credential/transport launcher and one-use private journal path, plus fresh protected Preview/flag evidence. Do not arm or run a provider update from this note.

The new coordinator and its eight-case test file are now pinned in the generated Stage 3 activation manifest. Regeneration, manifest `--check`, live-boundary check and diff check passed. This makes later source drift visible before arming; it does not add a live entry point.
