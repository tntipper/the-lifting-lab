# Staging-only reconciliation for an uncertain migration dispatch

`tll-staging-readonly-reconcile/v1` is separate from the initial preflight and
from the disabled 012--016 installer. It exists solely to observe the fixed
staging state after a recorded `UNCERTAIN_POST_DISPATCH`; it cannot install a
migration, enable a control, invoke an application function, recover a role or
take caller-supplied SQL, endpoint, header or command-line input.

The generated query is exactly one `SELECT` statement with one semicolon. It
reads the fixed staging environment and migration ledger, five direct control
tables, PostgreSQL role/catalog/session facts and catalog object absence. The
receipt contains only booleans and bounded counts. It never returns role
comments, SQL, credentials, customer rows, tokens or raw error content.

Both source flags remain disabled:

```text
scripts/staging-readonly-reconcile.mjs: NATIVE_ACCESS_APPROVED = false
scripts/staging-readonly-reconcile-keychain.py: APPROVED_NATIVE_READ = False
```

When disabled, the command exits before Keychain or HTTPS. A reviewed temporary
enablement must change both flags, regenerate and inspect
`config/staging-readonly-reconcile-manifest.json`, use a clean environment and
make at most one HTTPS Management API POST. Redirects, proxy/debug/TLS
overrides, retries and oversized responses are refused.

Before dispatch, the process must create the exclusive nonsecret observation
claim at `../implementation-state/staging/tll-staging-readonly-reconcile-observation.json`.
An existing claim blocks another attempt. A validated response is stored only
as an observation hash and changed top-level keys. A terminal failure stores
only `PRE_DISPATCH_UNAVAILABLE` or a coarse post-dispatch diagnostic
(status class, content-type bucket, size bucket and allowlisted 400 category).
Raw API responses and tokens are never persisted. A post-dispatch terminal
outcome is not retry authority.

The observation accepts valid changed values and reports which top-level
baselines differ. It does not assert that migrations 012--016 committed; a
human reviewer must compare the sanitized observation with the reviewed
installer and recovery evidence before any further hosted action.
