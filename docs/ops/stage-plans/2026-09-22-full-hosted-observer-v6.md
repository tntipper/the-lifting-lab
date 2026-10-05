# Full hosted observer v6, one staging read-only window

## Outcome and acceptance

Capture one current, secret-free staging observation across the fixed
Supabase database/provider/Edge secret names, Vercel project/Preview
environment/deployment, and immutable readiness surface. A truthful
`OBSERVATION_RECORDED` PASS or HOLD is accepted. A terminal
`OBSERVATION_FAILED` with a fixed reason identifies a specific repair.
`RECONCILIATION_REQUIRED` is an incident, not a pass; preserve its intent
journal and the new fixed diagnostic code without retrying. No outcome may
be inferred from v5's consumed intent journal.

## Starting evidence and exclusions

The v5 full observer journal is mode 0600, consumed at `INTENT_RECORDED` with
run ID `11c13cc4-d008-461c-9363-c9179545a08b`; never replay or alter it.
The staging database v5 chunked baseline separately passed. Supabase and
Vercel project identity GETs returned HTTP 200 after v5. The disabled v6
cleanup correction is `4709987`, independently reviewed, with focused
32/32, full suite 2,254/2,254, manifest and live-boundary checks passing.
No Vercel API Keychain item remains; the retained Preview bypass still
exists with no temporary `/usr/bin/security` allowance. The source launcher
and helper are disabled. The new exclusive journal must be
`../implementation-state/staging/tll-hosted-baseline-observation-v6.json`
with mode 0600 and must not exist before execution.

Only staging read-only requests are in scope. No database/provider/Vercel/
Edge write, deployment or alias change, protection change, Shopify action,
purchase, customer message, supplier order, production request, or public
release is allowed. Do not enable provider or Generation 22 work here.

## Disabled package, independent review and credential gate

Change only the full observer session's journal constant, manifest journal
field, its test assertion, generated manifest and this plan. Keep every
other target, endpoint, body limit, source pin and runtime guard fixed. Run
focused tests, full suite, generated manifest and live-boundary checks while
disabled. Independently review the disabled diff. Prepare the exact minimal
arming diff, verify it against the disabled commit, and obtain a second
independent GO before any external action.

At action time seek approval for a new one-hour Vercel Access Token scoped
to the exact `the-lifting-lab` project and temporary item-specific
`/usr/bin/security` access on the retained Preview bypass. Store the token
through Keychain Access's secure field, visually checking the item-name and
account labels because their accessibility order is reversed. Before closing
Vercel's one-time display, compare the copied token with Keychain's stored
value in memory; never expose it in logs, shell text or repository files.
The retained bypass remains intact. Confirm each selector's value is locally
readable and well-formed through the exact helper after arming. If any read
fails, disarm without claiming the journal or making a hosted request. Do
not create another token or mutate an ACL blindly after failure; diagnose
and revise the plan.

## One-shot execution and closeout

Commit the reviewed arming diff; invoke the dedicated launcher exactly once
with a 60-second deadline, exclusive journal claim before every hosted
request, and tracked fetch/body settlement. Do not run ordinary tests while
armed. If the journal cannot reach a terminal state, preserve intent and
the fixed diagnostic output. Do not replay. Reconcile from a separate
read-only source, disarm immediately, verify boundary/manifest, remove the
temporary bypass `/usr/bin/security` allowance and local API token item,
and leave remote one-hour tokens to expire naturally per user preference.
Record the exact result, incident cause/correction if needed, handover and
commit/push before moving to any downstream stage.

## Executed result and correction

The approved v6 window ran exactly once from armed commit `4275b9d` on
2026-09-22. Its mode-0600 journal is terminal `OBSERVATION_FAILED`, run ID
`a3286073-5169-4f27-b59b-01efd2c32d52`, reason
`vercel_environment_read_unavailable`, SHA-256
`faaf41b67a1d8f8ba1b9f42c744f3c77052c15f6819878b8c04e737af3706d54`.
It contains no observation hash. Never replay or modify this journal.
Source gates were disarmed in `5cfe7fe`; the temporary Keychain API token
item was deleted, the retained bypass's `/usr/bin/security` allowance was
removed, and the remote one-hour token was left to expire naturally.

Separate read-only inspection of the exact Vercel Preview environment URL
returned HTTP 200 and 16 branch-specific Preview entries, with no
`pagination` property. All 16 had the expected branch, Preview target and
recognized type. The parser incorrectly required `pagination.next === null`
for every response. The process error was treating test fixtures containing
only explicit terminal cursors as representative of the live API. The
contributing condition was that the preflight checked credential readability
and project identity but never checked the shape of the exact Preview
environment response. This caused a false local failure, with no provider,
database or deployment mutation; the terminal journal and separate HTTP 200
read are the recovery evidence. [Vercel's API guidance](https://vercel.com/docs/rest-api)
says pagination is returned when the total record count exceeds the request
limit. The disabled correction accepts an omitted pagination property only
when the returned count is strictly below the fixed request limit of 100;
a full page without a cursor and malformed/non-terminal cursors still fail
closed. The new fixture covers the real short-page shape, and a full-page
counterexample proves the ambiguity remains rejected. Focused 11/11 and
disabled full 2,254/2,254 tests pass. A successor preflight must inspect the
exact endpoint's status and structural envelope without recording names or
values; the source parser remains the final acceptance check. Other hosted
reads may have started concurrently, but v6 did not independently prove
their success and the shared abort may have interrupted them. They could
still reveal a separate issue in a successor window.

Before any successor window, obtain independent review of this correction,
rotate to a new exclusive journal path, verify the disabled manifest and
boundaries, then independently review the exact arming diff. A new credential
window requires fresh action-time authorization; do not reuse v6's consumed
journal or expiring token.
