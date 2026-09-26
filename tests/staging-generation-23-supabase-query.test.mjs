import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { deriveScramVerifier } from '../scripts/staging-generation-6-transport.mjs'
import { PASSWORD_PURPOSES } from '../scripts/staging-generation-22-material.mjs'
import { postStagingGeneration23DatabaseSql } from '../scripts/staging-generation-23-supabase-query.mjs'

const scripts = new URL('../scripts/', import.meta.url)
const start = Date.parse('2026-09-26T12:00:00.000Z')
const expiresAt = '2026-09-26T12:40:00.000Z'
const token = Buffer.from(`sbp_${'a'.repeat(40)}`)
const encode = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const verifiers = Object.fromEntries(PASSWORD_PURPOSES.map((purpose, index) => [purpose,
  deriveScramVerifier(String(index + 1).repeat(64), Buffer.alloc(18, index + 1))]))

async function fixture() {
  const credentialSource = (await readFile(new URL('staging-generation-23-credentials.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_23_CREDENTIALS_ENABLED = false',
      'export const STAGING_GENERATION_23_CREDENTIALS_ENABLED = true')
    .replace("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
      `export const ACTIVE_WINDOW_EXPIRES_AT = '${expiresAt}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  const credentialUrl = encode(credentialSource)
  const credentials = await import(credentialUrl)
  const arm = async (file, flag) => {
    const source = (await readFile(new URL(file, scripts), 'utf8'))
      .replace(`export const ${flag} = false`, `export const ${flag} = true`)
      .replace("from './staging-generation-23-credentials.mjs'", `from '${credentialUrl}'`)
      .replaceAll("from './", `from '${scripts.href}`)
    return { url: encode(source), module: await import(encode(source)) }
  }
  const recovery = await arm('staging-generation-23-recovery.mjs',
    'STAGING_GENERATION_23_RECOVERY_ENABLED')
  const shutdown = await arm('staging-generation-23-control-shutdown.mjs',
    'STAGING_GENERATION_23_CONTROL_SHUTDOWN_ENABLED')
  const querySource = (await readFile(new URL('staging-generation-23-supabase-query.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_23_SUPABASE_QUERY_ENABLED = false',
      'export const STAGING_GENERATION_23_SUPABASE_QUERY_ENABLED = true')
    .replace("from './staging-generation-23-credentials.mjs'", `from '${credentialUrl}'`)
    .replace("from './staging-generation-23-recovery.mjs'", `from '${recovery.url}'`)
    .replace("from './staging-generation-23-control-shutdown.mjs'", `from '${shutdown.url}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  const query = await import(encode(querySource))
  const prepare = action => action === 'SETUP'
    ? credentials.prepareStagingGeneration23CredentialSql({ expiresAt, verifiers, nowMs: start })
    : action === 'SHUTDOWN'
      ? shutdown.module.prepareStagingGeneration23ControlShutdownSql({ expiresAt })
      : recovery.module.prepareStagingGeneration23RecoverySql({ expiresAt })
  return { query, prepare }
}

function fakeRequest({ status = 201, payload = [{ receipt: 'synthetic' }],
  stall = false, partial = false } = {}) {
  const calls = []
  const request = (options, callback) => {
    const req = new EventEmitter()
    req.destroyed = false
    req.destroy = () => { req.destroyed = true }
    req.end = body => {
      calls.push({ options, body: Buffer.from(body), req })
      if (stall) return
      queueMicrotask(() => {
        const res = new EventEmitter()
        res.statusCode = status
        res.headers = { 'content-type': 'application/json' }
        res.destroy = () => { res.destroyed = true }
        calls.at(-1).response = res
        callback(res)
        if (res.destroyed) return
        res.emit('data', Buffer.from(JSON.stringify(payload)))
        if (!partial) res.emit('end')
      })
    }
    return req
  }
  return { request, calls }
}

test('ordinary Gen23 query cannot contact the hosted API', async () => {
  await assert.rejects(postStagingGeneration23DatabaseSql({}, {
    action: 'SETUP', token, signal: new AbortController().signal, request: () => {},
  }), /unavailable/)
})

test('all three packets reach only the fixed staging HTTP endpoint and return one JSON row', async () => {
  const { query: { postStagingGeneration23DatabaseSql: post }, prepare } = await fixture()
  for (const action of ['SETUP', 'SHUTDOWN', 'RETIRE']) {
    const packet = prepare(action)
    const fake = fakeRequest()
    assert.deepEqual(await post(packet, { action, token,
      signal: new AbortController().signal, request: fake.request }), [{ receipt: 'synthetic' }])
    assert.equal(fake.calls.length, 1)
    const { options, body } = fake.calls[0]
    assert.equal(options.hostname, 'api.supabase.com')
    assert.equal(options.path, '/v1/projects/qdmvngjwkcsilzmqksme/database/query')
    assert.equal(options.method, 'POST')
    assert.equal(options.rejectUnauthorized, true)
    assert.equal(JSON.parse(body.toString('utf8')).read_only, false)
    const sql = JSON.parse(body.toString('utf8')).query
    assert.match(sql, /^BEGIN;/)
    if (action === 'SETUP') assert.match(sql, /Generation 23 role state mismatch/)
    if (action === 'SHUTDOWN') assert.match(sql, /operator_set_enabled\(false/)
    if (action === 'RETIRE') assert.match(sql, /Generation 23 recovery retired marker mismatch/)
    await assert.rejects(post(packet, { action, token,
      signal: new AbortController().signal, request: fake.request }), /unavailable/)
    assert.equal(fake.calls.length, 1)
  }
})

test('abort or non-success reply never returns a database success', async () => {
  const { query: { postStagingGeneration23DatabaseSql: post }, prepare } = await fixture()
  const controller = new AbortController()
  const stalled = fakeRequest({ stall: true })
  const pending = post(prepare('SETUP'), { action: 'SETUP', token,
    signal: controller.signal, request: stalled.request })
  controller.abort()
  await assert.rejects(pending, /unavailable/)
  assert.equal(stalled.calls.length, 1)
  assert.equal(stalled.calls[0].req.destroyed, true)
  const rejected = fakeRequest({ status: 403 })
  await assert.rejects(post(prepare('SHUTDOWN'), { action: 'SHUTDOWN', token,
    signal: new AbortController().signal, request: rejected.request }), /unavailable/)
  assert.equal(rejected.calls.length, 1)
})

test('cancellation destroys a partial or late response and cannot return success', async () => {
  const { query: { postStagingGeneration23DatabaseSql: post }, prepare } = await fixture()
  const controller = new AbortController()
  const partial = fakeRequest({ partial: true })
  const pending = post(prepare('RETIRE'), { action: 'RETIRE', token,
    signal: controller.signal, request: partial.request })
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(partial.calls[0].response)
  controller.abort()
  partial.calls[0].response.emit('end')
  await assert.rejects(pending, /unavailable/)
  assert.equal(partial.calls[0].req.destroyed, true)
  assert.equal(partial.calls[0].response.destroyed, true)

  const lateController = new AbortController()
  const late = fakeRequest()
  const latePending = post(prepare('SHUTDOWN'), { action: 'SHUTDOWN', token,
    signal: lateController.signal, request: late.request })
  lateController.abort()
  await assert.rejects(latePending, /unavailable/)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(late.calls[0].response.destroyed, true)
})
