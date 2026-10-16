import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { EventEmitter } from 'node:events'
import { postStagingGeneration22RecoverySql } from '../scripts/staging-generation-22-recovery-query.mjs'

const token = Buffer.from(`sbp_${'a'.repeat(40)}`)
const receipt = { status: 'PASS_RETIRED', recoveryId: 'tll-staging-generation-22-recovery/v1',
  projectRef: 'qdmvngjwkcsilzmqksme', generation: 22,
  windowId: '9a539def-bf3c-442c-bf06-c4bd1df39543',
  expiresAt: '2026-09-26T10:50:00.000Z', controlsEnabled: false, runtimeCount: 5 }
const rows = [{ tll_generation_22_recovery_receipt: receipt }]
async function armedFixture() {
  const scripts = new URL('../scripts/', import.meta.url)
  let credentials = await readFile(new URL('staging-generation-22-credentials.mjs', scripts), 'utf8')
  credentials = credentials
    .replace('export const STAGING_GENERATION_22_CREDENTIALS_ENABLED = false',
      'export const STAGING_GENERATION_22_CREDENTIALS_ENABLED = true')
    .replace("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
      "export const ACTIVE_WINDOW_EXPIRES_AT = '2026-09-26T10:50:00.000Z'")
    .replaceAll("from './", `from '${scripts.href}`)
  const credentialUrl = `data:text/javascript;base64,${Buffer.from(credentials).toString('base64')}`
  const recovery = (await readFile(new URL('staging-generation-22-recovery.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_22_RECOVERY_ENABLED = false',
      'export const STAGING_GENERATION_22_RECOVERY_ENABLED = true')
    .replace("from './staging-generation-22-credentials.mjs'", `from '${credentialUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  const recoveryUrl = `data:text/javascript;base64,${Buffer.from(recovery).toString('base64')}`
  const recoveryModule = await import(recoveryUrl)
  const source = (await readFile(new URL('staging-generation-22-recovery-query.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_22_RECOVERY_QUERY_ENABLED = false',
      'export const STAGING_GENERATION_22_RECOVERY_QUERY_ENABLED = true')
    .replace("from './staging-generation-22-recovery.mjs'", `from '${recoveryUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  return { transport: await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`),
    prepare: () => recoveryModule.prepareStagingGeneration22RecoverySql({ expiresAt: '2026-09-26T10:50:00.000Z' }),
    expectedSql: recoveryModule.buildStagingGeneration22RecoverySql({ expiresAt: '2026-09-26T10:50:00.000Z' }) }
}
function fakeRequest({ status = 201, payload = rows, stall = false, partial = false, headers = {} } = {}) {
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
        res.headers = { 'content-type': 'application/json', ...headers }
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

test('recovery query transport stays disconnected by default', async () => {
  await assert.rejects(postStagingGeneration22RecoverySql(null,
    { token, signal: new AbortController().signal, request: () => {} }), /unavailable/)
})

test('synthetic recovery transport pins Supabase staging target, request and bounded response', async () => {
  const { transport: { postStagingGeneration22RecoverySql: post }, prepare, expectedSql } = await armedFixture()
  const packet = prepare()
  const fake = fakeRequest()
  const result = await post(packet, { token, signal: new AbortController().signal, request: fake.request })
  assert.deepEqual(result, rows)
  assert.equal(fake.calls.length, 1)
  assert.equal(fake.calls[0].options.hostname, 'api.supabase.com')
  assert.equal(fake.calls[0].options.path, '/v1/projects/qdmvngjwkcsilzmqksme/database/query')
  assert.equal(fake.calls[0].options.method, 'POST')
  assert.equal(fake.calls[0].options.rejectUnauthorized, true)
  assert.equal(JSON.parse(fake.calls[0].body.toString('utf8')).read_only, false)
  assert.equal(JSON.parse(fake.calls[0].body.toString('utf8')).query, expectedSql)
  assert.equal(fake.calls[0].req.destroyed, false)
})

test('abort destroys the in-flight request and cannot return success', async () => {
  const { transport: { postStagingGeneration22RecoverySql: post }, prepare } = await armedFixture()
  const fake = fakeRequest({ stall: true })
  const controller = new AbortController()
  const pending = post(prepare(), { token, signal: controller.signal, request: fake.request })
  controller.abort()
  await assert.rejects(pending, /unavailable/)
  assert.equal(fake.calls.length, 1)
  assert.equal(fake.calls[0].req.destroyed, true)
})

test('abort after response starts destroys both sides and rejects late success', async () => {
  const { transport: { postStagingGeneration22RecoverySql: post }, prepare } = await armedFixture()
  const fake = fakeRequest({ partial: true })
  const controller = new AbortController()
  const pending = post(prepare(), { token, signal: controller.signal, request: fake.request })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(fake.calls.length, 1)
  assert.ok(fake.calls[0].response)
  controller.abort()
  fake.calls[0].response.emit('end')
  await assert.rejects(pending, /unavailable/)
  assert.equal(fake.calls[0].req.destroyed, true)
  assert.equal(fake.calls[0].response.destroyed, true)
})

test('bad status, oversized body and incorrect retirement receipts fail closed', async () => {
  const { transport: { postStagingGeneration22RecoverySql: post }, prepare } = await armedFixture()
  for (const setup of [{ status: 403 }, { headers: { 'content-length': '65537' } },
    { payload: { wrong: true } }, { payload: [{}] }, { payload: [{ wrong: receipt }] },
    { payload: [{ tll_generation_22_recovery_receipt: { ...receipt, controlsEnabled: true } }] }]) {
    const fake = fakeRequest(setup)
    await assert.rejects(post(prepare(), { token, signal: new AbortController().signal, request: fake.request }), /unavailable/)
    assert.equal(fake.calls.length, 1)
    assert.equal(fake.calls[0].req.destroyed, true)
  }
})

test('edited SQL and copied packets cannot reach Supabase', async () => {
  const { transport: { postStagingGeneration22RecoverySql: post }, prepare, expectedSql } = await armedFixture()
  for (const extra of ['SELECT 123;', 'ALTER ROLE postgres SUPERUSER;', 'COMMIT; BEGIN;']) {
    const packet = prepare(), fake = fakeRequest()
    await assert.rejects(post({ ...packet, sql: expectedSql.replace('COMMIT;', `${extra}\nCOMMIT;`) },
      { token, signal: new AbortController().signal, request: fake.request }), /unavailable/)
    assert.equal(fake.calls.length, 0)
  }
  const packet = prepare(), fake = fakeRequest()
  assert.deepEqual(Object.keys(packet), [])
  await assert.rejects(post({ ...packet }, { token, signal: new AbortController().signal, request: fake.request }), /unavailable/)
  assert.equal(fake.calls.length, 0)
  await post(packet, { token, signal: new AbortController().signal, request: fake.request })
  await assert.rejects(post(packet, { token, signal: new AbortController().signal, request: fake.request }), /unavailable/)
  assert.equal(fake.calls.length, 1)
})
