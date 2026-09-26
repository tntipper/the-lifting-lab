# V8 hosted observer incident: Vercel project merge

## Gate and intended outcome

The one approved v8 observer invocation is consumed. It returned terminal
`OBSERVATION_FAILED` with `vercel_merge_unavailable`. Do not arm or run v8
again, create v9, deploy, change provider state, send customer mail, place
orders, or touch production. This unit may only identify the cause, correct
the disabled merge contract, verify it, and preserve a handover.

Acceptance: a deterministic counterexample first reproduces the failure;
the smallest correction accepts the observed staging project metadata only
when the Git provider and repository ID still agree with the deployment;
negative identity tests still fail closed. All native gates stay false, both
manifests and the full disabled suite pass, and an independent reviewer
accepts the exact correction before commit.

## Authoritative starting state and evidence

V8 journal `../implementation-state/staging/tll-hosted-baseline-observation-v8.json`
is terminal, mode 0600, one link, SHA-256
`49ac5c4e6fe22fb384a363a24dbc46b308a37b81e28503fbb8767ec8a10b83fd`,
run ID `68bfe246-3308-4690-854d-845245bca34b`, with no observation hash.
V7 remains at its prior hash. The launcher and Keychain helper were disarmed
and the live-boundary check passed. The local one-hour Vercel token item was
removed; the remote token will expire naturally. The retained Preview bypass
was left in place with `Confirm before allowing access` and its temporary
`/usr/bin/security` allowance removed.

Fresh separate read-only Supabase reconciliation still passed the strict
database receipt: 15 migrations, zero enabled controls, five runtime roles,
zero runtime sessions, zero execution edges and five operator edges. The
broker secret was absent; provider schema remained valid, enabled and JWKS
configured. No hosted mutation was made by the observer.

A bounded local-only diagnostic read the exact Vercel project, alias and
deployment API endpoints. All returned HTTP 200. The project `link` has
`sourceless: true`; its GitHub repository ID matches the deployment's Git
source repository ID, both IDs are integers, Git provider and branch match,
and the deployment commit matches the preflight commit. The current
`mergeVercel` rejects `sourceless !== false` before checking those matching
identities. This is the direct v8 failure cause. The process error was a
preflight that checked project and deployment independently, but never
exercised their exact composition and omitted `sourceless` from its
categorical report. The earlier synthetic fixture only used `false`.

## Bounded offline correction

Only `scripts/staging-account-hosted-baseline-composition.mjs`, its focused
test, generated hosted manifest, this record and `.agent/HANDOVER.md` may
change. Before editing, verify Git identity/status, false gates, journal
hash/mode and current manifest pins. Add a red test for `sourceless: true`
with matching GitHub repository ID/provider; require a valid HOLD receipt
under the known staging provider and missing application manifest. Retain
tests that a mismatched repository ID, provider or malformed `sourceless`
value fails closed. The boolean is not a repository identity proof; the
exact project/deployment Git identity checks remain authoritative.

Run focused tests, full disabled `npm test`, both manifest checks and
`npm run check:live-boundaries`. Obtain independent read-only review of the
exact diff. If the result cannot be reproduced, a project/deployment ID
disagrees, or correction widens beyond this merge rule, stop and revise this
plan. Commit only the reviewed disabled fix. A future observer generation
requires a separate stage plan, fresh hosted baseline and authorization.

## Verified offline result

The new staging-shaped test failed against the old merge with the same fixed
`vercel_merge_unavailable` code. The one-line correction requires
`sourceless` to be boolean but no longer treats `false` as repository identity
proof. Exact GitHub provider and project/deployment repository ID agreement
remain mandatory. The corrected test records the expected three-reason HOLD;
new counterexamples reject mismatched repository IDs, wrong provider and a
non-boolean `sourceless` value.

Focused hosted tests passed 40/40; full disabled `npm test` passed
2,263/2,263. Both manifest checks, the live-boundary check and lint passed;
lint reported zero errors and 20 pre-existing warnings. An independent
read-only reviewer returned GO for the exact disabled correction and its
generated manifest hashes. The v8 journal remains a failed, consumed
observation; this offline fix is not a hosted PASS or permission to replay it.
