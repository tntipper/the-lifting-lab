import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  PROJECT_REF, PRODUCTION_PROJECT_REF, STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_ENABLED,
  STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID, STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL,
  STAGING_ACCOUNT_HOSTED_BASELINE_MANAGEMENT_ENDPOINT, GENERATION_21_RETIRED_EXPIRES_AT, createStagingAccountHostedBaselineDatabase,
  validateStagingAccountHostedBaselineDatabaseReceipt,
} from '../scripts/staging-account-hosted-baseline-database.mjs'

const signal = () => new AbortController().signal
const receipt = Object.freeze({
  queryId: STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID, projectRef: PROJECT_REF, generation: 21,
  windowId: 'a5511645-77af-4fc9-9e4c-f5c8a474d5fa', status: 'PASS_RETIRED', migrations: 15, runtimeRoles: 5,
  controlsEnabled: 0, passwordsConfigured: 0, validUntilInfinity: 5, operatorEdges: 5, executionEdges: 0, runtimeSessions: 0,
})

test('database baseline has one immutable staging-only read-only query and literal secret-free receipt', () => {
  assert.equal(STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_ENABLED, false)
  assert.equal(PROJECT_REF, 'qdmvngjwkcsilzmqksme'); assert.equal(PRODUCTION_PROJECT_REF, 'wrhgscovsgsudtedbljr')
  assert.deepEqual(STAGING_ACCOUNT_HOSTED_BASELINE_MANAGEMENT_ENDPOINT, { hostname: 'api.supabase.com', method: 'POST', path: `/v1/projects/${PROJECT_REF}/database/query` })
  assert.ok(STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL.startsWith('BEGIN READ ONLY;'))
  assert.equal((STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL.match(/BEGIN READ ONLY;/g) ?? []).length, 1)
  assert.equal((STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL.match(/COMMIT;/g) ?? []).length, 1)
  assert.equal(STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID, 'tll-staging-hosted-baseline-database/v2')
  assert.match(STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL, /current_user<>'supabase_read_only_user' OR session_user<>'supabase_read_only_user' OR current_user<>session_user/)
  assert.match(STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL, /operator_name name:='postgres'/)
  assert.doesNotMatch(STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL, /operator_name name:=session_user/)
  assert.equal(GENERATION_21_RETIRED_EXPIRES_AT, '2026-09-22T14:00:00.000Z')
  for (const term of ['202609150002_public_submission_gateway', '202609180016_customer_account_logout', 'NOLOGIN', 'rolpassword', 'operatorEdges', 'pg_stat_activity', "'retired'", GENERATION_21_RETIRED_EXPIRES_AT]) assert.match(STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL, new RegExp(term))
  assert.match(STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL, /parsed IS DISTINCT FROM jsonb_build_object/)
  assert.doesNotMatch(STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL, /jsonb_object_length/)
  assert.doesNotMatch(STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL, /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|PASSWORD)\b/i)
  assert.doesNotMatch(STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL, /secret|token|authorization|client_secret/i)
})

test('when the existing local PostgreSQL fixture is running, PostgreSQL accepts the exact JSONB marker comparison', t => {
  let running = ''
  try { running = execFileSync('docker', ['inspect', '--format', '{{.State.Running}}', 'tll-stage0-postgres'], { encoding: 'utf8' }).trim() } catch { t.skip('local PostgreSQL fixture is unavailable'); return }
  if (running !== 'true') { t.skip('local PostgreSQL fixture is not running'); return }
  const exactMarker = JSON.stringify({ expiresAt: GENERATION_21_RETIRED_EXPIRES_AT, generation: 21, projectRef: PROJECT_REF, state: 'retired', windowId: receipt.windowId }).replaceAll("'", "''")
  const sql = `SELECT ('${exactMarker}'::jsonb IS DISTINCT FROM jsonb_build_object('expiresAt','${GENERATION_21_RETIRED_EXPIRES_AT}','generation',21,'projectRef','${PROJECT_REF}','state','retired','windowId','${receipt.windowId}'))::text, ('${exactMarker}'::jsonb || '{\"extra\":true}'::jsonb IS DISTINCT FROM jsonb_build_object('expiresAt','${GENERATION_21_RETIRED_EXPIRES_AT}','generation',21,'projectRef','${PROJECT_REF}','state','retired','windowId','${receipt.windowId}'))::text;`
  const output = execFileSync('docker', ['exec', '-i', 'tll-stage0-postgres', 'psql', '-XqAt', '-U', 'postgres', '-d', 'postgres'], { input: sql, encoding: 'utf8' }).trim()
  assert.equal(output, 'false|true')
})

test('only the exact compact retirement receipt is accepted and it is projected without raw SQL', () => {
  const result = validateStagingAccountHostedBaselineDatabaseReceipt([{ tll_staging_hosted_baseline_database: receipt }])
  assert.deepEqual(result.counts, { migrations: 15, controlsEnabled: 0, runtimeRoles: 5, runtimeSessions: 0, executionEdges: 0, operatorEdges: 5 })
  assert.equal(result.status, 'PASS'); assert.match(result.receiptHash, /^[a-f0-9]{64}$/)
  for (const changed of [{ runtimeSessions: 1 }, { controlsEnabled: 1 }, { passwordsConfigured: 1 }, { generation: 20 }, { unexpected: true }]) {
    assert.throws(() => validateStagingAccountHostedBaselineDatabaseReceipt([{ tll_staging_hosted_baseline_database: { ...receipt, ...changed } }]))
  }
  assert.throws(() => validateStagingAccountHostedBaselineDatabaseReceipt([{ wrong: receipt }]))
})

test('the injected port receives only the closed endpoint and immutable transaction', async () => {
  const seen = []
  const observer = createStagingAccountHostedBaselineDatabase({ postManagementQuery: async input => {
    seen.push(input); return [{ tll_staging_hosted_baseline_database: receipt }]
  } })
  const result = await observer.observe({ signal: signal() })
  assert.equal(seen.length, 1); assert.equal(seen[0].endpoint, STAGING_ACCOUNT_HOSTED_BASELINE_MANAGEMENT_ENDPOINT)
  assert.equal(seen[0].query, STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL); assert.equal(result.status, 'PASS')
  assert.throws(() => createStagingAccountHostedBaselineDatabase({ postManagementQuery: null }))
  await assert.rejects(() => observer.observe({ signal: new AbortController().signal, sql: 'select 1', projectRef: PRODUCTION_PROJECT_REF }))
})

test('the module has no ambient launcher, credentials or generic SQL export', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../scripts/staging-account-hosted-baseline-database.mjs', import.meta.url), 'utf8'))
  assert.doesNotMatch(source, /child_process|process\.argv|https\.request|fetch\(|Keychain|process\.env/)
  assert.doesNotMatch(source, /export (?:async )?function (?:post|query|execute)/)
})
