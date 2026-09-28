# Full hosted observer v5, one staging read-only window

## Outcome and acceptance

The exact staging database retirement baseline passed at 20:43 UTC in the
mode-0600 v5 database journal. This is a prerequisite, not a substitute for
the full hosted observation. Capture one current, secret-free observation of
the fixed Supabase provider/secret-name/Edge surfaces, Vercel project/Preview
environment/deployment identity, and immutable readiness route. The result
may legitimately be HOLD if a configured field or manifest proof is absent;
the goal is a truthful, validated receipt, not a forced PASS.

## Scope and exclusions

Use the existing reviewed full observer binding and session. Update only its
journal identity to a fresh exclusive mode-0600 path
`../implementation-state/staging/tll-hosted-baseline-observation-v5.json`,
generated manifest/path assertions, and the live-boundary check so the full
observer's enabled gate cannot pass ordinary tests. Preserve the consumed
`tll-hosted-baseline-observation.json` v4 journal and all database journals.
No database/provider/Vercel/Edge write, deployment, alias change, protection
change, Shopify operation, customer message, purchase, supplier order,
production request, or Generation 22 action is in scope.

## Preconditions and credential window

1. Verify Git branch/HEAD, disabled gates, generated manifest, no new journal,
   and the validated database PASS. Inspect current source/target pins and run
   focused plus full checks while disabled.
2. Independently review the disabled source and the later exact arming diff.
3. The retained Preview bypass Keychain selector exists; its local value and
   format still require a bounded private preflight. Remote validity can only
   be established inside the journalled run. The Vercel API selector
   is absent. Prepare the exact reviewed run before asking for action-time
   approval to create a new one-hour Vercel Access Token scoped to the pinned
   project/team and save it in only its fixed local Keychain selector. Do not
   create a second bypass or modify protection settings. Revoke/expire the API
   credential according to the user's current preference; do not disclose it.
4. Check the Supabase CLI, API token, and bypass values locally in a
   secret-suppressed preflight. If any is missing or malformed, do not claim
   the journal. Do not make a hosted request to test validity before claim.

## One-shot execution and reconciliation

Commit the reviewed minimal arming diff, invoke the dedicated launcher once,
and do not run ordinary tests while armed. The journal must be claimed before
any hosted request. Deadline is 60 seconds, with tracked fetch/body cleanup
before terminal evidence. Any failure, timeout, unexpected state, or uncertain
settlement stops the window; do not replay. Reconcile from the journal and a
separate read-only source, disarm, verify live-boundary/manifest, then commit
and push the outcome. If the full result is HOLD, plan downstream repair from
its exact reason codes rather than enabling provider/surfaces immediately.

## Credential setup correction before invocation

The first v5 Vercel token was created with the intended one-hour project
scope, but `/usr/bin/security add-generic-password ... -w` with piped input
stored a zero-length password. macOS `security help add-generic-password`
states that a final bare `-w` prompts interactively; the non-interactive
pipeline did not supply the value. The token modal was closed and clipboard
cleared before this was discovered, so that remote token cannot be recovered.
It must expire naturally under the user's token preference; the empty local
item may be replaced only after a new token is created. No hosted request or
v5 journal claim occurred. The gates were returned to disabled, and the live
boundary check passed. This was a credential-provisioning failure, not an
observer attempt.

For one same-scope, one-hour replacement, enter the token through the
Keychain Access secure-password field, avoiding the `security -w <value>`
process-argument exposure. Check the Keychain Item Name and Account Name
visually before saving; the accessibility tree lists those fields out of
visual order. Set only `/usr/bin/security` on the item's application allowlist,
while keeping “Confirm before allowing access.” Before dismissing Vercel's
one-time token dialog or clearing its clipboard, read back the fixed Keychain
item and compare it in memory with the newly copied token. Record only
equality pass/fail and length range. This is a local read while
the source gates remain disabled. After the reviewed arming diff is applied,
run the exact helper for all three selectors with output suppressed before
invoking the observer. If any helper read fails, disarm immediately without
claiming the journal or making a hosted request. The retained Preview bypass's
first helper read timed out, while a subsequent direct `security` read
completed in eight seconds; confirm it through the exact helper again after
its access prompt has settled. If the disabled storage read-back fails, do
not arm; if an armed helper preflight fails, disarm immediately.
Do not enlarge the helper deadline or Keychain ACL without a separately
reviewed cause and correction.

The replacement `tll-hosted-baseline-v5b-2026-09-22` was created with the
same one-hour `the-lifting-lab` scope. A first Keychain Access entry put the
name and account in reversed fields, observed by exact-selector lookup and
the item details; that erroneous local item was deleted before use. A second
entry was checked visually, saved under the fixed selector, and restricted to
`/usr/bin/security` with confirmation retained. A secret-suppressed CLI
lookup returned a 60-character token shape. Keychain Access then displayed
the stored value locally, and the browser/Keychain values compared equal in
memory before the one-time Vercel dialog was closed. Both displays were
closed or hidden, and the browser clipboard was cleared. No hosted request,
observer journal claim, or source arming occurred during provisioning.

The retained Preview bypass still existed but its access-control application
list was empty, explaining the repeated bounded CLI timeouts. The user
approved adding only `/usr/bin/security` to that item's list for this run.
Keychain Access then showed that sole allowed application and retained
“Confirm before allowing access.” With both item detail windows closed, a
local-only, secret-suppressed read completed for Supabase, Vercel API and the
Preview bypass in 0.03, 7.13 and 4.31 seconds respectively. After the run,
remove `/usr/bin/security` from the bypass item as approved and keep the
underlying bypass intact. This local preflight does not establish remote
credential validity.

## One-shot result and successor gate

The reviewed arming diff was committed as `44e8414` and invoked once at
21:02:30 UTC. The launcher returned `RECONCILIATION_REQUIRED` in 3.2 seconds.
The exclusive v5 journal remains `INTENT_RECORDED` (run ID
`11c13cc4-d008-461c-9363-c9179545a08b`, mode 0600, SHA-256
`3eaec61fdc96cabd9c2123700800fb267d2f4cfc37101d3175e6d82e2a659ecd`).
No terminal observation, reason code or observation hash exists. Preserve this
journal and never replay it. Both source gates were immediately disarmed and
the boundary check passed. A separate read-only process confirmed HTTP 200
and exact staging project identity from Supabase and exact project identity
from Vercel. The observer sources are GET/read-only and make no provider or
deployment mutation; the initiating failed read remains unknown.

Independent forensic review reproduced a narrower local code defect with an
inert native Web Stream: when a stream errors, both read and later cancel
may reject even though all operations settle. The tracker currently treats
every cancel rejection as uncertain cleanup, leaving the intent journal
open and masking the already-classified first read failure. The reproduction
does not establish that this was v5's initiating provider error. A successor
must distinguish a proven terminal errored stream from unresolved cleanup,
retain the fixed secret-free first read reason when cleanup truly remains
uncertain, and test both paths plus sibling abort/settlement before any new
journal or credential window. No generic retry is authorized.

After the run, the temporary `/usr/bin/security` allowance was removed from
the retained bypass; Keychain Access showed an empty list with “Confirm
before allowing access” still selected. The underlying bypass remains.
The local API token item was deleted. The two one-hour Vercel tokens from this
window were left to expire naturally as directed. No production change,
purchase, customer message or deployment occurred.
