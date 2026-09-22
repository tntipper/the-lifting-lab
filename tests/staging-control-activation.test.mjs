import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildStagingControlActivationSql,
  executeStagingControlActivation,
  PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  validateControlActivationContext,
  validateStagingControlActivationReceipt,
} from '../scripts/staging-control-activation.mjs'

const NOW = Date.parse('2026-09-22T15:00:00.000Z')
const context = Object.freeze({ generation: 22, windowId: '91b9cc94-7743-4e0a-9d40-6f01fd215189', expiresAt: '2026-09-22T15:50:00.000Z' })
const receipt = Object.freeze({
  queryId: 'tll-staging-control-activation/v1', packageId: 'tll-staging-generation-22-control-activation/v1',
  projectRef: PROJECT_REF, generation: 22, windowId: context.windowId, expiresAt: context.expiresAt,
  status: 'PASS_CONTROLS_ENABLED', controlsEnabled: 5, runtimeSessions: 0, ownerEdgesVerified: 5, temporaryOwnerEdgesRestored: 4,
})

test('context rejects consumed Gen21, arbitrary keys, malformed windows and unbounded expiry', () => {
  assert.deepEqual(validateControlActivationContext(context, { nowMs: NOW }), { ...context, packageId: 'tll-staging-generation-22-control-activation/v1', reasonCode: 'generation_22_acceptance' })
  for (const value of [
    { ...context, generation: 21 },
    { ...context, generation: 22.5 },
    { ...context, projectRef: PROJECT_REF },
    { ...context, windowId: 'not-a-window' },
    { ...context, expiresAt: '2026-09-22T16:00:00.001Z' },
    { ...context, expiresAt: '2026-09-22T16:00:01.000Z' },
    { ...context, expiresAt: '2026-09-22T14:59:59.000Z' },
  ]) assert.throws(() => validateControlActivationContext(value, { nowMs: NOW }), /unavailable/)
})

test('one fixed transaction validates exact staging/runtime/owner state and enables controls in dependency order', () => {
  const sql = buildStagingControlActivationSql(context, { nowMs: NOW })
  assert.ok(sql.startsWith('BEGIN;\n'))
  assert.equal((sql.match(/\bBEGIN;/g) ?? []).length, 1)
  assert.equal((sql.match(/\bCOMMIT;/g) ?? []).length, 1)
  assert.match(sql, new RegExp(PROJECT_REF))
  assert.match(sql, new RegExp(PRODUCTION_PROJECT_REF))
  assert.match(sql, new RegExp(context.windowId))
  assert.match(sql, new RegExp(context.expiresAt.replaceAll('.', '\\.')))
  assert.match(sql, /"state":"active"/)
  assert.match(sql, /tll-runtime-window\/v1/)
  assert.match(sql, /rolpassword IS NULL/)
  assert.match(sql, /pg_stat_activity/)
  assert.match(sql, /clock_timestamp\(\)\+interval '2 minutes'>='2026-09-22T15:50:00\.000Z'::timestamptz/)
  assert.match(sql, /clock_timestamp\(\)>='2026-09-22T15:50:00\.000Z'::timestamptz/)
  assert.match(sql, /pg_stat_clear_snapshot\(\)/)
  for (const attribute of ['rolsuper', 'rolinherit', 'rolcreaterole', 'rolcreatedb', 'rolreplication', 'rolbypassrls', 'rolconnlimit', 'rolconfig']) assert.match(sql, new RegExp(attribute))
  assert.match(sql, /requires exact disabled controls/)
  for (const name of ['customer', 'broker', 'provisional', 'bridge']) assert.match(sql, new RegExp(`tll_${name}_private\\.operator_status`))
  assert.doesNotMatch(sql, /operator_set_enabled/)
  const positions = ['tll_customer_private.control', 'tll_cart_private.control', 'tll_broker_private.control', 'tll_provisional_private.control', 'tll_bridge_private.control']
    .map(name => sql.indexOf(`LOCK TABLE ${name}`))
  assert.ok(positions.every(value => value > 0))
  assert.deepEqual([...positions].sort((a, b) => a - b), positions)
  for (const owner of ['customer', 'broker', 'provisional', 'bridge']) {
    assert.match(sql, new RegExp(`SET LOCAL ROLE tll_${owner}_owner`))
    assert.match(sql, new RegExp(`REVOKE %I FROM %I GRANTED BY %I',[\\s\\S]*'tll_${owner}_owner`))
  }
  assert.doesNotMatch(sql, /SET LOCAL ROLE tll_cart_owner/)
  assert.match(sql, /tll_cart_private\.control'::regclass\) IS DISTINCT FROM operator_name::regrole/)
  assert.match(sql, /relforcerowsecurity/)
  assert.match(sql, /generation_22_acceptance/)
  assert.match(sql, /PASS_CONTROLS_ENABLED/)
})

test('receipt validator accepts only the exact redacted contract', () => {
  const result = validateStagingControlActivationReceipt([{ tll_staging_control_activation: receipt }], context, { nowMs: NOW })
  assert.equal(result.status, 'CONTROLS_ENABLED')
  assert.equal(result.target, PROJECT_REF)
  assert.match(result.receiptHash, /^[a-f0-9]{64}$/)
  assert.throws(() => validateStagingControlActivationReceipt([{ tll_staging_control_activation: { ...receipt, controlsEnabled: 4 } }], context, { nowMs: NOW }), /unavailable/)
  assert.throws(() => validateStagingControlActivationReceipt([{ tll_staging_control_activation: { ...receipt, extra: true } }], context, { nowMs: NOW }), /unavailable/)
})

test('injected execution dispatches exactly once and returns no SQL or secret-bearing data', async () => {
  const calls = []
  const result = await executeStagingControlActivation({ context, nowMs: NOW, post: async sql => {
    calls.push(sql)
    return [{ tll_staging_control_activation: receipt }]
  } })
  assert.equal(calls.length, 1)
  assert.deepEqual(Object.keys(result).sort(), ['generation', 'receiptHash', 'status', 'target', 'windowId'])
  assert.doesNotMatch(JSON.stringify(result), /BEGIN;|password|secret|token|SCRAM/i)
})

test('a thrown, lost or malformed acknowledgement requires reconciliation and never retries', async () => {
  let calls = 0
  const thrown = await executeStagingControlActivation({ context, nowMs: NOW, post: async () => { calls += 1; throw Error('lost response with sensitive body') } })
  assert.equal(calls, 1)
  assert.deepEqual(thrown, { status: 'RECONCILIATION_REQUIRED', target: PROJECT_REF, generation: 22, windowId: context.windowId })
  const malformed = await executeStagingControlActivation({ context, nowMs: NOW, post: async () => { calls += 1; return [] } })
  assert.equal(calls, 2)
  assert.deepEqual(malformed, thrown)
  assert.doesNotMatch(JSON.stringify([thrown, malformed]), /sensitive|BEGIN;|password|secret|token/i)
})

test('no native transport, credential reader or live launcher is present', async () => {
  const source = await import('node:fs').then(({ readFileSync }) => readFileSync('scripts/staging-control-activation.mjs', 'utf8'))
  assert.doesNotMatch(source, /security find-generic-password|SUPABASE_ACCESS_TOKEN|https\.request|spawn|live-launcher/i)
})
