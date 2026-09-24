# Stage 3 — Git-triggered Preview source proof decision

## Outcome and acceptance

Use the connected staging branch's normal Git-triggered Vercel Preview as the primary route to a current protected Preview. Accept source provenance only when a fresh Vercel project/deployment read identifies the fixed project, team, GitHub repository ID `1264363509`, `codex/tll-integration` branch, full selected SHA, `target:null`, `READY` state and immutable URL; a fresh Git read identifies the same remote SHA and hashes the activation-manifest bytes from that immutable commit; the protected branch alias resolves to that same deployment before and after deployment-bound runtime readiness; and disabled customer/cart/Edge flags are observed. A metadata string asserting a manifest hash is neither required nor sufficient. This is Git source provenance plus runtime verification, not byte-for-byte proof of Vercel's build artifact.

This decision supersedes the custom POST/`tllManifestSha256` route proposed in `2026-09-23-stage3-preview-source-readiness.md` for the **first current-source Preview**. The POST contract remains disabled and must not be used as an unreviewed fallback. A separately planned targeted deployment can be considered if the Git-triggered Preview fails, after diagnosing the reason.

## Starting evidence and assumptions

At `aba39d7` locally, the remote staging branch remains at `0f8027288ac52667089a094b73a2c03ff63ca916`, 35 commits behind the local tip. The last hosted read found an older Ready Preview at `536d36a515ad39449338748b5739b0dcdedf8256`, so the current source is not deployed. The branch's local Next build passes. Existing project/deployment readback confirms the fixed numeric GitHub repository ID, but hosted settings and source identity must be reread immediately before publication. `/usr/bin/git` currently exits on this Mac's unaccepted Xcode license; the fixed source-proof CLI must be made operational through a separately reviewed, constrained runner or the machine condition resolved before the publish gate.

Vercel documents automatic Preview deployments on non-production branch pushes and branch-specific Preview variables: https://vercel.com/docs/git and https://vercel.com/docs/environment-variables/manage-across-environments . Independent review of this decision found that custom POST metadata adds no independent assurance and recommended the Git/source/runtime evidence chain; it also identified the contract changes and race checks below.

## Scope and exclusions

This document is a design and disabled-implementation plan. It authorizes no push, deployment, token, provider/database/Shopify change, customer message, purchase or supplier order. Production and custom environments are excluded. Existing native gates remain false. Preserve unrelated untracked files and all consumed journals.

The disabled implementation may change only the source-proof runner, hosted-source assessment and its tests, hosted-baseline evidence contract/session and tests, activation manifest, live-boundary checks where required, this plan and handover. Do not change a fail-closed status into PASS merely because Vercel reports a SHA. The source proof and runtime proof must be composed explicitly.

## Required disabled work before external action

1. Inspect the full remote-to-selected-commit release diff, project production branch/custom environment/build settings, branch-specific Preview variables, protection and alias rules. Stop on any source or settings drift.
2. Revise the current metadata-dependent contracts in `staging-account-hosted-baseline-surface.mjs`, `staging-account-hosted-baseline.mjs`, `staging-account-hosted-baseline-session.mjs` and `staging-surface-activation-native-binding.mjs` so that a fresh immutable Git manifest digest is carried as a distinct source-proof field, never fabricated into Vercel `meta`. Missing or mismatched source proof remains HOLD. Existing source and runtime identity failures remain hard stops.
3. Provide a constrained Git runner that works on this Mac without accepting the Xcode licence on the owner's behalf. It must preserve the existing fixed command/remote/environment allowlist and reject a substituted repository or arbitrary executable. Test the real command boundary and negative cases.
4. Prepare an exclusive mode-0600, one-use publish journal. The selected full SHA, remote predecessor and manifest digest are recorded before one fast-forward push; uncertain acknowledgement requires independent `ls-remote` reconciliation, never a blind retry. No ordinary tests run while any native live gate is armed.
5. Test the disabled end-to-end evidence composition with injected Vercel/Git/runtime fixtures, including stale SHA, remote rewrite, branch-variable drift, alias movement, stale readiness and missing manifest. Independently review the complete disabled diff and then the smallest action-time arming diff.

## External stage gate and recovery

Before a push, capture a fresh read-only Git/Vercel/Shopify/Supabase frozen-state baseline and confirm disabled flags, no production target and a clean selected source. Obtain a separate action-time owner approval because pushing this connected branch will trigger an external Preview deployment. Maximum push attempts: one. Wait for a bounded build result, then read the immutable deployment, remote manifest bytes, protected alias and deployment-bound readiness. If Vercel does not produce a current Ready Preview, the alias moves unexpectedly, or any readback is uncertain, stop, leave account activation held, preserve the journal and reconcile read-only. Do not automatically POST, redeploy, force-push or enable sign-in. Record a secret-free receipt, disarm and update the handover.
