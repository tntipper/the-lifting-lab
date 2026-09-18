# Customer final reconciliation coordinator

`lib/identity/customer-final-reconciliation.ts` is the default-disabled coordinator between the existing isolated Supabase PKCE exchange and the durable reconciliation repository. It adds no route, cookie, SDK storage, credential, provider setting or activation.

The browser-facing input is limited to the exact transaction UUID, browser-binding hash and final staging callback URL containing exactly one UUID `code`. The coordinator does not parse identity from either value. It asks the repository to claim the callback under a fresh operation UUID. Only the repository may return the retained PKCE verifier, its challenge, reserved broker subject, mode, original migration UUID, Shopify proof receipt, fence and generation.

The claim is copied into an immutable allowlisted projection before the first provider await. Sign-in invokes `exchangeSignIn`; migration invokes `exchangeMigration` with the repository-retained original UUID and never falls back to sign-in. The existing final-exchange adapter remains responsible for the one POST, exact-token `/user` read and authoritative Supabase identity checks.

A successful exchange remains private provisional material. The coordinator validates and snapshots the minimum session, proof and broker identity, then asks the repository to commit the exact claim fence/generation, callback digest, Shopify proof receipt and final result. It never calls `release` before an acknowledged commit. A second exact repository read must return the same transaction, callback digest, UUID, identity row, reserved subject and session before anything is returned to the caller.

Any invalid callback, rejected/malformed claim, uncertain exchange, rejected or lost finish acknowledgement, substituted subject/owner, failed exact release read, or quarantine error returns only `Customer final reconciliation unavailable`. After a callback has a safe durable binding, failure attempts a new one-use hold operation. A lost finish acknowledgement is never treated as success, even when the database may have committed; the eventual repository must make the exact fenced hold revoke release authority while preserving evidence for operator recovery.

The repository atomically joins the admitted provisional intent, consumed broker flow/reservation, matching Shopify proof receipt and final authoritative Supabase UUID. It keeps PKCE and session material encrypted, supports one-use callback claim/finish/release/hold, promotes `provisional` or `pending_migration` only on exact evidence, and exposes no email-based merge path. The protected Next callback and SSR cookie writer remain unmounted until the next reviewed implementation unit.

Run `node --experimental-strip-types --test tests/customer-final-reconciliation.test.mjs` plus typecheck and focused lint. The tests cover sign-in and migration sequencing, callback/claim rejection, exchange uncertainty, rejected and lost finish acknowledgements, substituted subject/UUID, exact release mismatch and disabled composition. They use synthetic ports and make no network or database connection.

## Encrypted repository adapter

`lib/identity/customer-final-reconciliation-repository.ts` defines the concrete Node-to-SQL contract expected from migration 013. It calls only `tll_bridge_private.final_repository(op, payload)` in an explicit bounded transaction and reports success only after `COMMIT` acknowledgement. A failed or lost acknowledgement is redacted, rolled back where possible, and the leased client is discarded without retry.

The adapter uses two distinct vaults. It opens the existing provisional PKCE envelope only under its original transaction/config/browser/intent/generation AAD. It seals the final callback code under transaction/browser/callback-digest AAD and seals the provisional Supabase session under transaction/callback/authoritative-user/identity/reserved-subject/generation AAD. SQL receives envelopes and minimal verified metadata; it never receives an auth code, PKCE verifier, access token or refresh token in plaintext. Release requires an exact callback binding and opens only the session envelope returned by an acknowledged reconciled row.

Migration `202609180013_customer_final_reconciliation.sql` supplies the default-disabled `tll_bridge_private.final_repository` boundary. It adds encrypted finalization and operation custody, extends Shopify subject reservations with an `auth.users`-bound owner, and gives the bridge executor only the final repository function. Owner-held helper functions provide the bridge owner with the minimum cross-store snapshots and promotion operation; it receives no direct customer, provisional or broker table authority or membership in those owner roles. Both the final `user_id` and broker `bound_user_id` reference `auth.users(id)`.

The final exchange authenticates the exact access token against Supabase `/user` and validates the returned identity row before finish. `identity_id` is retained as evidence from that authenticated response; migration 013 does not write to or require DDL authority over `auth.identities`.

`tests/customer-final-reconciliation-repository.test.mjs` verifies encrypted wire projection, transaction acknowledgement, disabled behavior, uncertainty without retry and substituted response rejection using synthetic pool/vault boundaries. `tests/final-reconciliation/acceptance.test.mjs` exercises the canonical migration in actual PostgreSQL 17, including sign-in, migration UUID continuity, one-use claim, concurrency, proof mismatch, lost claim/finish acknowledgements, fenced hold, control disablement and ciphertext denial. `tests/final-reconciliation/migration-regression.mjs` independently verifies ownership, RLS, exact ACLs, foreign keys and nine rollback-only authority mutations. The local fixture is isolated and marked; migrations 012 and 013 remain uninstalled on hosted staging.

Run:

```sh
# Once per isolated local PostgreSQL 17 fixture only:
node --experimental-strip-types tests/final-reconciliation/setup.mjs --create-once
node --experimental-strip-types --test tests/final-reconciliation/acceptance.test.mjs
node --experimental-strip-types tests/final-reconciliation/migration-regression.mjs
node --experimental-strip-types --test tests/customer-final-reconciliation-repository.test.mjs tests/customer-final-reconciliation.test.mjs tests/supabase-final-exchange.test.mjs
```
