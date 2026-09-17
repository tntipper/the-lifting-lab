# Inventory maintenance authority: forward repair 009

Migration `202609170009_inventory_maintenance_authority.sql` repairs the future
maintenance and worker-delegation path for the already installed, disabled 004
inventory repository. It is a new migration. Historical 004 remains byte-for-byte
unchanged with SHA256
`030ccb26228aca6665147eced447815f8a290abd74b8003b0f32bfb2a05e5a76`.
The source is prepared and tested locally; it has not been applied to hosted staging.

004 retired every administrator of `tll_inventory_owner` and
`tll_inventory_worker`. On PostgreSQL17, CREATEROLE alone cannot regain ADMIN or
SET on those roles. The installing operator also cannot ALTER or CREATE OR REPLACE
their functions. However, 004 kept the private schema and all three tables owned
by its installer. PostgreSQL's ordinary schema-owner permission permits precise
DROP FUNCTION, while table ownership permits rebinding its triggers and policies.
The [PostgreSQL17 DROP implementation](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/commands/dropcmds.c)
explicitly accepts namespace ownership for these removals. This forward repair
uses that existing authority; it does not impersonate a platform administrator or
require a platform superuser to recover the retired role identities.

## Result and preserved state

The new roles are exactly `tll_inventory_owner_v2` and `tll_inventory_worker_v2`.
They remain NOLOGIN, NOINHERIT, NOSUPERUSER, NOBYPASSRLS, NOCREATEROLE, NOCREATEDB
and NOREPLICATION. Each has exactly one durable ADMIN-only edge to the trusted
installing operator, with INHERIT FALSE and SET FALSE and a bootstrap superuser grantor. The operator creates these
roles directly and retains PostgreSQL17's bootstrap-granted edge. Initial setup
uses a separate SET-only self-grant, removed explicitly with `GRANTED BY` before
commit. The owner has no schema CREATE authority at rest.

