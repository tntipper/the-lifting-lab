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

For one same-scope, one-hour replacement, store the copied token with the
documented `-w <value>` argument through an in-memory subprocess call (never
in shell text, logs, a repository file, exception text or tool output). This
briefly exposes the token in the `security` child process's argv; that is a
residual risk of this CLI path, so keep the child bounded and do not start
other local observers during storage. Before dismissing Vercel's one-time
token dialog or clearing clipboard, read back the fixed Keychain item using
the helper's `/usr/bin/security find-generic-password -w` selector,
environment and bound, and compare it in memory with the newly copied token.
Record only equality pass/fail and length range. This is a local read while
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
