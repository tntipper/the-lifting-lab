# Stage 3 immutable Preview request contract (disabled)

## Intended outcome and measurable acceptance

Prepare a pure, injected-only request contract for a future Vercel Preview deployment that carries the exact source commit and TLL activation-manifest hash. It must pin the existing team/project, GitHub repository ID, branch and Preview target; accept no caller-provided destination, arbitrary metadata or production target. Acceptance is a reviewed source diff, positive and adversarial request tests, passing live-boundary and generated-manifest checks, and no network call or deployment. This does not arm the existing `createDeployment` port.

## Starting state and assumptions

`staging-surface-activation-native-binding.mjs` deliberately has `createDeployment()` unavailable. The observer expects `meta.tllManifestSha256`, but no writer exists. The current Preview source is behind local HEAD and the staging provider is enabled with JWKS, so no new observer run is useful yet. GitHub's read-only repository API reported numeric ID `1264363509` for `tntipper/the-lifting-lab`; Vercel's project API must independently confirm that ID before any hosted POST. Vercel's current [Create a new deployment API](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment) permits `gitSource` and a `meta` object; its [CLI guide](https://vercel.com/docs/cli/deploy) confirms metadata and warns that a Preview branch/variables must be verified. The exact gitSource variant and runtime branch assignment still require a provider-shaped dry run/readback before activation.

## Boundaries and files

No customer email, purchase, supplier order, production deployment, provider/database change, token, Keychain read, live launcher, alias change or POST in this unit. Only the new pure request module/test, activation-manifest generator and its fixed source-list test, generated activation manifest, this plan, and `.agent/HANDOVER.md` may change. Preserve all unrelated untracked files and consumed journals.

## Checks, stop conditions and recovery

Before editing: verify Git identity/status, disabled native flags, consumed v8 hash/mode and current manifests. Derive a request from fixed constants plus a full 40-character commit and 64-character manifest hash only. Reject malformed or extra fields and require both public flags to be false for the first disabled Preview. Include only metadata needed for exact branch/source/manifest proof. Assert the request cannot target `production` or a different project/repository. No test may invoke fetch or a CLI. Stop if Vercel's public API contract does not support the intended Git SHA pin or if review identifies a branch/alias risk; preserve the module disabled.

Run focused tests, `check:live-boundaries`, both manifest `--check` commands and `git diff --check`. The request contract is not an independently approved deployment, and it must remain unconnected until a separate stage plan covers an exact source push, project API readback, one-shot journal, build/alias verification, rollback and independent review of the final POST binding. Maximum hosted attempts: zero.

## Correction learned during verification

The first full disabled suite found a single fixed-list test failure: the activation-manifest generator included the two new source pins, but `tests/staging-account-activation-manifest.test.mjs` separately asserts the complete ordered source list. The request/adapter focused tests and live-boundary check passed. Update only that fixed-list expectation and rerun the suite; this test maintenance should be included whenever an activation-manifest source pin is added. Keep `deploymentCreationBindingImplemented:false` and its hold reason unchanged until Vercel's connected repository ID is independently read back and a real binding is separately reviewed.

## Verified disabled result

The pure contract now returns only `POST /v13/deployments` for the pinned team/project, a GitHub source with the exact staging branch, numeric repository ID and full requested SHA, plus the three allowlisted metadata fields used by the existing readback parser. The request body deliberately omits `target`, which Vercel documents as the Preview default; no callable transport consumes this body. It rejects any extra input, another branch, malformed hash, enabled public flags or caller-selected target/project/metadata. The GitHub repository API identified ID `1264363509`; a future exact Vercel project API read must confirm its linked `repoId` before a POST can be considered.

The corrected focused request/native adapter tests passed 18/18. The full disabled suite passed **2,318/2,318** after correcting the source-list expectation. Both manifest checks, `check:live-boundaries`, TypeScript and `git diff --check` passed; lint had zero errors and 20 existing warnings. The activation manifest pins the new module and tests. The existing native `createDeployment` still throws, `deploymentCreationBindingImplemented` remains false, and no hosted request or setting change occurred. This is ready for independent review as an offline unit, **not** approval to deploy. The next mutation plan must settle the exact API shape and branch/alias behavior against Vercel's connected repository identity before implementation or arming.