The function owner receives the same existing limited table permissions and RLS
policies: SELECT on control, SELECT/INSERT/UPDATE on operations, and SELECT/INSERT
on events. The worker receives schema USAGE and exactly the same six entry points.
The operator keeps ownership of the schema/tables and its existing operator-only
cancellation entry point. It gains no automatic inherited/SET use of either new
role. ADMIN is deliberate trusted maintenance authority, not a security boundary
against that trusted operator: it can explicitly delegate owner/worker access in
a later reviewed transaction. See [PostgreSQL17 role attributes](https://www.postgresql.org/docs/17/role-attributes.html).

The migration preserves:

- The schema, three tables, indexes, constraints and their OIDs; all control,
  operation and event rows, including uncertain-send evidence; existing history.
- All twelve function signatures and body bytes copied exactly from canonical004,
  their volatility/security/search-path settings, and the two immutable triggers'
  behavior. Function and trigger OIDs change because they are replaced.
- Disabled singleton control, no public RPCs, and no LOGIN, password, worker
  activation, Shopify request or runtime provisioning.

It moves the four policies to the new function owner, removes only the two known
triggers, and drops the twelve explicit function signatures together using
`RESTRICT`. An unexpected dependent view or other object aborts the transaction.
There is no CASCADE, table reconstruction, row copying, sequence reset or history
rewrite. Canonical004 has no sequence in this schema; an unexpected sequence is
rejected. Retired role names remain NOLOGIN and inert; their ordinary schema/table
ACLs are revoked after their function ownership and policy references disappear.
No old role is dropped, altered or made delegable.

## Admission and verification

A trusted nonsuperuser CREATEROLE installer must enter with
`current_user=session_user` and own the existing schema/tables. The migration
locks all three tables in ACCESS EXCLUSIVE mode with a five-second lock timeout;
this closes write boundaries during function/trigger replacement. The statement
timeout is sixty seconds. A changed or missing disabled control row aborts.

Preflight checks require the exact 004 role flags and retired membership state;
all twelve canonical function body hashes, signatures, argument names, return
and language types, settings and ACLs; schema/table/column ACLs including grantors,
unrelated roles and grant options; RLS/policies; triggers; column/default,
constraint and index fingerprints. The structural fingerprints describe the
reviewed PostgreSQL17 catalog representation and deliberately fail on a differing
representation until reviewed. Effective browser/worker authority is checked as
well as explicit grants. Unexpected historical-role dependencies, including those
in another database, abort. New role-name collisions and replays abort.

If the private staging source ledger exists, its004 entry must contain the exact
historical source hash. This source migration never changes that ledger. The
future reviewed bound package must journal009 separately and preserve004's
existing receipt. The same object/ACL/function checks run after replacement;
additional postflight requires inert old roles and precisely the two new
ADMIN-only edges, with no effective owner/worker SET or inheritance for the
installer. Creation-time function ACLs from unrelated default privileges are
removed before ownership transfer and the postflight requires the exact result.

## Local regression

Run from the repository root, only while holding the existing inventory fixture:

```sh
node --experimental-strip-types tests/inventory-ledger/maintenance-regression.mjs
node --experimental-strip-types --test tests/inventory-ledger.test.mjs
```

The first command accepts the approved existing container by default. On Linux,
`TLL_INVENTORY_TEST_CONTAINER=tll-inventory-ci-<positive integer>` also selects the
fresh fixture created by the existing inventory CI runner. It refuses other
names, CI names on macOS, a remote Docker endpoint, a different image/database,
missing exact marker, active fixture sessions, or existing new/proof roles. It
uses the existing `tll-stage0-postgres` / `tll_inventory_ledger` fixture with marker
`synthetic-inventory-ledger-v1`, disabled control and its preserved12 operations
and43 events. It neither resets this database nor replays004. Two existing
synthetic worker memberships are removed only inside the outer rollback to model
004's exact retired hosted state. A minimal rollback-only source ledger tests
preservation and a mismatched hash; this does not simulate the full hosted baseline.

Negative probes cover changed functions/signatures/settings, ACLs/grant options,
role flags/memberships, control, RLS, triggers, columns/constraints/indexes,
ownership/collisions and dependencies. Every rejected run is followed by an exact
catalog/data snapshot comparison. The successful repair runs as the existing
nonsuperuser installer and verifies table/index OIDs, every historical row, source
ledger, future ALTER/CREATE OR REPLACE through a temporary SET edge, worker
membership delegation, narrow privileges, all six worker APIs and the
operator-only cancellation path. It covers disabled sends, idempotence, target
exclusion, fencing, fresh completion, uncertain holds, expired-lease recovery and
both immutable-evidence triggers. These transaction-local API checks do not claim
a new multiconnection concurrency or commit-acknowledgement test: canonical004's
function statements are unchanged, and those separate regressions remain intact.

The author run on PostgreSQL17.11 passed68 actual-database checks, including24
changed-state/dependency probes, two rejected installer contexts, and exact
bootstrap-grantor assertions before and after future maintenance. The existing
15 inventory protocol tests and the focused regression-file lint also passed.

The existing Linux `tests/inventory-ledger/run-local.sh` appends this rollback-only
regression after its original acceptance and worker tests. Before running009 it
requires the exact marker, singleton control and12/43 counts, then closes the
synthetic acceptance window by disabling control. Unexpected state aborts; it is
never reset to satisfy009. This reset-capable runner was not executed on macOS.
The existing approved local fixture was used directly for the009 author proof.

All test writes, temporary grants and new roles are rolled back. Final comparison
requires the original fixture catalog and row bytes, disabled state and no new
roles/history. No hosted service is contacted.

## Ordered release and later maintenance

The hosted target still requires a separately reviewed, hash-pinned private
package after005–008. That package must preserve their current baseline, require
exact staging/project/operator and recovery prerequisites, and journal009 in the
same transaction. The old full11 postflight describes the original004 state and
must not be silently weakened or relabelled as a009 postflight. A missing apply
acknowledgement requires read-only reconciliation, never replay.

Later function upgrades can temporarily self-grant owner SET, temporarily grant
schema CREATE when replacement requires it, perform reviewed DDL, remove CREATE,
and revoke only the installer's own membership grant. They must finish with one
bootstrap ADMIN-only edge per role and the full reviewed postflight. Delegating
a runtime worker LOGIN, credentials and activation remains separate work. Do not
make the function owner a runtime identity.
