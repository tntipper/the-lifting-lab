import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PROJECT_REF } from '../scripts/staging-generation-23-password-material.mjs'
import { buildStagingGeneration23BackendStateSql } from '../scripts/staging-generation-23-backend-state.mjs'

const scripts = new URL('../scripts/', import.meta.url)
const expiresAt = '2026-09-26T12:40:00.000Z'
const encode = value => `data:text/javascript;base64,${Buffer.from(value).toString('base64')}`

async function armed() {
  const credentials = (await readFile(new URL('staging-generation-23-credentials.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_23_CREDENTIALS_ENABLED = false',
      'export const STAGING_GENERATION_23_CREDENTIALS_ENABLED = true')
    .replace("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
      `export const ACTIVE_WINDOW_EXPIRES_AT = '${expiresAt}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  const credentialUrl = encode(credentials)
  const source = (await readFile(new URL('staging-generation-23-backend-state.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_23_BACKEND_STATE_ENABLED = false',
      'export const STAGING_GENERATION_23_BACKEND_STATE_ENABLED = true')
    .replace("from './staging-generation-23-credentials.mjs'", `from '${credentialUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  return import(encode(source))
}

test('ordinary backend state SQL remains disabled', () => {
  assert.throws(() => buildStagingGeneration23BackendStateSql({ expiresAt }), /unavailable/)
})

test('fixed read-only SQL checks staging identity, active roles, OFF controls and sessions', async () => {
  const api = await armed()
  const sql = api.buildStagingGeneration23BackendStateSql({ expiresAt })
  assert.match(sql, /^BEGIN READ ONLY;/)
  assert.match(sql, /operator_project_ref='qdmvngjwkcsilzmqksme'/)
  assert.match(sql, /operator_project_ref='wrhgscovsgsudtedbljr'/)
  assert.match(sql, /tll_cart_private\.control/)
  assert.match(sql, /operator_status\(\)->'enabled'/)
  assert.match(sql, /pg_stat_activity/)
  assert.match(sql, /Gen23 backend controls not OFF/)
  assert.doesNotMatch(sql, /\b(?:UPDATE|DELETE|INSERT|ALTER|DROP|CREATE)\s+(?:TABLE|ROLE|tll_)/i)
  const packet = api.prepareStagingGeneration23BackendStateSql({ expiresAt })
  assert.equal(api.consumeStagingGeneration23BackendStateSql(packet), sql)
  assert.throws(() => api.consumeStagingGeneration23BackendStateSql(packet), /unavailable/)
})

test('backend receipt accepts a valid session count and rejects drift', async () => {
  const api = await armed()
  const expected = { status: 'PASS_BACKEND_OFF', queryId: api.QUERY_ID,
    projectRef: PROJECT_REF, generation: 23,
    windowId: '35b6910a-3a5c-4721-9452-f5074829f91c', expiresAt,
    controlsEnabled: false, runtimeSessions: 1 }
  const rows = [{ tll_generation_23_backend_state: expected }]
  const result = api.validateStagingGeneration23BackendState(rows, { expiresAt })
  assert.deepEqual(Object.keys(result).sort(), ['controlsEnabled', 'projectRef', 'receiptSha256', 'runtimeSessions'])
  assert.equal(result.runtimeSessions, 1)
  for (const changed of [
    { projectRef: 'wrhgscovsgsudtedbljr' }, { controlsEnabled: true },
    { runtimeSessions: -1 }, { runtimeSessions: '1' }, { generation: 22 },
  ]) assert.throws(() => api.validateStagingGeneration23BackendState([
    { tll_generation_23_backend_state: { ...expected, ...changed } }], { expiresAt }), /unavailable/)
})
