# Stage 0 database integrity release

Status: implemented and verified against a disposable local PostgreSQL 17 baseline; **not applied to production**. This change addresses F01, F02 and the database portion of F28. The share-card route is a separate implementation. No production records or private audit snapshots belong in this repository.

## Behaviour and compatibility

- Profiles remain owner-readable. The existing profile API may update username/display name, and the avatar API may select a standard or already-unlocked avatar. Database triggers enforce those rules even through direct Data API calls. Balances, spend, referral attribution, profile age and email cannot be changed by a client role. Custom photo selections require the custom slot unlock and the caller's avatar-folder URL path. This path check does not verify the URL's host or object existence; canonical storage-origin validation remains a separate upload/API concern.
- Existing review insertion with `{user_id, product_id, rating, body}` remains supported. Only rating/body are editable; ownership, product identity, status and age are protected. Editing visible content restarts its pending period; flagged content stays flagged. Existing approved/pending-after-24-hours visibility is preserved. Formal moderation-policy redesign remains a later plan item.
- Direct writes to products, nutrients, reward ledger, share claims, unlocks and the updatable public-profile view are removed. Obsolete client write policies are removed from authoritative tables; legitimate product suggestions still use the existing `supplement_submissions` inbox. No product is automatically approved.
- The migration revokes **both table and column ACLs** for PUBLIC, anon and authenticated, including historical duplicate policies. Postconditions inspect effective privileges, including inherited grants. An unexpected inherited permission aborts the entire transaction; inspect the role hierarchy rather than weakening the check.
- `award_points(text,text)` retains its signature, existing owner and SECURITY DEFINER execution. It serializes by user/action, canonicalizes once/daily references and checks the allowance inside the lock. UTC calendar dates are explicit. Shares require a real active product UUID, account age and cooldown. Referrer awards and avatar purchases retain their existing functions. Unknown/disabled/nonpositive reward rules return zero.
- An accepted share reward still represents an **honour-system claim**, not verification that an external network published a post. Stack-card IDs do not introduce additional rewardable share identities. Rewards must remain non-monetary until the broader review is complete.
- The migration does not alter object owners, service/admin ACLs, existing records, reward totals or consent records. New trigger functions are SECURITY INVOKER and skip table-owner/BYPASSRLS maintenance paths; caller-controlled JWT fields are not used to decide administrative privilege.

## Release procedure

1. Use the approved isolated Supabase staging project. Capture a private schema-only backup, current function definitions/owners, table and column ACLs, role memberships and policies. Run `tests/database/preflight.sql`; compare the actual staging schema and deployment revision to the expected prerequisite scripts. The inventory deliberately contains no customer row data.
2. Apply `supabase/migrations/202609150001_integrity_boundaries.sql` through the versioned migration workflow as the existing authorised migration role. It is transactional, uses a five-second lock timeout, and notifies PostgREST to reload its schema. A timeout or postcondition failure rolls back all changes; investigate before retrying.
3. Run the synthetic SQL cases and real two-session races described below. Confirm existing function owners and grants are unchanged, client-only policy duplicates are gone, service paths still work, and no forbidden effective write privilege remains.
4. Run the same assertions through **local/staging PostgREST** with genuine signed anon/authenticated/service JWTs. Send ordinary profile and review payloads exactly as the current app sends them, including `Prefer: return=minimal`; test anonymous/other-user reads, spoofed fields, `.select()` if used, and avatar selection. Confirm Supabase Auth signup still creates a profile, real Storage avatar upload/select works, public review aggregates remain correct, and referral/unlock RPCs work.
5. Only after staging/API compatibility passes, apply the same immutable migration to the live project using the separately approved release procedure and private backup. Run non-destructive smoke checks with the owned test account. Do not invent production exploit records or rewrite historic balances as part of this migration.

If applying from a different role than the original function owner, verify that role can replace the existing SECURITY DEFINER function without changing its ownership. The migration intentionally does not use `ALTER OWNER` or `FORCE ROW LEVEL SECURITY`.

