# Staging account activation recovery

This package is only for a failed or uncertain staging activation after migrations 012–016 are installed. It is not a rollback, does not delete database evidence, and must never run against production. Generate the exact reviewed artifact and require a clean check before opening a recovery operator window:

```sh
node scripts/staging-account-activation-recovery.mjs
node scripts/staging-account-activation-recovery.mjs --check
```

The generated [recovery SQL](../../config/staging-account-activation-recovery.sql) is bound to the staging project reference `qdmvngjwkcsilzmqksme`; production `wrhgscovsgsudtedbljr` is excluded in the artifact header and the operator must independently confirm the target before executing it. Capture the database authority/data fingerprint and deployment/provider state before and after the transaction without including secret values.

The main transaction must run as the reviewed non-superuser staging operator. It first verifies that the operator has only the existing `ADMIN TRUE`, `INHERIT FALSE`, `SET FALSE` edges to the owner/executor roles, and no direct private-write authority. It temporarily grants itself `SET` authority to exactly one private owner at a time, writes only that owner’s store, then removes its own grantor edge and proves the original ADMIN-only graph is restored. Cart is the narrow exception: its reviewed design makes the recorded installation operator the cart-table owner and deliberately prevents the `tll_cart_owner` role from updating the control row through RLS; recovery proves that recorded ownership before touching cart custody.

The transaction disables customer, cart, broker, provisional and bridge controls before holding or cancelling executable work. It keeps rows and operation journals for diagnosis, while redacting revocable encrypted material according to the existing reviewed hold paths. It then sets the five fresh purpose runtime roles to `NOLOGIN`, clears their passwords and removes their expected execution memberships. The reviewed operator retains only its pre-existing `ADMIN TRUE`, `INHERIT FALSE`, `SET FALSE` management edge to each retired runtime role, so it cannot use that role for data or execution. It neither drops the roles nor changes managed Supabase roles, `auth.users`, Shopify, Vercel, Edge deployment, provider configuration, checkout or email.

After a committed retirement, run the separate [post-commit zero-session proof](../../config/staging-account-activation-recovery-postcommit.sql) in a fresh operator session. It grants no observer or signal capability. It requires an already-present `pg_read_all_stats` membership, waits for at most 20 seconds for any existing runtime sessions to drain naturally, then fails closed if it cannot observe zero sessions. It never terminates a backend. If the required observer authority is absent or a session remains, preserve evidence and keep every control/flag disabled; do not add `pg_signal_backend` or a global signal privilege as a workaround.

Any preflight, lock, drain, role-retirement or postflight failure rolls back the full transaction. Do not edit an assertion or retry a partially understood recovery. Leave controls and feature flags disabled, retire any application/Edge secrets through their host consoles, and preserve the failed journal for diagnosis.
