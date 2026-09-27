import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildStagingGeneration23ControlShutdownSql,
  validateStagingGeneration23ControlShutdownReceipt } from '../scripts/staging-generation-23-control-shutdown.mjs'

const scripts = new URL('../scripts/', import.meta.url)
const expiresAt = '2026-09-26T13:00:00.000Z'
const encode = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`

async function armed() {
  const credentialSource = (await readFile(new URL('staging-generation-23-credentials.mjs', scripts), 'utf8'))
    .replace("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
      `export const ACTIVE_WINDOW_EXPIRES_AT = '${expiresAt}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  const shutdownSource = (await readFile(new URL('staging-generation-23-control-shutdown.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_23_CONTROL_SHUTDOWN_ENABLED = false',
      'export const STAGING_GENERATION_23_CONTROL_SHUTDOWN_ENABLED = true')
    .replace("from './staging-generation-23-credentials.mjs'", `from '${encode(credentialSource)}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  return import(encode(shutdownSource))
}

test('ordinary source cannot produce a shutdown transaction', () => {
  assert.throws(() => buildStagingGeneration23ControlShutdownSql({ expiresAt }), /unavailable/)
  assert.throws(() => validateStagingGeneration23ControlShutdownReceipt([], { expiresAt }), /unavailable/)
})

test('shutdown is one pinned transaction using narrow operator controls', async () => {
  const { buildStagingGeneration23ControlShutdownSql: build } = await armed()
  const sql = build({ expiresAt })
  assert.equal((sql.match(/\bBEGIN;/g) ?? []).length, 1)
  assert.equal((sql.match(/\bCOMMIT;/g) ?? []).length, 1)
  assert.match(sql, /qdmvngjwkcsilzmqksme/)
  assert.match(sql, /wrhgscovsgsudtedbljr/)
  assert.match(sql, /6f33365f-9b0f-4885-b0be-40669e039f61/)
  assert.match(sql, /operator_set_enabled\(false,'generation_23_shutdown'\)/)
  assert.match(sql, /UPDATE tll_cart_private\.control SET enabled=false WHERE singleton/)
  assert.match(sql, /operator_status\(\)->'enabled' IS DISTINCT FROM 'false'::jsonb/)
  assert.doesNotMatch(sql, /CREATE ROLE|ALTER ROLE|PASSWORD|GRANT .* TO .*runtime/)
  assert.throws(() => build({ expiresAt: '2026-09-26T13:01:00.000Z' }), /unavailable/)
})

test('only an exact, disabled-control receipt is accepted', async () => {
  const { validateStagingGeneration23ControlShutdownReceipt: validate } = await armed()
  const receipt = { status: 'PASS_CONTROLS_DISABLED',
    shutdownId: 'tll-staging-generation-23-control-shutdown/v1',
    projectRef: 'qdmvngjwkcsilzmqksme', generation: 23,
    windowId: '6f33365f-9b0f-4885-b0be-40669e039f61', expiresAt,
    controlsEnabled: 0 }
  assert.match(validate([{ tll_generation_23_control_shutdown: receipt }],
    { expiresAt }).receiptSha256, /^[a-f0-9]{64}$/)
  assert.throws(() => validate([{ tll_generation_23_control_shutdown:
    { ...receipt, controlsEnabled: 1 } }], { expiresAt }), /unavailable/)
  assert.throws(() => validate([{ tll_generation_23_control_shutdown:
    { ...receipt, extra: true } }], { expiresAt }), /unavailable/)
})
