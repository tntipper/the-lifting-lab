import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { EventEmitter } from 'node:events'
import { postStagingGeneration22ActiveCheck } from '../scripts/staging-generation-22-active-query.mjs'

const token = Buffer.from(`sbp_${'a'.repeat(40)}`)
const receipt = { status: 'PASS_ACTIVE', queryId: 'tll-staging-generation-22-active-check/v1',
  projectRef: 'qdmvngjwkcsilzmqksme', generation: 22,
  windowId: '9a539def-bf3c-442c-bf06-c4bd1df39543',
  expiresAt: '2026-09-26T10:50:00.000Z', controlsEnabled: false, runtimeCount: 5, runtimeSessions: 0 }
const rows = [{ tll_generation_22_active_check: receipt }]
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
  const active = (await readFile(new URL('staging-generation-22-active-check.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_22_ACTIVE_CHECK_ENABLED = false',
      'export const STAGING_GENERATION_22_ACTIVE_CHECK_ENABLED = true')
    .replace("from './staging-generation-22-credentials.mjs'", `from '${credentialUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  const activeUrl = `data:text/javascript;base64,${Buffer.from(active).toString('base64')}`
  const activeModule = await import(activeUrl)
  const source = (await readFile(new URL('staging-generation-22-active-query.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_22_ACTIVE_QUERY_ENABLED = false',
      'export const STAGING_GENERATION_22_ACTIVE_QUERY_ENABLED = true')
    .replace("from './staging-generation-22-active-check.mjs'", `from '${activeUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  return { transport: await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`),
    input: '2026-09-26T10:50:00.000Z',
    expectedSql: activeModule.buildStagingGeneration22ActiveCheckSql({ expiresAt: '2026-09-26T10:50:00.000Z' }) }
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

test('active check transport stays disconnected by default', async () => {
  await assert.rejects(postStagingGeneration22ActiveCheck(null,
    { token, signal: new AbortController().signal, request: () => {} }), /unavailable/)
})

test('synthetic active check transport pins Supabase staging target, request and bounded response', async () => {
  const { transport: { postStagingGeneration22ActiveCheck: post }, input, expectedSql } = await armedFixture()
  const fake = fakeRequest()
  const result = await post(input, { token, signal: new AbortController().signal, request: fake.request })
  assert.deepEqual(result, rows)
  assert.equal(fake.calls.length, 1)
  assert.equal(fake.calls[0].options.hostname, 'api.supabase.com')
  assert.equal(fake.calls[0].options.path, '/v1/projects/qdmvngjwkcsilzmqksme/database/query')
  assert.equal(fake.calls[0].options.method, 'POST')
  assert.equal(fake.calls[0].options.rejectUnauthorized, true)
  assert.equal(JSON.parse(fake.calls[0].body.toString('utf8')).read_only, false)
  assert.match(expectedSql, /^BEGIN READ ONLY;/)
  assert.equal(JSON.parse(fake.calls[0].body.toString('utf8')).query, expectedSql)
  assert.equal(fake.calls[0].req.destroyed, false)
})

test('abort destroys the in-flight request and cannot return success', async () => {
  const { transport: { postStagingGeneration22ActiveCheck: post }, input } = await armedFixture()
  const fake = fakeRequest({ stall: true })
  const controller = new AbortController()
  const pending = post(input, { token, signal: controller.signal, request: fake.request })
  controller.abort()
  await assert.rejects(pending, /unavailable/)
  assert.equal(fake.calls.length, 1)
  assert.equal(fake.calls[0].req.destroyed, true)
})

test('abort after response starts destroys both sides and rejects late success', async () => {
  const { transport: { postStagingGeneration22ActiveCheck: post }, input } = await armedFixture()
  const fake = fakeRequest({ partial: true })
  const controller = new AbortController()
  const pending = post(input, { token, signal: controller.signal, request: fake.request })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(fake.calls.length, 1)
  assert.ok(fake.calls[0].response)
  controller.abort()
  fake.calls[0].response.emit('end')
  await assert.rejects(pending, /unavailable/)
  assert.equal(fake.calls[0].req.destroyed, true)
  assert.equal(fake.calls[0].response.destroyed, true)
})

test('bad status, oversized body and incorrect active-state receipts fail closed', async () => {
  const { transport: { postStagingGeneration22ActiveCheck: post }, input } = await armedFixture()
  for (const setup of [{ status: 403 }, { headers: { 'content-length': '65537' } },
    { payload: { wrong: true } }, { payload: [{}] }, { payload: [{ wrong: receipt }] },
    { payload: [{ tll_generation_22_active_check: { ...receipt, controlsEnabled: true } }] }]) {
    const fake = fakeRequest(setup)
    await assert.rejects(post(input, { token, signal: new AbortController().signal, request: fake.request }), /unavailable/)
    assert.equal(fake.calls.length, 1)
    assert.equal(fake.calls[0].req.destroyed, true)
  }
})
