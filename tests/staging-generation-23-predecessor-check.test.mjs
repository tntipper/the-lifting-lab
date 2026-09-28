import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { EXACT_MIGRATIONS } from '../scripts/staging-generation-21-retirement-preflight.mjs'
import {
  STAGING_GENERATION_23_PREDECESSOR_CHECK_ENABLED,
  buildStagingGeneration23PredecessorCheckSql,
  validateStagingGeneration23PredecessorCheck,
} from '../scripts/staging-generation-23-predecessor-check.mjs'

const predecessorExpiry = '2026-09-28T13:44:00.000Z'
const predecessorWindow = 'c216a47f-5445-4076-860c-451aa8d2931e'

async function armedFixture() {
  const scripts = new URL('../scripts/', import.meta.url)
  let source = await readFile(new URL('staging-generation-23-predecessor-check.mjs', scripts), 'utf8')
  source = source.replace('export const STAGING_GENERATION_23_PREDECESSOR_CHECK_ENABLED = false',
    'export const STAGING_GENERATION_23_PREDECESSOR_CHECK_ENABLED = true')
    .replaceAll("from './", `from '${scripts.href}`)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

test('the Gen23 predecessor check is disconnected by default', () => {
  assert.equal(STAGING_GENERATION_23_PREDECESSOR_CHECK_ENABLED, false)
  assert.throws(() => buildStagingGeneration23PredecessorCheckSql(), /unavailable/)
  assert.throws(() => validateStagingGeneration23PredecessorCheck([]), /unavailable/)
})

test('the fixed read-only transaction requires the exact retired Gen23 v13 state', async () => {
  const { buildStagingGeneration23PredecessorCheckSql: build } = await armedFixture()
  const sql = build()
  assert.match(sql, /^BEGIN READ ONLY;\nSET LOCAL lock_timeout='5s';/)
  assert.match(sql, /current_database\(\)<>'postgres'/)
  assert.match(sql, /operator_project_ref='qdmvngjwkcsilzmqksme'/)
  assert.match(sql, /operator_project_ref='wrhgscovsgsudtedbljr'/)
  for (const [version, hash] of EXACT_MIGRATIONS) assert.ok(sql.includes(`('${version}','${hash}')`))
  assert.ok(sql.includes(predecessorExpiry))
  assert.ok(sql.includes(predecessorWindow))
  assert.match(sql, /"generation":23/)
  assert.match(sql, /"state":"retired"/)
  assert.match(sql, /rolpassword IS NOT NULL/)
  assert.match(sql, /rolvaliduntil='infinity'::timestamptz/)
  for (const attribute of ['rolsuper', 'rolcreatedb', 'rolcreaterole', 'rolreplication', 'rolbypassrls'])
    assert.ok(sql.includes(`NOT ${attribute}`), `missing inert-role check for ${attribute}`)
  assert.match(sql, /FROM pg_shdepend d JOIN pg_roles g ON g\.oid=d\.refobjid/)
  assert.match(sql, /d\.refclassid='pg_authid'::regclass AND d\.deptype='o'/)
  assert.match(sql, /runtime ownership drift/)
  assert.match(sql, /runtime sessions remain/)
  assert.match(sql, /private authority drift/)
  assert.match(sql, /controls changed/)
  assert.doesNotMatch(sql, /REVOKE |ALTER ROLE|UPDATE tll_|DELETE FROM/)
})

test('only the exact retired Gen23 v13 receipt is accepted', async () => {
  const { validateStagingGeneration23PredecessorCheck: validate } = await armedFixture()
  const value = { status: 'PASS_RETIRED', queryId: 'tll-staging-generation-23-predecessor-check/v1',
    projectRef: 'qdmvngjwkcsilzmqksme', generation: 23, windowId: predecessorWindow,
    expiresAt: predecessorExpiry, controlsEnabled: false, runtimeCount: 5, runtimeSessions: 0 }
  const rows = [{ tll_generation_23_predecessor_check: value }]
  assert.equal(validate(rows).status, 'PASS_RETIRED')
  for (const changed of [{ ...value, runtimeSessions: 1 }, { ...value, generation: 22 },
    { ...value, projectRef: 'wrhgscovsgsudtedbljr' }, { ...value, extra: true }]) {
    assert.throws(() => validate([{ tll_generation_23_predecessor_check: changed }]), /unavailable/)
  }
  assert.throws(() => validate([...rows, ...rows]), /unavailable/)
})
