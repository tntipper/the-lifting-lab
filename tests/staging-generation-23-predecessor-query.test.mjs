import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { EventEmitter } from 'node:events'
import { postStagingGeneration23PredecessorCheck } from '../scripts/staging-generation-23-predecessor-query.mjs'

const token = Buffer.from(`sbp_${'a'.repeat(40)}`)
const receipt = { status: 'PASS_RETIRED', queryId: 'tll-staging-generation-23-predecessor-check/v1',
  projectRef: 'qdmvngjwkcsilzmqksme', generation: 23,
  windowId: 'b04834a8-89a7-4f3f-b941-623c925786d5',
  expiresAt: '2026-09-28T13:00:00.000Z', controlsEnabled: false, runtimeCount: 5, runtimeSessions: 0 }
const rows = [{ tll_generation_23_predecessor_check: receipt }]
async function armedFixture() {
  const scripts = new URL('../scripts/', import.meta.url)
  const retired = (await readFile(new URL('staging-generation-23-predecessor-check.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_23_PREDECESSOR_CHECK_ENABLED = false',
      'export const STAGING_GENERATION_23_PREDECESSOR_CHECK_ENABLED = true')
    .replaceAll("from './", `from '${scripts.href}`)
  const retiredUrl = `data:text/javascript;base64,${Buffer.from(retired).toString('base64')}`
  const retiredModule = await import(retiredUrl)
  const source = (await readFile(new URL('staging-generation-23-predecessor-query.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_23_PREDECESSOR_QUERY_ENABLED = false',
      'export const STAGING_GENERATION_23_PREDECESSOR_QUERY_ENABLED = true')
    .replace("from './staging-generation-23-predecessor-check.mjs'", `from '${retiredUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  return { transport: await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`),
    expectedSql: retiredModule.buildStagingGeneration23PredecessorCheckSql() }
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

test('predecessor check transport stays disconnected by default', async () => {
  await assert.rejects(postStagingGeneration23PredecessorCheck(
    { token, signal: new AbortController().signal, request: () => {} }), /unavailable/)
})

test('synthetic predecessor check transport pins Supabase staging target, request and bounded response', async () => {
  const { transport: { postStagingGeneration23PredecessorCheck: post }, expectedSql } = await armedFixture()
  const fake = fakeRequest()
  const result = await post({ token, signal: new AbortController().signal, request: fake.request })
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
  const { transport: { postStagingGeneration23PredecessorCheck: post } } = await armedFixture()
  const fake = fakeRequest({ stall: true })
  const controller = new AbortController()
  const pending = post({ token, signal: controller.signal, request: fake.request })
  controller.abort()
  await assert.rejects(pending, /unavailable/)
  assert.equal(fake.calls.length, 1)
  assert.equal(fake.calls[0].req.destroyed, true)
})

test('abort after response starts destroys both sides and rejects late success', async () => {
  const { transport: { postStagingGeneration23PredecessorCheck: post } } = await armedFixture()
  const fake = fakeRequest({ partial: true })
  const controller = new AbortController()
  const pending = post({ token, signal: controller.signal, request: fake.request })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(fake.calls.length, 1)
  assert.ok(fake.calls[0].response)
  controller.abort()
  fake.calls[0].response.emit('end')
  await assert.rejects(pending, /unavailable/)
  assert.equal(fake.calls[0].req.destroyed, true)
  assert.equal(fake.calls[0].response.destroyed, true)
})

test('bad status, oversized body and incorrect predecessor receipts fail closed', async () => {
  const { transport: { postStagingGeneration23PredecessorCheck: post } } = await armedFixture()
  for (const setup of [{ status: 403 }, { headers: { 'content-length': '65537' } },
    { payload: { wrong: true } }, { payload: [{}] }, { payload: [{ wrong: receipt }] },
    { payload: [{ tll_generation_23_predecessor_check: { ...receipt, controlsEnabled: true } }] }]) {
    const fake = fakeRequest(setup)
    await assert.rejects(post({ token, signal: new AbortController().signal, request: fake.request }), /unavailable/)
    assert.equal(fake.calls.length, 1)
    assert.equal(fake.calls[0].req.destroyed, true)
  }
})
