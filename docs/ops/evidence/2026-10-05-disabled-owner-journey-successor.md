# Disabled owner journey successor — 5 October 2026

Scope: isolated `codex/tll-owner-journey-disabled-20261005` worktree, based on frozen PR59 `58c42bddad7de72e11d2e308afd1c303736c1cba`. PR59 remains unchanged. No active harness owner was found in the available local task inventory; the separate launch verifier owns PR59 verification. No merge, live launcher, credential configuration, deployment request, or purchase was performed.

The harness now waits for canonical `/account`, opens My Stack through account navigation, observes its actual GET `/api/stack` response on two full reloads, and requires identical owner identity, stack identity, revision, recovery conflicts, product IDs and stored servings. Null/legacy doses remain unchanged. An empty saved stack is supported. It returns through Overview and opens Basket from the account page. Browser routing blocks POST/PATCH/DELETE to `/api/stack`. This proves read and reload continuity only; it does not claim stack mutation or purchase verification. Public outcomes contain no account identifiers or contents.

All 68 policy gates remain OFF. Arming policy, database recovery, explicit NOLOGIN/PASSWORD NULL, executor revocation and session drain code are unchanged. Password expiry alone is not session drain or recovery. Activation manifest hashes track the two changed harness files.

## Read-only hosted evidence

Existing connectors, 5 October 2026:

- Supabase `qdmvngjwkcsilzmqksme`: name `tll-staging`, `ACTIVE_HEALTHY`, eu-west-2, Postgres 17.6.1.166. Production project was not queried.
- All six customer/cart/broker/provisional/bridge/inventory control `enabled` values false. Five runtime roles `rolcanlogin=false`; corresponding executor memberships zero; runtime client sessions zero. These point-in-time metadata observations do not replace signed/pinned retirement evidence or prove password nullness.
- Vercel project `prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4`, team `team_gf7cgIkkoeMLtODFDDT5MrW4`, SSO protection enabled for production deployment URLs and all previews.
- Reviewed integration alias resolves to `dpl_HNvrJ1JpHGdf3kGpafqsiVnNP6aQ`, immutable `https://the-lifting-z6es30yzl-my-lifting-lab-s-projects.vercel.app`, READY, preview target, branch `codex/tll-integration`, SHA `4bc8a7a28e4704f738a0b4dc1ec81717803aa622`. It is still the predecessor code, not frozen PR59 or this successor.
- Edge metadata lists broker token/userinfo/readiness and g23-v9 readiness functions. ACTIVE provider deployment status does not mean the commerce/control gate is enabled. No function source or secrets were retrieved.
- Shopify connector identifies the production shop. No staging product/price query was sent through that connection, and no store connection was changed. Historical £19.71 remains unverified.

## Remaining prerequisites and cheapest safe resolution

`rg --files` searched `/Users/tobiastipper/Documents/Codex` and `/tmp` for these exact names, excluding `.git` and `node_modules`, without following symlinks. No matching files were found. No Drive, iCloud, synced paths, Apple Notes, or secrets were accessed.

Required existing v17 receipts (regular, nonsymlink, one link, mode 0600):

| File | Required SHA256 |
| --- | --- |
| tll-generation-23-whole-route-v17.json | bd23fe16ff011f1d23cb4aa64f4cbbb59957205b1c7e19005ee9d8af9c7f3064 |
| tll-generation-23-database-retire-v17.json | b18d50d56a634508c498450b10611a069a0d4d50a68f2fec6af23083af32688c |
| tll-generation-23-broker-gate-retire-v17.json | cb6017d19b2306f4c4d6ecb0a472e86685cb8fda86613bbd75919bb84ac6ecb5 |

The prior execution custodian can export the three existing nonsecret receipts into a permitted nonsynced evidence directory, preserving bytes, then the lane can verify their hashes and copy with the required file metadata. Do not invent, regenerate, or replay predecessor journals. Do not ask Toby to rediscover repositories or tasks.

A fresh read of staging variant `gid://shopify/ProductVariant/57160491139412` in `tll-integration-staging.myshopify.com` is required using an already authorized staging session/tool. None is exposed by the current connected Shopify account. No new credentials or access grants are authorized. The remaining protected build/alias/source identity and disabled flags must be reverified after an approved reviewed-source staging build, never inferred from READY alone.

No live-window approval is requested: prerequisite evidence is incomplete. Parent approval remains required before selecting or starting any temporary window. Recovery must explicitly revoke login and membership and drain sessions; production release, purchases and marketing spend remain Toby's decisions.

## Verification

Focused owner harness tests: 14 passed, including OFF-before-launch, production/payment guards, blocked stack mutations, account → stack → reload → Overview → Basket ordering, held/malformed/cacheable/wrong-origin reads, changed account/servings, read timeout, logout uncertainty, cookie clearing and context closure. Lint, types, both manifest checks and live-boundary checks are run before committing. Independent exact-SHA review and hosted CI results are recorded in the final lane report; no hosted owner sign-in was attempted.
