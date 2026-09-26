# Stage 3 — disabled Vercel Preview source readback

## Outcome and acceptance

Add an injected-only, read-only Vercel path that identifies the fixed Preview alias's deployment and its Git source without a protection bypass or application/Edge request. Compose that receipt with the existing project-link reader and fail closed unless the linked and deployed numeric GitHub repository IDs both equal `1264363509`. Synthetic tests must cover matching identity, repository/branch drift, missing manifest metadata, abort and one-shot behavior. No hosted request is in this unit.

## Starting evidence and exclusions

At local `62a00f4`, the reviewed Git source guard reports `SOURCE_NOT_AT_REMOTE`; the last known remote tip is `0f8027288ac52667089a094b73a2c03ff63ca916` and the dashboard's visible Ready Preview source is `536d36a515ad39449338748b5739b0dcdedf8256`. Recheck these before any future hosted action. Existing `staging-account-hosted-baseline-vercel.mjs` reads the fixed project link; `staging-account-hosted-baseline-surface.mjs` already parses fixed alias and deployment responses but its full baseline also requires a Preview bypass and touches application/Edge endpoints. This unit reuses those parsers and HTTP bounds in a narrow Vercel-only method. Production, deployment, push, provider/database/Shopify changes, customer communication, purchases and supplier orders are excluded.

## Planned changes and checks

- Change only `scripts/staging-account-hosted-baseline-surface.mjs`, add focused synthetic tests, and update the hosted-baseline manifest hash for changed code. A small composition function may be added only if it prevents treating two individually valid but inconsistent receipts as sufficient evidence.
- The new factory accepts injected `fetch` and a private Vercel token Buffer; reads only the fixed alias GET then its deployment GET; validates project/team, Preview target, branch, immutable URL and deployment Git source; consumes one call and wipes its token. It never accepts a caller URL or bypass and never issues POST.
- The composition must check exact fixed linked repository ID and deployed repository ID. A missing application manifest hash is a HOLD, not a guessed match. Do not infer deployed bytes from `meta` alone.
- Run focused tests, generate/check both manifests, live-boundary check, typecheck, lint and full disabled suite. Independently review the exact disabled diff before commit. Ordinary tests run only with all gates false.

## Stop and recovery

Stop on mismatched or unavailable identities, branch, alias, deployment state, malformed response, abort or any requested endpoint outside the two fixed Vercel GETs. Do not make a live request in this unit. A later separately reviewed plan must capture fresh Git/Vercel baselines, exact arming diff, action-time token approval, bounded one-shot execution and disarm. Preserve unrelated untracked files and consumed journals. On test failure, diagnose and correct the cause before rerunning the affected check; no hosted retry exists here.

## Disabled result

Implemented the Vercel-only two-GET readback and a pure linked/deployed repository check. The first test failure came from treating the shared JSON parser's direct return as a wrapped response; the adapter and focused test were corrected. Independent review then found two cancellation races: `dispose()` did not interrupt an active read, and a scheduled fetch could still start after immediate abort/disposal. An owned abort controller, a pre-fetch guard and regressions for immediate and mid-body cancellation resolve both. Independent re-review returned GO for disabled code only. Focused 13/13 and full 2,371/2,371 tests passed; typecheck, both manifest checks, live-boundary and diff checks passed; lint had zero errors and the same 20 existing warnings. No hosted request or credential access occurred.
