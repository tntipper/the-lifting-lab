import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildStagingGeneration23FinalCheckSql, STAGING_GENERATION_23_FINAL_CHECK_ENABLED } from '../scripts/staging-generation-23-final-check.mjs'

const scripts = new URL('../scripts/', import.meta.url)
const expiresAt = '2026-09-27T12:00:00.000Z'
const data = value => `data:text/javascript;base64,${Buffer.from(value).toString('base64')}`

async function armed() {
  let credentials = await readFile(new URL('staging-generation-23-credentials.mjs', scripts), 'utf8')
  credentials = credentials.replace("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
    `export const ACTIVE_WINDOW_EXPIRES_AT = '${expiresAt}'`).replaceAll("from './", `from '${scripts.href}`)
  const credentialsUrl = data(credentials)
  let source = await readFile(new URL('staging-generation-23-final-check.mjs', scripts), 'utf8')
  source = source.replace('STAGING_GENERATION_23_FINAL_CHECK_ENABLED = false',
    'STAGING_GENERATION_23_FINAL_CHECK_ENABLED = true')
    .replace("from './staging-generation-23-credentials.mjs'", `from '${credentialsUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  return import(data(source))
}

test('ordinary Gen23 final proof remains disabled', () => {
  assert.equal(STAGING_GENERATION_23_FINAL_CHECK_ENABLED, false)
  assert.throws(() => buildStagingGeneration23FinalCheckSql(), /unavailable/)
})

test('final proof accepts only Gen23 retired marker and only inert operator links', async () => {
  const final = await armed()
  const sql = final.buildStagingGeneration23FinalCheckSql()
  const retired = final.GEN23_RETIRED_MARKER
  const gen22 = 'tll-runtime-window/v1 {"expiresAt":"2026-09-26T19:52:00.000Z","generation":22,"projectRef":"qdmvngjwkcsilzmqksme","state":"retired","windowId":"00000000-0000-4000-8000-000000000022"}'
  assert.equal(final.isExpectedGen23RetiredMarker(retired), true)
  assert.equal(final.isExpectedGen23RetiredMarker(gen22), false)
  assert.ok(sql.includes(retired))
  assert.ok(!sql.includes(gen22))
  assert.match(sql, /runtime grants drift/)
  assert.match(sql, /credentials remain/)
  assert.match(sql, /runtime sessions remain/)
  assert.match(sql, /controls changed/)
  assert.match(sql, /BEGIN READ ONLY;/)
  assert.match(sql, /PASS_FINAL_RETIRED/)
})

test('final proof validator rejects a predecessor-shaped or changed receipt', async () => {
  const final = await armed()
  const receipt = { status: 'PASS_FINAL_RETIRED', queryId: 'tll-staging-generation-23-final-check/v1',
    projectRef: 'qdmvngjwkcsilzmqksme', generation: 23,
    windowId: '1e8c4f1d-0dde-4329-a9c6-e17223905a77', expiresAt,
    controlsEnabled: false, runtimeCount: 5, runtimeSessions: 0 }
  assert.equal(final.validateStagingGeneration23FinalCheck([{ tll_generation_23_final_check: receipt }]).status,
    'PASS_FINAL_RETIRED')
  for (const changed of [{ ...receipt, status: 'PASS_RETIRED' }, { ...receipt, generation: 22 },
    { ...receipt, runtimeSessions: 1 }, { ...receipt, controlsEnabled: true }, { ...receipt, extra: true }]) {
    assert.throws(() => final.validateStagingGeneration23FinalCheck([{ tll_generation_23_final_check: changed }]), /unavailable/)
  }
})
