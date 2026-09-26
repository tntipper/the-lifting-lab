# Staging database baseline v3 diagnostic gate

## Purpose and acceptance

The v2 rehearsal journal is terminal `database_read_unavailable` but did not
retain enough bounded metadata to identify the cause. The staging Postgres
log explorer still shows no v2 error near 20:25 UTC. Prepare a new read-only,
one-shot diagnostic that either validates the exact hosted baseline receipt or
records one finite, secret-free failure classification. A successful result
must preserve the exact v2 SQL, `read_only:true`, staging project ref, one
request, and 60-second deadline. It must not silently weaken the retirement
assertions to gain a PASS.

## Scope and exclusions

Repository files may change only to add the v3 diagnostic session/launcher,
bounded response classification, focused tests, this stage record, and
generated activation manifest pins if the documented generator proves they
changed solely because of the reviewed source additions. The first full suite
found `config/staging-account-activation-manifest.json` stale; inspect the
generator's exact diff before accepting its output. The
external system is Supabase staging `qdmvngjwkcsilzmqksme` through the
Management query API. Production `wrhgscovsgsudtedbljr`, Vercel, Shopify,
provider configuration, customer messages, purchases, and database writes are
excluded. The existing v2 and v4 journals are immutable and must not be
replayed or removed. Use a fresh v3 journal path.

## Starting evidence and assumptions

- Git `98d9cf1` on `codex/tll-integration` was disabled at the previous
  checkpoint; verify HEAD and status before changes.
- The v2 query ID is `tll-staging-hosted-baseline-database/v2`, SHA-256
  `1a53d5f9881d0ab791dc4741548957df154b2fdac2a98007fdec32e3bdad1c1e`.
- The existing Supabase CLI Keychain selector could GET the staging project
  (HTTP 200); that does not prove permission for the query endpoint.
- Supabase documents `POST /v1/projects/{ref}/database/query` with
  `read_only` and HTTP 201 on success. The exact hosted response shape and
  failure category are unknown; do not assume them.

## Execution and stop rules

1. Implement a disabled diagnostic that uses the exact query and reports only
   finite codes for transport, HTTP status class, response shape, known
   SQLSTATE, and receipt validation. Do not retain raw response bodies,
   unrestricted messages, SQL, or credentials in the journal. Bound response
   bytes and cancel/settle all network operations before terminal evidence.
2. Verify focused success/failure/abort tests, live-boundary checks and
   appropriate repository checks with every gate disabled. Independently
   review the disabled package and exact arming diff.
3. Check fresh staging logs, target, query hash, Keychain selector, and absence
   of the new journal. Commit a one-line arming diff. Invoke the direct live
   launcher **once**. No ordinary tests while armed.
4. Disarm immediately, reconcile from the new journal and independent staging
   logs, then document the direct cause and preventive control. A failed or
   uncertain result blocks a successor until it produces new evidence and a
   reviewed correction. Never retry a consumed journal or repeat an unchanged
   hypothesis. Full observer and downstream stages remain held until an exact
   baseline PASS is independently verified.

## Disabled implementation checkpoint

The independent review found and verified corrections for two potential blind
spots: an aborted request's late response body is now canceled before terminal
evidence, and known HTTP status is retained even when the body is non-JSON or
has rejected framing. Focused regression tests cover cancellation success and
failure, non-JSON 401/403/502, a real exclusive journal, and exact receipt
validation. The full disabled suite passes: 2,248 tests.

The activation manifest was stale because the prior work unit added a
`staging-live-boundary.test.mjs` assertion without regenerating its source pin.
The generator changed exactly that test's SHA-256 pin; `--check` and the full
suite pass after refresh. This is a local generated-artifact correction, not a
new hosted or production action.

## Single v3 outcome and successor hold

Disabled package `0c95a98` was independently reviewed. The exact one-line
arming diff `6f04158` received independent GO and was invoked once. The
mode-0600 v3 journal at the planned path is terminal HOLD, run ID
`fa2735fd-4b32-4d08-a194-1ee35e7186e2`, 20:38:57.394–20:38:57.880 UTC,
with `HTTP_201` and `RESPONSE_FRAMING_UNAVAILABLE`. This proves the Management
endpoint returned its documented success status, but the local parser
rejected a response header before validating the body. It does **not** prove
the receipt or SQL retirement assertions passed. The v3 journal is consumed;
never replay it. The launcher gate was immediately restored to false and the
live-boundary check passes.

The diagnostic grouped three framing conditions: content encoding, transfer
encoding, and content length. That grouping still does not identify the exact
header. A successor may report only which of those finite conditions occurred,
using a fresh journal, then correct the smallest unsafe assumption. Do not
weaken all framing checks merely to get a PASS. The original v2 failure and
v3 HOLD share a likely local response-validation path, but v3 does not prove
which header caused v2 because the original wrapper suppressed detail.
