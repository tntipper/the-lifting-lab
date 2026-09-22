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
