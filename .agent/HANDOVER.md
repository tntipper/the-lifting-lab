# Agent handover — The Lifting Lab integration

Updated: 2026-09-22, after one failed v2 staging database rehearsal. Verify this against Git and hosted evidence before acting.

## Objective and boundaries

Continue the staged integration of `theliftinglab.co.uk` and Shopify under `docs/ops/project-stage-execution-protocol.md`. The full release criteria remain in `docs/ops/integration-release-candidate.md`. No purchase, production change, supplier order, or customer message occurred here. Public launch, full hosted observer, provider repair, deployment creation, and Generation 22 remain held.

## Repository and external state

- Repo `implementation-integration`, branch `codex/tll-integration`. Verify `pwd`, branch, HEAD, upstream, and status. Key commits: `5af5e31` prior diagnostic base; `fbd6024` disabled v2 rehearsal package; `031777e` one-line arming; `1ee0738` disarm. Subsequent closeout may advance HEAD.
- Both the full observer `HOSTED_BASELINE_LIVE_ENABLED` and DB rehearsal `NATIVE_DB_REHEARSAL_ENABLED` are false. Keychain helper `APPROVED_NATIVE_READ=False`; full observer manifest `nativeAccessApproved:false`. `npm run check:live-boundaries` passes after disarm.
- Preserve untracked `implementation-state/`, `.agent/gen11-journal-watch.mjs`, and iCloud ` 2` duplicate files. Never stage them by wildcard. The full observer v4 journal is `../implementation-state/staging/tll-hosted-baseline-observation.json`, terminal failed. The distinct v2 DB rehearsal journal is `../implementation-state/staging/tll-hosted-baseline-v2-db-rehearsal.json`, terminal failed. Both are consumed; never delete or replay.
- Vercel production/deployment protection was not changed. The retained non-expiring Preview bypass remains at the user's request; the previous API token was left to expire. This turn used only the existing Supabase CLI Keychain selector, not Vercel.

## Completed this turn

1. Independent review found that `pg_stat_activity.backend_type` is hidden for other users without `pg_read_all_stats`, which could let a read-only check miss a live runtime session. SQL v2 now checks `usename` alone, with a real PostgreSQL restricted-role regression. The reviewer accepted the correction.
2. The planned SQL Editor `SET LOCAL SESSION AUTHORIZATION` route was rejected because hosted `postgres` is not superuser. The rehearsal instead used the exact existing Management API `readDatabase` binding: staging `qdmvngjwkcsilzmqksme`, fixed v2 SQL, `read_only:true`. The disabled launcher and failure tests were independently reviewed and committed. Full disabled suite passed (2,238 tests before the final two added failure/boundary tests); focused tests and boundary check passed after those additions.
3. Exact one-line arming diff was independently reviewed GO. Query ID `tll-staging-hosted-baseline-database/v2`, SHA-256 `1a53d5f9881d0ab791dc4741548957df154b2fdac2a98007fdec32e3bdad1c1e`, journal absent, and Keychain selector present. Launcher invoked exactly once at 20:25 UTC. It returned `FAILED` / `database_read_unavailable`, not a validated baseline. Journal mode 0600 and terminal `OBSERVATION_FAILED`, run ID `490c1ed0-4c12-442c-a31e-392febec6d4f`, 20:25:11.887–20:25:13.013 UTC. Gate was immediately disarmed and committed.
4. Separate read-only GET of the staging Management project returned HTTP 200 using the same Keychain selector; credential/project access works. Postgres log explorer at the checkpoint showed only the earlier v4 `Hosted baseline staging binding mismatch` error, with no v2 event visible. The v2 wrapper intentionally discarded HTTP/error detail, so direct failure cause is still unknown. It may be API, SQL, or receipt validation. **Do not infer or retry.**

## Next coherent unit

Recheck staging Postgres logs for 20:25:11–20:25:13 UTC after ingestion. Reconcile the v2 failure without replaying its query. If logs remain silent, prepare a disabled, bounded diagnostic path that reports only safe HTTP status class, response shape, and SQLSTATE/error category; never raw body, SQL, or credentials. Plan it first in `docs/ops/stage-plans/2026-09-22-v4-hosted-baseline-incident-reconciliation.md`, test it, independently review disabled code and the exact future arming diff, and use a **new** journal/identifier for any successor. Do not proceed to the full hosted observer until the exact read-only v2 query passes with a validated receipt and the failure root cause/preventive control are documented.

The broader remaining launch work is tracked in `docs/ops/integration-release-candidate.md`: hosted account/cart/orders/logout, qualified inventory and order workers, supplier cost/VAT basis, retail pricing and flash sales, affiliate attribution/discount/refund controls, backup/restore, consent/email, scientific evidence review, theme publication, and production release checks.
