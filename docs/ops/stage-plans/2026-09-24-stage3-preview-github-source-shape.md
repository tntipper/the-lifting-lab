# Stage 3 — correct the disabled Vercel GitHub source shape

## Outcome and acceptance

Correct the pure Preview deployment request to the documented regular GitHub `gitSource` variant before any transport is attached. The request must pin `tntipper/the-lifting-lab`, the existing branch and full commit SHA, the fixed team/project, and the manifest digest. The numeric repository ID remains a separate pre-POST identity check, not a field in the regular GitHub request. Positive and adversarial focused tests, activation-manifest checks, typecheck and live-boundary must pass while deployment remains disabled.

## Starting evidence and assumptions

At local `dab4114` on `codex/tll-integration`, the tracked tree is clean; six unrelated untracked paths must be preserved. Remote branch is `0f8027288ac52667089a094b73a2c03ff63ca916`, so no current-source deployment can be attempted yet. The latest read-only Vercel receipt identifies linked and deployed repository ID `1264363509` but an old Preview source. The current pure request uses `{type:'github',repoId,...}`. Vercel's current official SDK example for regular `github` uses `{org,repo,ref,sha,type}`; `repoId` appears in the separate `github-limited` variant. This is a contract mismatch, not evidence that a particular project POST will succeed.

Official references: https://github.com/vercel/sdk/blob/main/docs/sdks/deployments/README.md#createDeployment and https://github.com/vercel/sdk/blob/main/docs/models/createdeploymentrequestbody.md . The REST API says omitting `target` selects Preview: https://vercel.com/docs/rest-api/deployments/create-a-new-deployment .

## Scope and exclusions

Change only the pure request module, its focused test, the generated activation manifest if its source pin changes, this plan and the handover. No transport, token, push, deployment, hosted setting, provider, database, Shopify, customer message, purchase or supplier order. Keep `STAGING_PREVIEW_DEPLOYMENT_REQUEST_ENABLED=false` and native `createDeployment()` unavailable. Do not change the stored numeric repository identity used for the separate preflight.

## Checks, execution and recovery

Before edit, verify branch/HEAD/status, remote SHA, false native gates, and the official variant. Make the smallest constant-shape correction and assert that the body has no `repoId`, no `target` and no caller-selected fields. Run focused tests, both manifest checks, TypeScript, live-boundary and diff checks. If a check fails, diagnose and correct without opening a hosted window. Maximum hosted attempts: zero; no deadline because this is local-only.

Review the exact disabled diff for source pinning, request-shape correctness, accidental production targeting, and any new transport path. A separate stage plan, fresh hosted baseline, one-shot journal, reviewed arming diff and action-time approval are required before a future push or POST. Record the checked result and remaining blockers in `.agent/HANDOVER.md`.

## Verified disabled result

The request now uses the regular GitHub variant `{type:'github',org:'tntipper',repo:'the-lifting-lab',ref,sha}`. It does not include `repoId`; the fixed `1264363509` constant remains for the separate connected-repository identity gate. The native `createDeployment()` still throws and both request/native activation flags remain false. An independent reviewer returned GO for this disabled correction and HOLD for hosted transport. Focused request/native tests passed 14/14; the full disabled suite passed 2,378 with two skips and no failures. Typecheck, both manifest checks, live-boundary and diff checks passed; lint had zero errors and the same 20 warnings. No push, POST or hosted state change occurred.

Local Git verification used the installed Codex fallback Git binary because `/usr/bin/git` currently exits on the machine's unaccepted Xcode license. The fixed source-proof CLI still invokes `/usr/bin/git` and will return HOLD until that machine condition is resolved or a separately reviewed runner boundary is provided; this correction does not weaken its executable pin.
