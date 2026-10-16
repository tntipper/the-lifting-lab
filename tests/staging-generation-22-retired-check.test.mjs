import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildStagingGeneration22RetiredCheckSql,
  STAGING_GENERATION_22_RETIRED_CHECK_ENABLED,
  validateStagingGeneration22RetiredCheck } from '../scripts/staging-generation-22-retired-check.mjs'
import { EXACT_MIGRATIONS } from '../scripts/staging-generation-21-retirement-preflight.mjs'

const expiresAt = '2026-09-26T10:50:00.000Z'
async function armedFixture() {
  const scripts = new URL('../scripts/', import.meta.url)
  let credential = await readFile(new URL('staging-generation-22-credentials.mjs', scripts), 'utf8')
  credential = credential.replace("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
    `export const ACTIVE_WINDOW_EXPIRES_AT = '${expiresAt}'`).replaceAll("from './", `from '${scripts.href}`)
  const credentialUrl = `data:text/javascript;base64,${Buffer.from(credential).toString('base64')}`
  assert.equal((await import(credentialUrl)).STAGING_GENERATION_22_CREDENTIALS_ENABLED, false)
  let source = await readFile(new URL('staging-generation-22-retired-check.mjs', scripts), 'utf8')
  source = source.replace('export const STAGING_GENERATION_22_RETIRED_CHECK_ENABLED = false',
    'export const STAGING_GENERATION_22_RETIRED_CHECK_ENABLED = true')
    .replace("from './staging-generation-22-credentials.mjs'", `from '${credentialUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

test('separate retired-state check remains unavailable by default', () => {
  assert.equal(STAGING_GENERATION_22_RETIRED_CHECK_ENABLED, false)
  assert.throws(() => buildStagingGeneration22RetiredCheckSql({ expiresAt }), /unavailable/)
  assert.throws(() => validateStagingGeneration22RetiredCheck([], { expiresAt }), /unavailable/)
})

test('armed fixture checks exact retired state in a separate read-only transaction', async () => {
  const { buildStagingGeneration22RetiredCheckSql: build } = await armedFixture()
  const sql = build({ expiresAt })
  assert.match(sql, /^BEGIN READ ONLY;\nSET LOCAL lock_timeout='5s';/)
  assert.match(sql, /operator_project_ref='qdmvngjwkcsilzmqksme'/)
  assert.match(sql, /operator_project_ref='wrhgscovsgsudtedbljr'/)
  for (const [version, hash] of EXACT_MIGRATIONS) assert.ok(sql.includes(`('${version}','${hash}')`))
  assert.match(sql, /rolvaliduntil='infinity'::timestamptz/)
  assert.match(sql, /rolpassword IS NOT NULL/)
  assert.match(sql, /state":"retired"/)
  assert.match(sql, /runtime sessions remain/)
  assert.match(sql, /private authority drift/)
  assert.match(sql, /controls changed/)
  assert.doesNotMatch(sql, /e\.grantor=/)
  assert.doesNotMatch(sql, /REVOKE |ALTER ROLE|UPDATE tll_|DELETE FROM/)
  assert.throws(() => build({ expiresAt: '2026-09-26T10:49:00.000Z' }), /unavailable/)
})

test('separate retired-state receipt requires exact fields and target', async () => {
  const { validateStagingGeneration22RetiredCheck: validate } = await armedFixture()
  const result = { status: 'PASS_RETIRED', queryId: 'tll-staging-generation-22-retired-check/v1',
    projectRef: 'qdmvngjwkcsilzmqksme', generation: 22,
    windowId: '9a539def-bf3c-442c-bf06-c4bd1df39543', expiresAt,
    controlsEnabled: false, runtimeCount: 5, runtimeSessions: 0 }
  const rows = [{ tll_generation_22_retired_check: result }]
  assert.equal(validate(rows, { expiresAt }).status, 'PASS_RETIRED')
  for (const bad of [{ ...result, runtimeSessions: 1 }, { ...result, generation: 21 },
    { ...result, projectRef: 'wrhgscovsgsudtedbljr' }, { ...result, extra: true }]) {
    assert.throws(() => validate([{ tll_generation_22_retired_check: bad }], { expiresAt }), /unavailable/)
  }
  assert.throws(() => validate([...rows, ...rows], { expiresAt }), /unavailable/)
})
