# Generation 21 provider-readback incident and correction

## Outcome

Generation 21 created and verified five isolated staging credentials while all
customer, cart, broker and application controls remained disabled. The later
provider readback found an existing enabled Supabase custom OAuth provider. Its
stored broker secret predated the newly generated value and its required
`subject` scope was blank. Activation stopped before any control was enabled.

The pinned recovery completed with `PASS_RETIRED`: five runtime roles are
NOLOGIN, carry no password, use `VALID UNTIL infinity`, retain only the five
reviewed ADMIN-only operator edges, have zero execution edges and zero runtime
sessions, and all five singleton controls are disabled. The Generation 21
branch-scoped Vercel configuration entries and Supabase Edge secret entries
were removed and their names read back absent. No enabled deployment was
created during the window. The pre-existing custom OAuth provider and its older
retained secret remain unchanged and disabled at the application/Edge boundary.
Production, purchases, checkout, customer email and live merchandise were not
involved.

## Why the mistake happened

The pre-arm browser inspection treated an incompletely loaded Providers page as
proof that no custom provider existed. The activation package also staged a new
broker client secret without an atomic path to rotate the same value into the
existing Supabase provider. The runbook described provider readback, but the
repository had no executable provider configuration or secret-consistency gate.
That allowed the credential window to open before all hosted prerequisites were
actionable.

## Preventive controls

No later credential generation may be armed until all of these checks exist and
pass while credentials are retired:

1. Read the fully loaded provider list and the provider update form, recording
   identifier, enabled state, endpoints, callback, scope, PKCE and email policy.
2. Use one reviewed broker-secret rotation operation that updates Vercel
   Preview, Supabase Edge and the existing Supabase provider with the same
   in-memory value, then destroys the local value.
3. Read back every nonsecret provider setting and prove the generated secret
   names exist without reading their values.
4. Provide reviewed, fail-closed automation for database-control enablement,
   Edge enablement, Vercel private/public flag sequencing, deployment identity
   and recovery.
5. Require an independent review of those tools and a dry-run acceptance pack
   before a bounded runtime credential window is opened.

The disabled-state activation tooling and tests are now complete and
independently reviewed. The corrective contracts are pinned in
`config/staging-account-activation-manifest.json`. Generation 22 still cannot
be proposed until exact native adapters are implemented and reviewed, a fresh
read-only hosted baseline proves the frozen provider and absent secret-name
preconditions, and an arming diff is reviewed separately from execution.
