import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import {
  createStagingControlActivationNativeAdapter,
  executeExactControlActivation,
  MANAGEMENT_ENDPOINT,
  MAX_RESPONSE_BYTES,
  NATIVE_STAGING_CONTROL_ADAPTER_ENABLED,
  PROJECT_REF,
  REQUEST_TIMEOUT_MS,
} from '../scripts/staging-database-native-adapter.mjs'

const NOW = Date.parse('2026-09-22T15:00:00.000Z')
const context = Object.freeze({ generation: 22, windowId: '91b9cc94-7743-4e0a-9d40-6f01fd215189', expiresAt: '2026-09-22T15:50:00.000Z' })
const token = () => Buffer.from(`sbp_${'a'.repeat(40)}`)
const receipt = Object.freeze({
  queryId: 'tll-staging-control-activation/v1', packageId: 'tll-staging-generation-22-control-activation/v1',
  projectRef: PROJECT_REF, generation: 22, windowId: context.windowId, expiresAt: context.expiresAt,
  status: 'PASS_CONTROLS_ENABLED', controlsEnabled: 5, runtimeSessions: 0, ownerEdgesVerified: 5, temporaryOwnerEdgesRestored: 4,
})

function requestWith ({ statusCode = 201, contentType = 'application/json', body = JSON.stringify([{ tll_staging_control_activation: receipt }]), signal = 'end' } = {}, seen = []) {
  return (options, callback) => {
    seen.push(options)
    const request = new EventEmitter()
    request.destroy = () => { request.destroyed = true }
    request.end = written => {
      request.written = Buffer.from(written)
      queueMicrotask(() => {
        if (signal === 'request-error') return request.emit('error', Error('network'))
        const response = new EventEmitter()
        response.statusCode = statusCode
        response.headers = { 'content-type': contentType }
        response.destroy = () => { response.destroyed = true }
        callback(response)
        if (signal === 'aborted') return response.emit('aborted')
        if (signal === 'response-error') return response.emit('error', Error('network'))
        response.emit('data', Buffer.from(body))
        if (signal === 'end') response.emit('end')
      })
    }
    return request
  }
}

test('fixed staging Management API target is the only target and production is excluded', async () => {
  assert.equal(MANAGEMENT_ENDPOINT.hostname, 'api.supabase.com')
  assert.equal(MANAGEMENT_ENDPOINT.path, `/v1/projects/${PROJECT_REF}/database/query`)
  assert.equal(MANAGEMENT_ENDPOINT.method, 'POST')
  assert.equal(NATIVE_STAGING_CONTROL_ADAPTER_ENABLED, false)
  assert.equal(REQUEST_TIMEOUT_MS, 35_000)
  assert.equal(MAX_RESPONSE_BYTES, 65_536)
  const never = () => { throw Error('must not run') }
  await assert.rejects(() => executeExactControlActivation({ context, token: token(), request: never, projectRef: 'wrhgscovsgsudtedbljr', nowMs: NOW }), /unavailable/)
  await assert.rejects(() => executeExactControlActivation({ context, token: token(), request: never, endpoint: 'https://example.test', nowMs: NOW }), /unavailable/)
  await assert.rejects(() => executeExactControlActivation({ context, token: token(), request: never, sql: 'DROP TABLE customers', nowMs: NOW }), /unavailable/)
})

test('one request carries only the internally generated exact transaction and exact receipt is required', async () => {
  const seen = []
  const result = await executeExactControlActivation({ context, token: token(), request: requestWith({}, seen), nowMs: NOW })
  assert.equal(seen.length, 1)
  assert.deepEqual(Object.keys(result).sort(), ['generation', 'receiptHash', 'status', 'target', 'windowId'])
  assert.equal(result.status, 'CONTROLS_ENABLED')
  assert.equal(seen[0].hostname, MANAGEMENT_ENDPOINT.hostname)
  assert.equal(seen[0].path, MANAGEMENT_ENDPOINT.path)
  assert.equal(seen[0].method, 'POST')
  assert.equal(seen[0].headers['Content-Type'], 'application/json')
  assert.equal(seen[0].headers['Content-Length'] > 0, true)
  assert.match(seen[0].headers.Authorization, /^Bearer sbp_[a-f0-9]{40}$/)
  assert.doesNotMatch(JSON.stringify(result), /BEGIN;|password|secret|token|authorization/i)
})

