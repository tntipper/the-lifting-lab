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
