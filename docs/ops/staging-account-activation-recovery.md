# Staging account activation recovery

This package is only for a failed or uncertain staging activation after migrations 012–016 are installed. It is not a rollback, does not delete database evidence, and must never run against production. Generate the exact reviewed artifact and require a clean check before opening a recovery operator window:

```sh
node scripts/staging-account-activation-recovery.mjs
node scripts/staging-account-activation-recovery.mjs --check
```

The generated [recovery SQL](../../config/staging-account-activation-recovery.sql) is bound to the staging project reference `qdmvngjwkcsilzmqksme`; production `wrhgscovsgsudtedbljr` is excluded in the artifact header and the operator must independently confirm the target before executing it. Capture the database authority/data fingerprint and deployment/provider state before and after the transaction without including secret values.

The transaction disables customer, cart, broker, provisional and bridge controls before holding or cancelling executable work. It keeps rows and operation journals for diagnosis, while redacting revocable encrypted material according to the existing reviewed hold paths. It then sets the five fresh purpose runtime roles to `NOLOGIN`, clears their passwords and removes every membership edge involving those roles. It neither drops the roles nor changes managed Supabase roles, `auth.users`, Shopify, Vercel, Edge deployment, provider configuration, checkout or email.

Any preflight, lock, drain, role-retirement or postflight failure rolls back the full transaction. Do not edit an assertion or retry a partially understood recovery. Leave controls and feature flags disabled, retire any application/Edge secrets through their host consoles, and preserve the failed journal for diagnosis.
