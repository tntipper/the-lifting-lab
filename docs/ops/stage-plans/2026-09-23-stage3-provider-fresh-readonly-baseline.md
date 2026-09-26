# Stage 3 provider normalization — fresh read-only baseline

## Outcome and acceptance

Establish current, source-labelled evidence for the staging-only provider normalization gate after disabled launcher commit `a3f4c91`. Observe the exact staging provider's enabled/JWKS state, staging database/secret/control state where existing read access supports it, and Vercel Preview identity/source/manifest proof. Record each item as VERIFIED, HOLD or UNAVAILABLE; do not infer hidden Admin fields or API metadata from a dashboard. This unit ends with a GO/HOLD decision on preparing an arming diff, not with an update.

## Starting state and scope

Repository `implementation-integration`, branch `codex/tll-integration`, must have launcher/helper and all native gates false, with activation and hosted-baseline manifests current. Preserve unrelated untracked files and all consumed journals. Historical evidence says the custom provider is enabled/JWKS-configured and the Ready Preview is behind local HEAD; neither is a fresh result. Read only the exact staging Supabase project `qdmvngjwkcsilzmqksme`, Vercel project `the-lifting-lab` and `codex/tll-integration` Preview. The separate production Supabase project `wrhgscovsgsudtedbljr` is excluded.

## Permitted observations and stop conditions

First verify `pwd`, HEAD/status, false gates, manifest checks and live-boundary check. Then use existing signed-in browser pages or already authorized read-only CLI state to inspect staging provider and Vercel Preview. Do not create a token, reveal or print a secret, approve a permission, run a one-shot observer, start a journal, update provider/DNS/database/deployment, open the shop, send email or purchase. If login, MFA, Keychain prompt or fresh credential is required, mark that source UNAVAILABLE and stop that path. Mask any customer or secret values in evidence. Database/secret/flag facts that cannot be established from a fixed read-only source remain UNAVAILABLE, never inferred from old receipts.

Check that the provider identifier and project match the fixed source contract. For Vercel, capture project/deployment ID, Git repository/branch/commit and whether exact custom `meta.tllManifestSha256` can be proven. UI absence is not proof of API absence. Do not call a ready Preview the current application unless its source commit and manifest match local reviewed state. Record observation time, surface and limits without raw credentials.

## Verification, review and next gate

Compare observations against the normalization preflight contract and stage protocol. A provider enabled/JWKS or missing/unknown database/secret/Preview proof yields HOLD for arming. Independently review any subsequent minimal arming diff; this baseline alone is not authority to enable the launcher. If an external access gate or unexpected state appears, stop and update this plan before any different method. Save a concise evidence note and `.agent/HANDOVER.md` checkpoint. Maximum hosted mutations: zero; maximum live-launcher invocations: zero.

## Result

The signed-in dashboards yielded a partial fresh baseline. The provider remains enabled/JWKS-configured, the Edge secret-name table lacks the broker client-secret name and its disabled flag digest matches literal `false`, and the latest Ready Preview remains at Git commit `536d36a`, behind local HEAD. The staging SQL editor redirected to the organization projects page with an access-denied toast, so a fresh database receipt could not be obtained there. The UI also cannot prove the full provider Admin response or deployment manifest metadata. Exact evidence and limits are in `docs/ops/evidence/2026-09-23-stage3-provider-readonly-baseline.md`. Decision: **HOLD for arming**, with no credential or hosted mutation.

## CLI diagnostic amendment, before further reads

A cached Supabase CLI 2.117.0 binary listed the separate production and staging project refs using the already signed-in account, with no new credential or prompt. Its documented `db query --linked --project-ref qdmvngjwkcsilzmqksme` path reached the Management API, but the repository's strict immutable baseline SQL returned `Hosted baseline staging binding mismatch`. That SQL requires `current_user=session_user=supabase_read_only_user`; do not change or weaken it merely to obtain PASS. The first CLI invocation without `--linked` was rejected locally by argument validation, with no query. The second reached staging and failed before returning the fixed receipt.

One separate diagnostic may now execute an explicit `BEGIN READ ONLY` transaction through the same fixed project ref. It may report only `current_database`, `current_user`, `session_user`, and counts of environment rows matching the staging and excluded production project refs. Stop if the database is not `postgres`, if there is not exactly one matching staging row and zero production rows, or if any command presents a sign-in/Keychain/permission prompt. If identity passes, a separate aggregate-only `BEGIN READ ONLY` query may report migration count, five control-enabled counts, runtime-role count/login states and runtime-session count. It cannot stand in for the strict read-only-user baseline receipt or authorize arming; it only identifies why the standard query is unavailable and whether other drift exists. No raw customer rows, credentials, provider secrets or role password hashes may be selected or logged. Preserve the original failed receipt and maintain HOLD.

The exact-project identity diagnostic passed with `current_database=postgres`, execution/session role `postgres`, one staging environment row and zero production rows. Aggregate-only results: 15 migrations, five runtime roles, zero roles with login or nonretired validity, zero runtime sessions and zero enabled controls in all five stores. These are useful drift checks but **not** the strict baseline receipt: the query did not verify role passwords, markers, ACL edges, table singleton shape or provider Admin fields. No hosted mutation or credential display occurred. Maintain HOLD.