test('malformed, oversized, non-201, aborted and network responses fail with no retry', async () => {
  for (const reply of [
    { body: 'not json' },
    { body: JSON.stringify([]) },
    { body: JSON.stringify([{ tll_staging_control_activation: { ...receipt, controlsEnabled: 4 } }]) },
    { body: 'x'.repeat(MAX_RESPONSE_BYTES + 1) },
    { statusCode: 400 },
    { signal: 'aborted' },
    { signal: 'response-error' },
    { signal: 'request-error' },
  ]) {
    const seen = []
    await assert.rejects(() => executeExactControlActivation({ context, token: token(), request: requestWith(reply, seen), nowMs: NOW }), /unavailable/)
    assert.equal(seen.length, 1)
  }
})

test('a bounded timeout destroys the single request and does not retry', async () => {
  const seen = []
  let destroyed = false
  const request = options => {
    seen.push(options)
    const outgoing = new EventEmitter()
    outgoing.destroy = () => { destroyed = true }
    outgoing.end = () => {}
    return outgoing
  }
  await assert.rejects(() => executeExactControlActivation({
    context, token: token(), request, nowMs: NOW,
    scheduleTimeout: callback => { queueMicrotask(callback); return 'timer' },
    clearScheduledTimeout: () => {},
  }), /unavailable/)
  assert.equal(seen.length, 1)
  assert.equal(destroyed, true)
})

test('closed adapter remains disabled and therefore does not read a token or invoke a request', async () => {
  let reads = 0
  let requests = 0
  const adapter = createStagingControlActivationNativeAdapter({
    now: () => NOW,
    readToken: () => { reads += 1; return token() },
    request: () => { requests += 1; throw Error('must not run') },
  })
  const result = await adapter.activate({ context })
  assert.deepEqual(result, { status: 'NATIVE_ACCESS_DISABLED', target: PROJECT_REF, generation: 22, windowId: context.windowId })
  assert.equal(reads, 0)
  assert.equal(requests, 0)
  await assert.rejects(() => adapter.activate({ context, projectRef: 'wrhgscovsgsudtedbljr' }), /unavailable/)
})

test('token handling requires a Buffer, preserves the caller input and zeroes the private copy', async () => {
  const input = token()
  await executeExactControlActivation({ context, token: input, request: requestWith(), nowMs: NOW })
  assert.match(input.toString('utf8'), /^sbp_/)
  await assert.rejects(() => executeExactControlActivation({ context, token: input.toString('utf8'), request: requestWith(), nowMs: NOW }), /unavailable/)
  await assert.rejects(() => executeExactControlActivation({ context, token: Buffer.from('not-a-token'), request: requestWith(), nowMs: NOW }), /unavailable/)
  const source = readFileSync('scripts/staging-database-native-adapter.mjs', 'utf8')
  assert.match(source, /const copy = Buffer\.from\(value\)/)
  assert.match(source, /owned\.buffer\.fill\(0\)/)
})

test('native adapter source has no launcher, Keychain reader, generic SQL export or live default', () => {
  const source = readFileSync('scripts/staging-database-native-adapter.mjs', 'utf8')
  assert.doesNotMatch(source, /spawnSync|security find|Keychain|process\.argv|https\.request/)
  assert.doesNotMatch(source, /export (?:async )?function postManagementQuery/)
  assert.doesNotMatch(source, /wrhgscovsgsudtedbljr/)
  assert.match(source, /NATIVE_STAGING_CONTROL_ADAPTER_ENABLED = false/)
})
