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
node tests/staging-disabled-migrations-012-016-actual.mjs
```

The final command is the PostgreSQL 17 acceptance fixture. It creates one
fresh Docker container per scenario, with `--network none`, and removes each
container before it starts the next. It builds a canonical 002--011 baseline
under a literal non-superuser `postgres` operator, executes the generated
012--016 SQL byte-for-byte, then proves the five-migration commit, disabled
controls, 15-entry ledger, empty destinations, RLS and ADMIN-only owner edges.
Fresh fixtures also prove late-failure rollback, a mutated predecessor ledger,
enabled and missing controls, pre-existing destination refusal, and replay
refusal. It only permits a local Unix Docker daemon and has no hosted endpoint,
credential or native access path.

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

## Dispatch journal and reconciliation

Before the transport can issue its one Management API request, it writes a
durable nonsecret intent journal at:

```text
../implementation-state/staging/tll-disabled-migrations-012-016-dispatch.json
```

The intent is created as the journal file with an exclusive on-disk claim
(`O_CREAT|O_EXCL`), then fsynced with a directory fsync before the request
boundary. A concurrent process therefore loses before it can issue a request;
it cannot overwrite an existing journal. It binds the fixed staging target,
install ID, transaction SHA-256, reviewed migration and transport source-pin
SHA-256 values, timestamp and per-run ID. Its initial state is
`INTENT_RECORDED`. It never contains SQL, access tokens, provider responses,
role details, customer data or passwords.

On an exact validated PASS receipt, the owner takes an exclusive transition
lock, rereads and verifies the exact claimed run ID and `INTENT_RECORDED`
state, then atomically replaces the record with `RECEIPT_VALIDATED` and only a
SHA-256 of the redacted receipt. A foreign or stale process cannot perform this
transition. Any timeout, malformed receipt, lost acknowledgement, or failure
after dispatch changes it to `RECONCILIATION_REQUIRED`; if that final write
cannot finish, the prior durable `INTENT_RECORDED` still prevents another
request. There is no retry path.

Do not run the installer when a journal for this install is
`INTENT_RECORDED` or `RECONCILIATION_REQUIRED`. Stop and use a separately
reviewed, read-only reconciliation process to establish whether the transaction
committed. That process may mark a terminal reconciled state only after its
own evidence is retained; it is intentionally not implemented by this
installer and it must not issue a migration request. Existing completed or
reconciled journal records also require review before any future package can be
considered.

`PRE_DISPATCH_UNAVAILABLE` proves no token was obtained and no request was
sent, including when the durable intent cannot be recorded.
`UNCERTAIN_POST_DISPATCH` means a request may have reached Supabase but a
validated receipt was not obtained; it must never be retried. Stop and use the
separate read-only reconciliation and recovery path. Hosted execution remains
held until the Management API's expected success status and result envelope are
confirmed by a successful reviewed read-only exchange. The HTTP 201 and
single-row envelope here are fail-closed assumptions, not that evidence.

The only acceptable successful output is a redacted receipt containing the
install identifier, staging project reference, PASS status, five migrations,
disabled controls, present objects and transaction SHA-256. It must not include
tokens, raw query results, customer data, role details or passwords.
