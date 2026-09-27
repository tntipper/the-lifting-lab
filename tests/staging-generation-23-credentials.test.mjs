import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildStagingGeneration23CredentialSql, PREDECESSOR, WINDOW_ID,
  STAGING_GENERATION_23_CREDENTIALS_ENABLED } from '../scripts/staging-generation-23-credentials.mjs'
import { PASSWORD_PURPOSES } from '../scripts/staging-generation-22-material.mjs'
import { IDENTITIES } from '../scripts/staging-generation-21-credentials.mjs'
import { PREDECESSOR_WINDOW_ID } from '../scripts/staging-generation-23-predecessor-check.mjs'
import { PREDECESSOR_EXPIRES_AT } from '../scripts/staging-generation-23-predecessor-check.mjs'
import { EXACT_MIGRATIONS } from '../scripts/staging-generation-21-retirement-preflight.mjs'

const nowMs = Date.parse('2026-09-26T10:00:00.000Z')
const expiresAt = '2026-09-26T10:50:00.000Z'
const verifiers = () => Object.fromEntries(PASSWORD_PURPOSES.map((purpose, index) => {
  const value = Buffer.from(`fixture-${purpose}-${index}`).toString('base64')
  return [purpose, `SCRAM-SHA-256$4096:${value}$${value}:${value}`]
}))

async function armedFixture() {
  const path = new URL('../scripts/staging-generation-23-credentials.mjs', import.meta.url)
  const source = await readFile(path, 'utf8')
  assert.equal(source.split('export const STAGING_GENERATION_23_CREDENTIALS_ENABLED = false').length, 2)
  assert.equal(source.split("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'").length, 2)
  const armed = source
    .replace('export const STAGING_GENERATION_23_CREDENTIALS_ENABLED = false', 'export const STAGING_GENERATION_23_CREDENTIALS_ENABLED = true')
    .replace("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'", `export const ACTIVE_WINDOW_EXPIRES_AT = '${expiresAt}'`)
    .replaceAll("from './", `from '${new URL('../scripts/', import.meta.url).href}`)
  return import(`data:text/javascript;base64,${Buffer.from(armed).toString('base64')}`)
}

test('Gen23 SQL is disconnected and pins the retired Gen23 v4 predecessor', async () => {
  assert.equal(STAGING_GENERATION_23_CREDENTIALS_ENABLED, false)
  assert.throws(() => buildStagingGeneration23CredentialSql({ verifiers: verifiers(), expiresAt, nowMs }), /unavailable/)
  assert.equal(PREDECESSOR.generation, 23)
  assert.equal(PREDECESSOR.windowId, PREDECESSOR_WINDOW_ID)
  assert.equal(PREDECESSOR.expiresAt, PREDECESSOR_EXPIRES_AT)
  assert.notEqual(WINDOW_ID, PREDECESSOR_WINDOW_ID)
  const { buildStagingGeneration23CredentialSql: buildArmed } = await armedFixture()
  const sql = buildArmed({ verifiers: verifiers(), expiresAt, nowMs })
  assert.match(sql, /^BEGIN;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='30s';/)
  assert.match(sql, /operator_project_ref='qdmvngjwkcsilzmqksme'/)
  assert.match(sql, /operator_project_ref='wrhgscovsgsudtedbljr'/)
  assert.match(sql, /'generation',23,'windowId','f1688d28-70fa-42d1-bdda-9f1489ee4470'/)
  assert.match(sql, /generation":23.*state":"retired"/)
  assert.match(sql, /rolvaliduntil='infinity'::timestamptz/)
  assert.match(sql, /NOT rolbypassrls/)
  assert.match(sql, /pg_shdepend/)
  assert.match(sql, /rolpassword IS NOT NULL/)
  assert.match(sql, /runtime sessions remain/)
  assert.equal(sql.split('clock_timestamp() >=').length, 3)
  assert.match(sql, /generation 23 requires disabled controls/i)
  assert.match(sql, /WHERE\s+\(granted\.rolname IN\([^)]+\) OR member\.rolname IN\([^)]+\)\) AND NOT/)
  assert.match(sql, /JOIN tll_staging_private\.applied_migrations actual USING\(version,source_sha256\)/)
  for (const [version, hash] of EXACT_MIGRATIONS) assert.ok(sql.includes(`('${version}','${hash}')`))
  assert.equal(sql.split('direct or PUBLIC private authority').length, 3)
  assert.equal(sql.split('aclexplode').length, 9)
  assert.match(sql, /COMMIT;\nSELECT jsonb_build_object/)
  assert.doesNotMatch(sql, /TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET/)
  for (const purpose of PASSWORD_PURPOSES) {
    const { login, membership } = IDENTITIES[purpose]
    assert.equal(sql.split(`GRANT ${membership} TO ${login} WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;`).length, 2)
    assert.equal(sql.split(`ALTER ROLE ${login} LOGIN PASSWORD `).length, 2)
  }
})

test('expiry and verifiers fail closed before SQL is returned', async () => {
  const { buildStagingGeneration23CredentialSql: buildArmed } = await armedFixture()
  const valid = verifiers()
  for (const bad of ['2026-09-26T09:59:00.000Z', '2026-09-26T11:01:00.000Z',
    '2026-09-26T10:30:00Z', "2026-09-26T10:50:00.000Z'; DROP TABLE x;--"]) {
    assert.throws(() => buildArmed({ verifiers: valid, expiresAt: bad, nowMs }), /unavailable/)
  }
  assert.throws(() => buildArmed({
    verifiers: { ...valid, bridge: valid.customer }, expiresAt, nowMs,
  }), /unavailable/)
  assert.throws(() => buildArmed({
    verifiers: { ...valid, bridge: "x'; DROP ROLE postgres;--" }, expiresAt, nowMs,
  }), /unavailable/)
})

test('Gen23 receipt accepts only the exact transaction result in an armed fixture', async () => {
  const { validateStagingGeneration23CredentialReceipt: validate } = await armedFixture()
  const receipt = { status: 'PASS', packageId: 'tll-staging-generation-23-credentials/v1',
    projectRef: 'qdmvngjwkcsilzmqksme', generation: 23,
    windowId: WINDOW_ID, expiresAt, controlsEnabled: false, runtimeCount: 5 }
  const rows = [{ tll_generation_23_credential_receipt: receipt }]
  assert.equal(validate(rows, { expiresAt, nowMs }).status, 'PASS')
  assert.match(validate(rows, { expiresAt, nowMs }).receiptSha256, /^[a-f0-9]{64}$/)
  for (const changed of [{ ...receipt, controlsEnabled: true }, { ...receipt, runtimeCount: 4 },
    { ...receipt, projectRef: 'wrhgscovsgsudtedbljr' }, { ...receipt, extra: true }]) {
    assert.throws(() => validate([{ tll_generation_23_credential_receipt: changed }], { expiresAt, nowMs }), /unavailable/)
  }
  assert.throws(() => validate(rows, { expiresAt: '2026-09-26T10:49:00.000Z', nowMs }), /unavailable/)
  assert.throws(() => validate([...rows, ...rows], { expiresAt, nowMs }), /unavailable/)
  assert.throws(() => validate([{ wrong: receipt }], { expiresAt, nowMs }), /unavailable/)
})
