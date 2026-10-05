# Private repository migration authority

The unapplied 005, 006, 007 and 008 migrations retain an explicit upgrade path for
their trusted installing operator. Each owner and executor/gateway role has one
durable membership to that operator with `ADMIN TRUE, INHERIT FALSE, SET FALSE`.
The private owners remain NOLOGIN. Browser roles and runtime executors receive no
owner membership.

PostgreSQL17 automatically grants this membership from its bootstrap superuser
when a non-superuser CREATEROLE operator creates a role directly. Initial DDL uses
a separate temporary self-granted owner membership. Before commit, the installer
revokes **only its own grant**, using `GRANTED BY` with the exact installer role.
The bootstrap membership remains. For a superuser installer there is no automatic
creator grant: installation instead resets its single explicit membership to the
same ADMIN-only flags. See the official [PostgreSQL17 role attribute rules](https://www.postgresql.org/docs/17/role-attributes.html).

At rest, the non-superuser installer cannot inherit or SET either scoped role.
For005/007/008, the migration grants only schema USAGE and the two aggregate
operator functions. A plain installer cannot read private data. A managed
installer that already effectively inherits PostgreSQL's `pg_read_all_data`
retains implicit SELECT on tables, columns and sequences, with no explicit data
ACL added. PostgreSQL's predefined role also supplies schema USAGE; it does not
itself bypass RLS. Supabase's managed administrator may separately have BYPASSRLS,
so these checks do not promise confidentiality from that trusted administrator.
The migrations neither grant nor revoke any managed platform role.

Both nonsuperuser installer profiles are denied direct table/column writes,
MAINTAIN, sequence USAGE/UPDATE, runtime repository calls, function/table DDL and
schema CREATE. Exact owner-only relation and column ACLs reject even an explicit
SELECT grant to an installer who already has read-all authority. Browser,
service and executor roles retain zero effective table/column/sequence access;
the platform-read exception is exclusive to the trusted installer. See the
[PostgreSQL17 predefined roles](https://www.postgresql.org/docs/17/predefined-roles.html)
and [Supabase managed administrator model](https://supabase.com/docs/guides/database/postgres/roles-superuser).

Cart006 differs: the
installer already owns its private schema/tables and control, while its six
functions belong to `tll_cart_owner`. That existing table authority is retained;
no effective cart function-owner or gateway use is added.

These restrictions prevent accidental use in the ordinary operator session.
They do **not** protect data from the trusted provisioning operator itself. ADMIN
lets that operator deliberately grant owner access, and CREATEROLE plus ADMIN
also lets it change non-superuser role properties. PostgreSQL documents this
distinction explicitly. An actor allowed to replace arbitrary SECURITY DEFINER
functions can also arrange access to their data; unrestricted future DDL and a
security boundary against that same actor are incompatible.

## Future versioned migrations

After the migration-specific project, source, disabled-state and recovery checks,
a reviewed migration may acquire SET-only authority in its own transaction:

```sql
BEGIN;
GRANT tll_customer_owner TO CURRENT_USER WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
SET LOCAL ROLE tll_customer_owner;
-- Exact reviewed ALTER/CREATE OR REPLACE/GRANT statements go here.
RESET ROLE;
REVOKE tll_customer_owner FROM CURRENT_USER GRANTED BY CURRENT_USER;
-- Assert the sole durable ADMIN-only edge and the complete resulting baseline.
COMMIT;
```

This example describes the non-superuser path, not an executable upgrade package.
The temporary edge must be removed before commit; SET LOCAL alone does not remove
a membership grant. The final checks must reject extra grantors/edges and any
effective INHERIT/SET/data authority beyond the repository's existing contract.
The owner can change005/007/008 objects in its own schema. For006 function body
replacement, the installer also grants CREATE on the required public/private
schemas temporarily and revokes it before commit. Do not grant owner authority
to the runtime executor or make an owner a runtime LOGIN.

An owner ADMIN grant cannot be recovered using CREATEROLE alone once every owner
administrator has been retired. Already installed versions with that state need
a separate authorized platform recovery or a previously established migration
capability. Replaying or editing their historical migration is not recovery.
These revisions apply only to the unapplied versions; they do not alter installed004.
The later010 bridge postflight applies the same installer-read distinction and
verifies exact ADMIN-only membership for all six broker/provisional/bridge roles,
including predecessor roles. A superuser exception applies only to the installer;
a protected browser/runtime role becoming superuser is rejected.
The underlying ownership and grant rules are described in [PostgreSQL17 GRANT](https://www.postgresql.org/docs/17/sql-grant.html).

## Local proof

The005/007/008 rollback migration regressions exercise canonical installation
under both a non-superuser and a superuser. Under the non-superuser they prove:
default ALTER/GRANT denial; exactly one bootstrap owner edge; an explicit second
SET-only self-edge; actual ALTER FUNCTION, CREATE OR REPLACE FUNCTION, ALTER TABLE
and GRANT; then exact removal of the self-edge and renewed denial. The existing
fixture and rows are restored by rollback.

The006 disposable acceptance proof exercises both installer branches, actual
public/private function replacement, retirement of temporary owner/schema
authority, and the existing RLS denial of owner UPDATE(enabled). Its separate
row/advisory-lock tests still prove disable and expiry behavior. No test creates
a committed LOGIN or password. These are local PostgreSQL proofs, not hosted
installation, hosted role discovery or activation acceptance.

## Managed administrator regression

Run `node tests/managed-admin-read-authority.mjs` against the four existing marked
local fixtures, or supply `customer`, `broker`, `provisional` or `bridge` to select
a bounded fixture. The harness refuses another session before each rollback
transaction, and verifies no role being reconstructed has another database's
dependencies. It does not create containers, databases, logins or credentials.

Each fixture proves the plain guard, full canonical reconstruction under a
nonsuperuser with temporary read-all and BYPASSRLS, effective SELECT-only access,
and rejection of applied explicit table/column/sequence SELECT grants, write-all,
MAINTAIN, protected-role read-all/superuser, sequence mutation grants and changed
owner delegation.010 additionally rejects predecessor SET/INHERIT and duplicate
membership edges. Mutation application is confirmed before guard rejection to
avoid counting invalid mutations as passing tests. Complete role, membership,
private catalog and data fingerprints must match after every rollback. This is
local compatibility/security evidence, not a managed-provider installation proof.

Future DDL delegation is exercised under both nonsuperuser profiles. PostgreSQL
can warn and grant nothing when a SELECT-capable operator attempts GRANT without
grant option; the proof checks the resulting ACL and executor privilege rather
than assuming every denied grant raises an exception.
