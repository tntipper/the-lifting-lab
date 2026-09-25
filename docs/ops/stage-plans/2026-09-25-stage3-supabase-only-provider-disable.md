# Stage 3: protected Preview read, then Supabase-only provider disable

Status: preparation only. Both launchers and the shared Keychain reader are disabled. No provider update is authorised by this document.

## Fixed target and purpose

The staging Supabase project is `qdmvngjwkcsilzmqksme`. The only contemplated provider change is to disable `custom:tll-staging-subject-broker-v1` and clear its `jwks_uri`; every other provider field must match its preread. Production, customer/cart activation, orders and purchases are outside this step.

The protected Preview must be the pinned Ready deployment `dpl_9CFPQG6JChoGrkWidhh73BY1Qj1b`, immutable URL `https://the-lifting-7kom7bvbo-my-lifting-lab-s-projects.vercel.app`, branch `codex/tll-integration`. Its `/api/staging/readiness` response must identify that deployment and staging project and report all four private/public account/cart switches `false`. The read uses the retained Preview bypass only, on three ordered GETs (alias, immutable URL, alias), with a distinct one-use journal. No Vercel API token is needed.

## Gates before any live read

1. Verify repository HEAD/status, absent new journals, private state directory, pinned Python binary hash, and generated activation manifest. Preserve unrelated untracked files.
2. Run focused tests, typecheck, targeted lint, disabled-launcher checks, and live-boundary check with every native switch `false`.
3. Obtain independent review of the disabled connection, Preview reader and exact arming change. Fix any blocking finding before proposing an access window.
4. Ask the owner for fresh action-time approval for the one protected Preview read. Apply only the reviewed launcher and Keychain-reader switch changes in an isolated local checkout, regenerate/check the manifest, make one bounded run, then disarm and verify the consumed journal. Do not read a Keychain secret before this approval.

## Gate before provider mutation

The protected Preview result above must be a verified match, not merely a loaded browser page. Refresh the staging database control receipt, Edge secret-name list and official provider preread. Require broker secret absent, all staging controls disabled and provider still enabled with its expected JWKS. Obtain an independent review of the exact arming diff and a separate fresh owner approval for one provider update. The journal records intent before dispatch; the official Admin API may make at most one update attempt, followed by independent full-field readback. Any failed or uncertain dispatch consumes the journal and requires a new read-only reconciliation plan, never a replay. Disarm, verify source and local state, and keep account/cart activation on hold.

## Stop conditions

Stop before mutation if Preview identity or any readiness switch differs, the protected GET is unavailable, a credential read stalls, any preflight value drifts, a journal already exists, an independent reviewer raises a blocker, or the owner has not approved the exact live window. Do not use the Supabase dashboard's separate Disable button: it cannot prove the reviewed two-field update and full-field comparison.
