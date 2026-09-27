import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildStagingGeneration23RecoverySql, STAGING_GENERATION_23_RECOVERY_ENABLED,
  validateStagingGeneration23RecoveryReceipt } from '../scripts/staging-generation-23-recovery.mjs'
import { EXACT_MIGRATIONS } from '../scripts/staging-generation-21-retirement-preflight.mjs'
import { IDENTITIES } from '../scripts/staging-generation-21-credentials.mjs'
import { PASSWORD_PURPOSES } from '../scripts/staging-generation-22-material.mjs'

const expiresAt = '2026-09-26T10:50:00.000Z'
const scripts = new URL('../scripts/', import.meta.url)
async function armedFixture() {
  let credential = await readFile(new URL('staging-generation-23-credentials.mjs', scripts), 'utf8')
  credential = credential
    .replace("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'", `export const ACTIVE_WINDOW_EXPIRES_AT = '${expiresAt}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  const credentialUrl = `data:text/javascript;base64,${Buffer.from(credential).toString('base64')}`
  assert.equal((await import(credentialUrl)).STAGING_GENERATION_23_CREDENTIALS_ENABLED, false)
  let recovery = await readFile(new URL('staging-generation-23-recovery.mjs', scripts), 'utf8')
  recovery = recovery.replace('export const STAGING_GENERATION_23_RECOVERY_ENABLED = false',
    'export const STAGING_GENERATION_23_RECOVERY_ENABLED = true')
    .replace("from './staging-generation-23-credentials.mjs'", `from '${credentialUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  return import(`data:text/javascript;base64,${Buffer.from(recovery).toString('base64')}`)
}

test('Gen23 recovery remains disconnected and refuses a result while disabled', () => {
  assert.equal(STAGING_GENERATION_23_RECOVERY_ENABLED, false)
  assert.throws(() => buildStagingGeneration23RecoverySql({ expiresAt }), /unavailable/)
  assert.throws(() => validateStagingGeneration23RecoveryReceipt([], { expiresAt }), /unavailable/)
})

test('armed synthetic recovery is exact, finite, role-only, and checks retired state', async () => {
  const { buildStagingGeneration23RecoverySql: build } = await armedFixture()
  const sql = build({ expiresAt })
  // The credential installer deliberately remains off in this fixture.
  assert.match(sql, /PASS_RETIRED/)
  assert.match(sql, /^BEGIN;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='30s';/)
  assert.match(sql, /operator_project_ref='qdmvngjwkcsilzmqksme'/)
  assert.match(sql, /operator_project_ref='wrhgscovsgsudtedbljr'/)
  for (const [version, hash] of EXACT_MIGRATIONS) assert.ok(sql.includes(`('${version}','${hash}')`))
  for (const purpose of PASSWORD_PURPOSES) {
    const { login, membership } = IDENTITIES[purpose]
    assert.equal(sql.split(`REVOKE ${membership} FROM ${login};`).length, 2)
    assert.equal(sql.split(`REVOKE ${login} FROM CURRENT_USER;`).length, 1)
    assert.equal(sql.split(`ALTER ROLE ${login} NOLOGIN PASSWORD NULL VALID UNTIL 'infinity';`).length, 2)
    assert.equal(sql.split(`COMMENT ON ROLE ${login} IS `).length, 2)
  }
  assert.match(sql, /runtime sessions remain/)
  assert.match(sql, /private authority drift/)
  assert.match(sql, /private authority changed/)
  assert.match(sql, /runtime grants drift/)
  assert.match(sql, /controls not disabled/)
  assert.match(sql, /controls changed/)
  assert.match(sql, /COMMIT;\nSELECT jsonb_build_object/)
  assert.doesNotMatch(sql, /DROP ROLE|DROP TABLE|UPDATE tll_|DELETE FROM/)
  assert.throws(() => build({ expiresAt: '2026-09-26T10:49:00.000Z' }), /unavailable/)
  assert.throws(() => build({ expiresAt: 'not-a-date' }), /unavailable/)
})

test('Gen23 recovery receipt rejects wrong project, state, count, expiry and extra fields', async () => {
  const { validateStagingGeneration23RecoveryReceipt: validate } = await armedFixture()
  const receipt = { status: 'PASS_RETIRED', recoveryId: 'tll-staging-generation-23-recovery/v1',
    projectRef: 'qdmvngjwkcsilzmqksme', generation: 23,
    windowId: '7d0e8f17-eac4-40e1-a5b5-8a8597d502a9', expiresAt,
    controlsEnabled: false, runtimeCount: 5 }
  const rows = [{ tll_generation_23_recovery_receipt: receipt }]
  assert.equal(validate(rows, { expiresAt }).status, 'PASS_RETIRED')
  for (const changed of [{ ...receipt, projectRef: 'wrhgscovsgsudtedbljr' },
    { ...receipt, status: 'PASS' }, { ...receipt, controlsEnabled: true },
    { ...receipt, runtimeCount: 4 }, { ...receipt, expiresAt: '2026-09-26T10:49:00.000Z' },
    { ...receipt, extra: true }]) {
    assert.throws(() => validate([{ tll_generation_23_recovery_receipt: changed }], { expiresAt }), /unavailable/)
  }
  assert.throws(() => validate([...rows, ...rows], { expiresAt }), /unavailable/)
})

test('recovery SQL packet is opaque and consumed only once', async () => {
  const { prepareStagingGeneration23RecoverySql: prepare,
    consumeStagingGeneration23PreparedRecoverySql: consume } = await armedFixture()
  const packet = prepare({ expiresAt })
  assert.deepEqual(Object.keys(packet), [])
  assert.throws(() => consume({ ...packet }), /unavailable/)
  const prepared = consume(packet)
  assert.match(prepared.sql, /PASS_RETIRED/)
  assert.equal(prepared.expiresAt, expiresAt)
  assert.throws(() => consume(packet), /unavailable/)
})
