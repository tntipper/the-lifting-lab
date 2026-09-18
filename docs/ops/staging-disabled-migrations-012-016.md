# Disabled staging migration installer (012--016)

This package prepares one atomic, staging-only installation of the reviewed
customer proof, final reconciliation, cart transition, account operations and
logout migrations. It is deliberately disabled in source. It must not be used
against production, and it has no command-line SQL, URL, header or retry input.

The canonical source migrations are pinned by SHA-256 in
`scripts/staging-disabled-migrations-012-016.prepare.mjs`. The generator emits
the reviewed transaction and manifest under `config/`. It removes only each
source file's outer transaction wrapper, retains its complete body, and adds
one outer transaction, exact staging/predecessor/control/empty-destination and
ADMIN-only operator guards, ledger recording, and a compact postflight receipt.

Before any later reviewed activation, regenerate and inspect the artifacts:

```sh
node scripts/staging-disabled-migrations-012-016.prepare.mjs
node --test tests/staging-disabled-migrations-012-016.test.mjs
```

An authorised installer run must use a clean environment, a separate review of
the generated diff and manifest, and exactly one Management API request. The
transport is currently disabled by both independent flags:

```text
scripts/staging-disabled-migrations-012-016.mjs: NATIVE_ACCESS_APPROVED = false
scripts/staging-disabled-migrations-012-016-keychain.py: APPROVED_NATIVE_READ = False
```

When those flags are false, execution returns `NATIVE_ACCESS_DISABLED` before a
Keychain read or network request. Do not change either flag or run an enabled
transport as part of ordinary development. A future hosted change requires the
lead's fresh approval, a security review, a PASS staging read-only preflight,
and a recovery path tested for the same installed revision.

The generator reads both flags and writes their shared value into the manifest.
The launcher verifies both source hashes, both flags and the manifest before it
can read Keychain. A temporary reviewed enablement changes both flags together,
regenerates the artifacts, and runs `--check`; restoring the disabled state
uses the same sequence. Committed source must remain false.

`PRE_DISPATCH_UNAVAILABLE` proves no token was obtained and no request was
sent. `UNCERTAIN_POST_DISPATCH` means a request may have reached Supabase but a
validated receipt was not obtained; it must never be retried. Stop and use the
separate read-only reconciliation and recovery path. Hosted execution remains
held until the Management API's expected success status and result envelope are
confirmed by a successful reviewed read-only exchange. The HTTP 201 and
single-row envelope here are fail-closed assumptions, not that evidence.

The only acceptable successful output is a redacted receipt containing the
install identifier, staging project reference, PASS status, five migrations,
disabled controls, present objects and transaction SHA-256. It must not include
tokens, raw query results, customer data, role details or passwords.