## Local executable tests

The test harness is restricted to the local Docker container `tll-stage0-postgres`, database `tll_stage0` (or the empty `tll_stage0_replay` database for bootstrap replay). It contains only explicitly named `example.invalid` users and synthetic products. `bootstrap.sql` refuses a populated schema or a different database. The original scripts are loaded as compatibility fixtures, including duplicate policies, broad table grants and explicit column grants. Do not run bootstrap against a hosted Supabase project.

On an empty fixture database, copy these repository directories to the matching container paths: `scripts` to `/tmp/tll-integrity/scripts`, `tests/database` to `/tmp/tll-integrity/tests/database`, and `supabase/migrations` to `/tmp/tll-integrity/supabase/migrations`. Then run:

```sh
docker exec tll-stage0-postgres psql -U postgres -d tll_stage0 -v ON_ERROR_STOP=1 -f /tmp/tll-integrity/tests/database/bootstrap.sql
docker exec tll-stage0-postgres psql -U postgres -d tll_stage0 -v ON_ERROR_STOP=1 -f /tmp/tll-integrity/supabase/migrations/202609150001_integrity_boundaries.sql
docker exec tll-stage0-postgres psql -U postgres -d tll_stage0 -v ON_ERROR_STOP=1 -f /tmp/tll-integrity/tests/database/acceptance.sql
python3 tests/database/concurrency.py
```

Repeat the migration and acceptance file to test idempotency. `acceptance.sql` rolls back all its fixtures. The concurrency runner uses two independent PostgreSQL sessions, deliberately holds the first transaction open after its award and starts the second while the first holds the allowance lock. It verifies one ledger row, the matching profile balance and one share-claim row; then clears only its synthetic user's test action rows.

Verified locally on PostgreSQL 17.11 with 54 SQL acceptance assertions and a clean bootstrap replay:

- Forbidden profile fields, view updates, unowned avatars and direct product/nutrient/reward writes rejected.
- Normal profile edits, moderated submission, review insertion/award and authorised service writes passed.
- Review status/time forgery, ownership spoofing and product retargeting rejected; edited approval resets to pending and flagged edits remain flagged.
- Referral and avatar-unlock SECURITY DEFINER functions passed; function owner retained.
- Daily-login competing references returned `[5, 0]` with one five-point ledger credit.
- Same-product concurrent share attempts returned `[25, 0]` with one ledger/claim pair.
- Migration repeated successfully without widening effective grants.

These are PostgreSQL-level tests. They do not on their own close the Supabase/PostgREST, Auth, Storage or production release acceptance gates.

## Recovery and rollback

A failed migration transaction leaves the previous state intact. After a committed release, prefer a small forward compatibility fix or roll back the app to the last compatible version. Existing supported request shapes are unchanged.

**Do not restore broad UPDATE/INSERT grants, old permissive publication policies or the vulnerable `award_points` function to recover a UI error.** Keep database integrity protection active and withhold the affected editing/reward feature while repairing its supported path. If a catastrophic recovery requires restoring a backup, restore into an isolated replacement first, reapply the integrity migration and rerun acceptance before routing clients to it. Preserve newer legitimate records and ledger entries; no blanket database rollback or balance recomputation is authorised here.

## Technical references

PostgreSQL privileges are cumulative across table, column, role and PUBLIC grants; revoking a column privilege does not override a table grant. [PostgreSQL GRANT](https://www.postgresql.org/docs/current/sql-grant.html)

Permissive RLS policies combine, so historic client policies must be evaluated together. [PostgreSQL CREATE POLICY](https://www.postgresql.org/docs/current/sql-createpolicy.html), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)

Replacing a function preserves its ownership, while SECURITY DEFINER functions need safe name resolution and explicit execution privileges. [PostgreSQL CREATE FUNCTION](https://www.postgresql.org/docs/current/sql-createfunction.html)
