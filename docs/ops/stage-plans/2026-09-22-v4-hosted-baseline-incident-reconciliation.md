# V4 hosted-baseline incident reconciliation

## Outcome and boundaries

Establish the direct cause of the consumed v4 observation, correct only the
read-only database baseline contract, and verify the correction locally before
any successor is planned. Do not replay or alter the v4 journal. No production
query, purchase, customer message, deployment, provider mutation, credential
creation, or live observer invocation is in scope.

## Starting evidence and hypothesis

The terminal v4 journal at
`../implementation-state/staging/tll-hosted-baseline-observation.json` records
`OBSERVATION_FAILED` at 19:54:23.426–19:54:24.029 UTC, with the old generic
reason. Staging Supabase Postgres logs show an `ERROR` at
19:54:24.115 UTC for the exact fixed Management API query, with message
`Hosted baseline staging binding mismatch`, SQLSTATE `P0001`, application
`mgmt-api`, and user `supabase_read_only_user`. The SQL's first assertion
requires `current_user` and `session_user` to be `postgres`. That assertion is
incompatible with the `read_only: true` Management API request. No other
provider reads are inferred from this log.

Supabase's [read-only query reference](https://supabase.com/docs/reference/api/v1-read-only-query)
documents `supabase_read_only_user`. Its
[query endpoint reference](https://supabase.com/docs/reference/api/v1-run-a-query)
documents `read_only` as an optional request field and success status 201.

## Reconciliation plan

1. Verify the log event remains in the staging project and the old journal
   remains terminal and mode 0600. Record only the event's non-secret identity,
   timestamp, SQLSTATE and fixed error label; do not save raw query logs.
2. Establish whether `supabase_read_only_user` can inspect the exact catalogue
   fields required by the retirement check. Use at most one read-only,
   privilege-only SQL query in the staging SQL editor:
   `SELECT has_table_privilege('supabase_read_only_user', 'pg_catalog.pg_authid', 'SELECT') AS can_read_authid;`
   A denied or ambiguous result is a stop, not grounds to relax the check.
3. Revise the fixed SQL to assert the observed read-only role and preserve all
   retirement, migration, control and session checks. If the read-only role
   cannot prove password absence or another required condition, redesign the
   evidence source under a separate reviewed plan; do not substitute a weaker
   receipt or use a write-capable query.
4. Add an engine-backed regression for the intended execution identity and
   privileges, focused failure cases, and the existing secret-free journal
   compatibility. Regenerate the disabled manifest; run focused and repository
   checks. Independently review the exact diff before a future arming plan.

## Stop and recovery

Stop on project identity mismatch, unexpected query privilege, unknown SQL
shape, production reference, changed journal, or a requirement for broader
credentials. Leave all native gates false and the v4 journal untouched. Record
what remains unproved in `.agent/HANDOVER.md`; do not create a successor journal
or credential window until the incident-learning gate in
`docs/ops/project-stage-execution-protocol.md` is satisfied.

## Evidence and correction checkpoint

The single staging SQL-editor privilege query returned
`can_read_authid = true` for `supabase_read_only_user`. The v4 Postgres log's
`parsed.user_name` was also `supabase_read_only_user`. An offline factory
construction/disposal check with inert credentials and a fetch stub that throws
before network use passed, ruling out a static constructor mismatch for those
inputs; it does not prove the real credential's suitability.

The fixed database SQL is now versioned `v2`. It requires both session and
current identity to be `supabase_read_only_user`; the expected retired
operator grant remains pinned to `postgres` rather than the observing session.
The password, role, marker, migration, controls, edge and session assertions
are unchanged. The old `v1` journal stays immutable. This is a disabled local
correction until the focused and full checks, independent diff review, and an
exact read-only staging rehearsal prove the corrected query under the intended
execution identity. Do not represent the role-privilege boolean as proof that
the full query will pass.

## Incident learning record

| Required point | Evidence or control |
| --- | --- |
| Direct technical cause | The Management API ran the `read_only: true` query as `supabase_read_only_user`. The first v1 guard required both user identities to be `postgres`, and the exact staging log records that guard's error for the v4 request. |
| Process decision | The baseline combined a read-only Management request with an identity guard copied from privileged operator checks. The mocked endpoint tests returned a canned 201 receipt and did not execute the SQL under the Management API's read-only role. |
| Contributing conditions | The original journal reduced all observation errors to `observation_unavailable`; the query's expected operator was derived from `session_user`, although the observer is not the retired grant owner. |
| Resulting external state | The v4 journal is terminal `FAILED`. The fixed read-only SQL raised before returning its receipt. The log does not prove whether any later provider reads ran; there is no evidence of a database mutation, deployment, or provider change. |
| Recovery evidence | Launcher/helper/manifest gates remain false. The v4 journal is preserved and readable. A staging privilege-only query confirmed `supabase_read_only_user` can read `pg_authid`; a private SQL-editor snippet was automatically created for that check. |
| Preventive control | SQL v2 pins the read-only observer identity while pinning the retired operator edge to `postgres`. The session/composition now emit finite non-secret diagnostic codes. A successor must pass an exact read-only-role rehearsal before arming. |
| Verification | Focused tests, all 2,234 repository tests, typecheck, build, lint (0 errors), dependency audit (0 vulnerabilities), manifest and live-boundary checks pass. The exact hosted SQL has **not** yet been rehearsed successfully under the Management read-only path. |
| Remaining uncertainty | The v2 full SQL may reveal a later permission or state mismatch. The independent security review and hosted read-only rehearsal are pending; no successor window may be armed on the current evidence. |

## Exact v2 read-only rehearsal gate

The independent review found a blocking visibility flaw before this rehearsal:
`supabase_read_only_user` inherits broad table read access but need not hold
`pg_read_all_stats`. PostgreSQL can hide another user's
`pg_stat_activity.backend_type` while leaving `usename` visible. Therefore a
predicate requiring `backend_type='client backend'` can miss an active runtime
session. The fixed SQL now conservatively checks all visible rows by runtime
`usename` alone. An engine-backed restricted-role regression proves the
difference, and the independent reviewer accepted the correction.
The previously prepared `/tmp/tll-hosted-baseline-v2-rehearsal.sql` was stale
and removed before use. No rehearsal intent has been claimed and no hosted v2
query has been executed.

The SQL Editor impersonation route is rejected: `SET LOCAL SESSION
AUTHORIZATION supabase_read_only_user` requires a superuser starting identity,
and hosted Supabase `postgres` is not a superuser. Perform **one** staging-only
rehearsal through the existing Management API binding's `readDatabase` method.
It fixes `POST /v1/projects/qdmvngjwkcsilzmqksme/database/query`, the exact
exported `STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL`, and `read_only:true`.
It therefore uses the same read-only execution identity as v4. Use only the
existing `Supabase CLI` Keychain credential; do not access Vercel, the custom
provider, production, or customer data in this rehearsal.

First commit and verify a disabled one-shot launcher. Its new secret-free,
exclusive mode-0600 journal path is
`../implementation-state/staging/tll-hosted-baseline-v2-db-rehearsal.json`.
Review the exact arming diff independently. Verify target, query ID, SQL hash,
read-only request, credential selector, journal absence and staging project
binding before arming. Then invoke the launcher directly once within a
60-second deadline; no retry. Record only the one-row validated receipt's
status/hash or a fixed error class; never store raw rows, SQL text, tokens, or
unrestricted logs. If request settlement or cleanup is uncertain, leave the
journal at intent and reconcile from staging logs before any successor.

This rehearsal proves SQL and role compatibility in staging, but it is not a
second v4 hosted observer and does not establish provider, Vercel, readiness,
Edge or deployment state. A future full observer still requires its own
independent arming review, exclusive new journal, credential preflight and
one-shot window.
