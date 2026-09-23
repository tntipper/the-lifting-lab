# Stage 3 — disabled Git source proof for a future Preview

## Outcome and acceptance

Add one fixed, read-only Git preflight that returns a source SHA and SHA-256 of the activation manifest **from the selected committed tree** only when the local branch, remote branch and clean tracked tree agree. A local-only commit must return HOLD. The future Preview launcher may use this receipt as its source input; this unit does not connect it to a deployment POST or claim that metadata proves deployed bytes.

## Starting state and scope

At local `5b1d74b` on `codex/tll-integration`, `origin` is `https://github.com/tntipper/the-lifting-lab.git`, remote branch HEAD is `0f8027288ac52667089a094b73a2c03ff63ca916`, and the local branch is ahead. The Vercel dashboard's latest visible Preview is older again at `536d36a`. The pure Preview request builder is corrected and reviewed but has no transport; `createDeployment()` still fails closed. Preserve unrelated untracked files and consumed journals.

Change only a new injected core/CLI script, its focused synthetic tests, activation-manifest source pins and generated manifest, this plan and `.agent/HANDOVER.md`. Run no deployment, push, token read, Vercel API call, alias change, provider/database/Shopify write, customer communication, purchase or supplier order. Production is excluded.

## Design and checks

Use fixed Git argument vectors, exact origin URL, exact branch `codex/tll-integration`, full 40-character lowercase commit hashes, `git status --porcelain --untracked-files=no` and `git show <captured-full-SHA>:config/staging-account-activation-manifest.json`. The remote read uses the literal fixed HTTPS URL from outside the checkout with global/system configuration and prompts disabled; require exactly one matching ref. If any command, identity, branch, tracked-status or hash check fails, return a fixed HOLD without printing command output. Compute the manifest SHA-256 from committed bytes, not from the working tree or a caller's claimed hash. The injected core must have no ambient Git/network access; only its dedicated CLI supplies a fixed runner. Output only a fixed status, source SHA and manifest digest on PASS, never file content or Git diagnostics. This proves a snapshot of the selected immutable commit at read time, not that the branch can never advance; a later deployment gate must recheck remote state and deploy the full SHA.

Independent review of the first draft found two concrete source-provenance gaps before commit. `git show HEAD:path` could read a different commit if HEAD moved after `rev-parse`; change it to the captured full commit SHA. `ls-remote origin` could follow local/global Git URL rewrites or `GIT_CONFIG_*` environment settings despite the raw origin URL check. Use the literal fixed HTTPS repository URL, run the remote command outside the checkout with a minimal scrubbed Git environment and prompts disabled, and reject if that route cannot read the repository. Do not fall back to a credential helper or weaker origin-relative check in this unit. Add regressions for exact captured-SHA show and fixed remote URL/runner isolation, then re-review.

Test exact-match PASS, local/remote mismatch, wrong origin/branch/ref, dirty tracked tree, malformed hashes, command failure and committed bytes differing from the working copy. Run focused tests, the full disabled suite, typecheck, lint, both manifest checks, live-boundary and diff checks. Obtain independent review of the exact disabled diff. The actual CLI is expected to return HOLD while the remote branch lags, which is a correct gate result, not a reason to push in this unit.

## Stop and next gate

Do not infer remote equality from cached refs or a dashboard label. If a Git command prompts for new access, fails, or returns untrusted structure, stop and record HOLD. A PASS source receipt still does not prove Vercel's linked repository ID, Preview branch variables, deployed content or alias. The later Vercel POST stage needs separately reviewed readback and action-time authorization; never use this preflight to bypass those checks.

## Verified disabled checkpoint

The first independent review reproduced both provenance gaps in synthetic/local probes. The corrected source binds `git show` to the captured full SHA and isolates the literal-URL remote command from checkout/global/system configuration and ambient Git credentials. Re-review returned GO for the disabled checkpoint, with no actionable finding. Focused preflight/manifest tests passed 13/13; full disabled suite 2,368/2,368, typecheck, both manifest checks and live-boundary passed. Lint had zero errors and the same 20 warnings. A separate isolated read of the literal remote URL returned the known `0f8027288ac52667089a094b73a2c03ff63ca916` ref without a credential helper. The direct CLI preflight run while source edits were uncommitted returned the expected fixed `SOURCE_PROOF_UNAVAILABLE`; repeat it after this checkpoint is committed to distinguish tracked-tree HOLD from remote-lag HOLD. No push, deployment, token or Vercel API call occurred.
