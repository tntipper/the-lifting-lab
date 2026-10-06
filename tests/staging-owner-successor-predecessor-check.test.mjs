import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { EXACT_MIGRATIONS } from '../scripts/staging-generation-21-retirement-preflight.mjs'
import {
  OWNER_SUCCESSOR_PREDECESSOR_CHECK_ENABLED,
  buildOwnerSuccessorPredecessorCheckSql,
  validateOwnerSuccessorPredecessorCheck,
} from '../scripts/staging-owner-successor-predecessor-check.mjs'

const predecessorExpiry = '2026-09-28T21:47:00.000Z'
const predecessorWindow = 'd5180b08-79ee-43e8-96d4-4f73621fecbf'

async function armedFixture() {
  const scripts = new URL('../scripts/', import.meta.url)
  let source = await readFile(new URL('staging-owner-successor-predecessor-check.mjs', scripts), 'utf8')
  source = source.replace('export const OWNER_SUCCESSOR_PREDECESSOR_CHECK_ENABLED = false',
    'export const OWNER_SUCCESSOR_PREDECESSOR_CHECK_ENABLED = true')
    .replaceAll("from './", `from '${scripts.href}`)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

test('the owner successor predecessor check is disconnected by default', () => {
  assert.equal(OWNER_SUCCESSOR_PREDECESSOR_CHECK_ENABLED, false)
  assert.throws(() => buildOwnerSuccessorPredecessorCheckSql(), /unavailable/)
  assert.throws(() => validateOwnerSuccessorPredecessorCheck([]), /unavailable/)
})

test('the fixed read-only transaction requires the exact retired owner successor v18 state', async () => {
  const { buildOwnerSuccessorPredecessorCheckSql: build } = await armedFixture()
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

test('only the exact retired owner successor v18 receipt is accepted', async () => {
  const { validateOwnerSuccessorPredecessorCheck: validate } = await armedFixture()
  const value = { status: 'PASS_RETIRED', queryId: 'tll-owner-successor-predecessor-check/v1',
    projectRef: 'qdmvngjwkcsilzmqksme', generation: 23, windowId: predecessorWindow,
    expiresAt: predecessorExpiry, controlsEnabled: false, runtimeCount: 5, runtimeSessions: 0 }
  const rows = [{ tll_owner_successor_predecessor_check: value }]
  assert.equal(validate(rows).status, 'PASS_RETIRED')
  for (const changed of [{ ...value, runtimeSessions: 1 }, { ...value, generation: 22 },
    { ...value, projectRef: 'wrhgscovsgsudtedbljr' }, { ...value, extra: true },
    { ...value, windowId: '759bc8ed-5ecd-475c-8a4c-e35fcf628a73', expiresAt: '2026-09-28T21:05:00.000Z' },
    { ...value, windowId: 'unknown' }, { ...value, windowId: 'cd4130c8-a8b8-462b-bdbe-5c3e6250a02d' },
    { ...value, expiresAt: '2026-09-28T21:48:00.000Z' }, { ...value, status: 'ACTIVE' },
    { ...value, controlsEnabled: true }, { ...value, runtimeCount: 4 },
    { ...value, queryId: 'tll-staging-generation-23-predecessor-check/v1' }]) {
    assert.throws(() => validate([{ tll_owner_successor_predecessor_check: changed }]), /unavailable/)
  }
  assert.throws(() => validate([...rows, ...rows]), /unavailable/)
  assert.throws(() => validate([{ tll_generation_23_predecessor_check: value }]), /unavailable/)
})

test('every SQL retirement guard is unchanged after exact identity and receipt-name substitution', async () => {
  const scripts = new URL('../scripts/', import.meta.url)
  const source = (await readFile(new URL('staging-generation-23-predecessor-check.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_23_PREDECESSOR_CHECK_ENABLED = false',
      'export const STAGING_GENERATION_23_PREDECESSOR_CHECK_ENABLED = true')
    .replaceAll("from './", `from '${scripts.href}`)
  const legacy = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
  const successor = await armedFixture()
  const expected = legacy.buildStagingGeneration23PredecessorCheckSql()
    .replaceAll('759bc8ed-5ecd-475c-8a4c-e35fcf628a73', predecessorWindow)
    .replaceAll('2026-09-28T21:05:00.000Z', predecessorExpiry)
    .replaceAll('tll-staging-generation-23-predecessor-check/v1', 'tll-owner-successor-predecessor-check/v1')
    .replaceAll('tll_generation_23_predecessor_check', 'tll_owner_successor_predecessor_check')
  assert.equal(successor.buildOwnerSuccessorPredecessorCheckSql(), expected)
  assert.equal(legacy.PREDECESSOR_WINDOW_ID, '759bc8ed-5ecd-475c-8a4c-e35fcf628a73')
  assert.notEqual(legacy.PREDECESSOR_WINDOW_ID, successor.PREDECESSOR_WINDOW_ID)
})
