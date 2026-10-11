# Stage 3 — current immutable Preview source and manifest proof

## Outcome and acceptance

Prepare a disabled, independently reviewed path to one current `codex/tll-integration` Vercel Preview whose deployed source and activation manifest can be verified from authoritative readback, before provider normalization or sign-in acceptance. This planning unit has zero deployment, push, token read, alias change or other hosted mutation. The next disabled implementation unit may add an injected-only Vercel read/deployment binding and tests, but must keep `createDeployment()` unavailable until a separate one-shot journal and action-time gate are reviewed.

## Starting evidence and blockers

At local `95a118e`, `git ls-remote` showed `origin/codex/tll-integration` at `0f8027288ac52667089a094b73a2c03ff63ca916`, an ancestor 24 commits behind local HEAD. The signed-in Vercel project dashboard showed the latest visible Ready Preview for the branch at `536d36a515ad39449338748b5739b0dcdedf8256`, older than the remote branch tip. Neither is the current reviewed source. The pure request contract is now corrected and independently reviewed at `95a118e`, but has no transport, and the native `createDeployment()` still fails closed. Its custom manifest metadata is a **claim**, not proof that Vercel built those bytes.

Vercel's current [deployment API](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment) documents `POST /v13/deployments`, optional `gitSource` and `meta`, and says omission of `target` selects Preview. The Git source has several variants whose exact GitHub shape must be confirmed before coding a live POST. Vercel's [Git deployment guide](https://vercel.com/docs/git) distinguishes targeted commit deployments from branch-head deployments and notes that branch selection affects environment variables. These docs inform a design; they do not establish what this connected project will accept or deploy.

## Scope and exclusions

Allow only the exact team `team_gf7cgIkkoeMLtODFDDT5MrW4`, project `prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4`, GitHub repository `tntipper/the-lifting-lab` / ID `1264363509`, branch `codex/tll-integration`, and a reviewed full 40-character source SHA with its committed `config/staging-account-activation-manifest.json` SHA-256. Exclude Production, custom environments, public/customer flags, provider/database/Shopify changes, customer messages, purchases and supplier orders. Do not push, deploy, create tokens or use a bypass in the disabled implementation unit. Preserve all unrelated untracked files and consumed journals.

## Required sequence before any Preview POST

1. Capture current `pwd`, branch, HEAD, status, source manifest hash and remote branch HEAD. Resolve local/remote divergence before selecting an immutable source; never deploy a local-only commit by merely asserting its SHA in metadata.
2. Independently read Vercel project API `link.repoId`, provider, repository name, production branch and project/team ID. Confirm they match the fixed GitHub repository identity. Read the selected remote commit and its committed manifest bytes via GitHub or Git after push; compare the declared digest to those exact bytes.
3. Confirm Vercel's accepted GitHub `gitSource` shape and actual connected-project behavior from an authoritative response, with no guessed variant. Confirm Preview branch variable selection, build settings, protection, expected alias behavior and rollback/readback path. A dashboard display or echoed `meta` is insufficient.
4. Implement the fixed injected binding while disabled, with bounded response parsing, exact target/commit/manifest checks, an exclusive mode-0600 one-shot phase journal before POST, no retry on uncertain acknowledgement, and separate readback of deployment `readyState`, source SHA, branch, repository ID, environment, manifest metadata, immutable URL and alias. Tests must use injected HTTP only. Independent review is required for the complete read/POST/reconcile boundary.
5. Only after disabled checks pass, prepare a separate external stage plan covering branch push, fresh Vercel/GitHub baseline, exact arming diff, action-time token approval, one maximum POST, deadline, failure reconciliation, rollback and disarm. Verify actual Preview runtime flags from the resulting immutable URL before using it in the provider-normalization preflight.

## Stop conditions and handover

Stop on project/repository mismatch, non-fast-forward branch state, unverified Git source variant, manifest claim without committed-byte proof, Preview variable or alias uncertainty, unexpected public flag, missing one-shot journal, or any source/response drift. Do not substitute a dashboard redeploy or auto-Git Preview for the required exact source-and-manifest receipt. Record the blocked fact and direct cause in `.agent/HANDOVER.md`; no retry or production fallback.
