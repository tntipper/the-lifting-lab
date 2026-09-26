import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildStagingGeneration22ActiveCheckSql,
  STAGING_GENERATION_22_ACTIVE_CHECK_ENABLED,
  validateStagingGeneration22ActiveCheck } from '../scripts/staging-generation-22-active-check.mjs'
import { EXACT_MIGRATIONS } from '../scripts/staging-generation-21-retirement-preflight.mjs'

const expiresAt = '2026-09-26T10:50:00.000Z'
async function armedFixture() {
  const scripts = new URL('../scripts/', import.meta.url)
  let credential = await readFile(new URL('staging-generation-22-credentials.mjs', scripts), 'utf8')
  credential = credential.replace("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
    `export const ACTIVE_WINDOW_EXPIRES_AT = '${expiresAt}'`).replaceAll("from './", `from '${scripts.href}`)
  const credentialUrl = `data:text/javascript;base64,${Buffer.from(credential).toString('base64')}`
  let source = await readFile(new URL('staging-generation-22-active-check.mjs', scripts), 'utf8')
  source = source.replace('export const STAGING_GENERATION_22_ACTIVE_CHECK_ENABLED = false',
    'export const STAGING_GENERATION_22_ACTIVE_CHECK_ENABLED = true')
    .replace("from './staging-generation-22-credentials.mjs'", `from '${credentialUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

test('active-state check remains disconnected by default', () => {
  assert.equal(STAGING_GENERATION_22_ACTIVE_CHECK_ENABLED, false)
  assert.throws(() => buildStagingGeneration22ActiveCheckSql({ expiresAt }), /unavailable/)
  assert.throws(() => validateStagingGeneration22ActiveCheck([], { expiresAt }), /unavailable/)
})

test('read-only active check pins project, migration, roles, grants and disabled controls', async () => {
  const { buildStagingGeneration22ActiveCheckSql: build } = await armedFixture()
  const sql = build({ expiresAt })
  assert.match(sql, /^BEGIN READ ONLY;\nSET LOCAL lock_timeout='5s';/)
  assert.match(sql, /operator_project_ref='qdmvngjwkcsilzmqksme'/)
  assert.match(sql, /operator_project_ref='wrhgscovsgsudtedbljr'/)
  for (const [version, hash] of EXACT_MIGRATIONS) assert.ok(sql.includes(`('${version}','${hash}')`))
  assert.match(sql, /rolcanlogin/)
  assert.match(sql, /rolpassword IS NOT NULL/)
  assert.match(sql, /state":"active"/)
  assert.match(sql, /e\.grantor=operator_name::regrole/)
  assert.match(sql, /runtime sessions remain/)
  assert.match(sql, /private authority drift/)
  assert.match(sql, /controls not disabled/)
  assert.doesNotMatch(sql, /REVOKE |ALTER ROLE|UPDATE tll_|DELETE FROM/)
  assert.throws(() => build({ expiresAt: '2026-09-26T10:49:00.000Z' }), /unavailable/)
})

test('active-state receipt requires exact fields and target', async () => {
  const { validateStagingGeneration22ActiveCheck: validate } = await armedFixture()
  const result = { status: 'PASS_ACTIVE', queryId: 'tll-staging-generation-22-active-check/v1',
    projectRef: 'qdmvngjwkcsilzmqksme', generation: 22,
    windowId: '9a539def-bf3c-442c-bf06-c4bd1df39543', expiresAt,
    controlsEnabled: false, runtimeCount: 5, runtimeSessions: 0 }
  const rows = [{ tll_generation_22_active_check: result }]
  assert.equal(validate(rows, { expiresAt }).status, 'PASS_ACTIVE')
  for (const bad of [{ ...result, runtimeSessions: 1 }, { ...result, generation: 21 },
    { ...result, projectRef: 'wrhgscovsgsudtedbljr' }, { ...result, extra: true }]) {
    assert.throws(() => validate([{ tll_generation_22_active_check: bad }], { expiresAt }), /unavailable/)
  }
  assert.throws(() => validate([...rows, ...rows], { expiresAt }), /unavailable/)
})
