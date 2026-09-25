import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BROKER_SECRET_NAME, STAGING_PROVIDER_TARGET } from '../scripts/staging-provider-broker-rotation.mjs'
import { createStagingProviderBrokerSupabaseRestHost, STAGING_BROKER_SUPABASE_REST_HOST_ENABLED } from '../scripts/staging-provider-broker-supabase-rest-host.mjs'

const token = Buffer.from('fixture-supabase-token')
const material = Buffer.from('b'.repeat(48))
const signal = new AbortController().signal
const response = (body, status) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

test('fixed Supabase request creates and deletes exactly one staging secret', async () => {
  assert.equal(STAGING_BROKER_SUPABASE_REST_HOST_ENABLED, false)
  const calls = []
  const host = createStagingProviderBrokerSupabaseRestHost({ managementToken: token,
    stopWorkerGroup() { throw Error('must not stop') },
    async fetch(url, options) {
      calls.push({ url, options })
      if (options.method === 'GET') return response(calls.length > 2
        ? [{ name: 'OTHER_STAGING_SECRET' }, { name: BROKER_SECRET_NAME }]
        : [{ name: 'OTHER_STAGING_SECRET' }], 200)
      if (options.method === 'POST') return new Response(null, { status: 201 })
      if (options.method === 'DELETE') return response({}, 200)
      throw Error('unexpected')
    } })
  assert.deepEqual(await host.readNames(STAGING_PROVIDER_TARGET, { signal }), [])
  assert.equal((await host.stage(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, material, { signal })).status, 'STAGED')
  assert.equal(calls[1].url, 'https://api.supabase.com/v1/projects/qdmvngjwkcsilzmqksme/secrets')
  assert.equal(calls[1].options.redirect, 'error')
  assert.deepEqual(JSON.parse(calls[1].options.body), [{ name: BROKER_SECRET_NAME, value: material.toString() }])
  assert.deepEqual(await host.readNames(STAGING_PROVIDER_TARGET, { signal }), [BROKER_SECRET_NAME])
  assert.equal((await host.remove(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, { signal })).status, 'REMOVED')
  assert.equal(calls[3].options.method, 'DELETE')
  assert.deepEqual(JSON.parse(calls[3].options.body), [BROKER_SECRET_NAME])
  host.dispose()
})

test('uncertain create response stops worker and cannot trigger removal', async () => {
  let stops = 0
  let deletes = 0
  const host = createStagingProviderBrokerSupabaseRestHost({ managementToken: token,
    stopWorkerGroup() { stops++ },
    async fetch(_url, options) {
      if (options.method === 'POST') return response({ error: 'unexpected' }, 201)
      if (options.method === 'DELETE') deletes++
      throw Error('unexpected')
    } })
  const pending = host.stage(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, material, { signal })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(stops, 1)
  await assert.rejects(host.remove(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, { signal }))
  assert.equal(deletes, 0)
  assert.equal(await Promise.race([pending.then(() => 'SETTLED', () => 'SETTLED'),
    new Promise(resolve => setTimeout(() => resolve('PENDING'), 5))]), 'PENDING')
  host.dispose()
})

test('abort of non-settling Supabase mutation stops worker without settling its write', async () => {
  const controller = new AbortController()
  let stops = 0
  const host = createStagingProviderBrokerSupabaseRestHost({ managementToken: token,
    stopWorkerGroup() { stops++ }, async fetch() { return new Promise(() => {}) } })
  const pending = host.stage(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, material, { signal: controller.signal })
  controller.abort()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(stops, 1)
  assert.equal(await Promise.race([pending.then(() => 'SETTLED', () => 'SETTLED'),
    new Promise(resolve => setTimeout(() => resolve('PENDING'), 5))]), 'PENDING')
  host.dispose()
})

test('wrong target and invalid material make no Supabase write', async () => {
  let calls = 0
  const host = createStagingProviderBrokerSupabaseRestHost({ managementToken: token,
    stopWorkerGroup() { throw Error('must not stop') }, async fetch() { calls++ } })
  await assert.rejects(host.stage({ ...STAGING_PROVIDER_TARGET, projectRef: 'wrong' }, BROKER_SECRET_NAME, material, { signal }))
  await assert.rejects(host.stage(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, Buffer.from('short'), { signal }))
  assert.equal(calls, 0)
  host.dispose()
})

test('concurrent stage and remove cannot overtake a pending create acknowledgement', async () => {
  let creates = 0
  let deletes = 0
  let finishCreate
  const creation = new Promise(resolve => { finishCreate = resolve })
  const host = createStagingProviderBrokerSupabaseRestHost({ managementToken: token,
    stopWorkerGroup() { throw Error('must not stop') }, async fetch(_url, options) {
      if (options.method === 'POST') { creates++; return creation }
      if (options.method === 'DELETE') { deletes++; return response({}, 200) }
      throw Error('unexpected')
    } })
  const first = host.stage(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, material, { signal })
  await assert.rejects(host.stage(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, material, { signal }))
  await assert.rejects(host.remove(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, { signal }))
  assert.equal(creates, 1)
  assert.equal(deletes, 0)
  finishCreate(new Response(null, { status: 201 }))
  assert.equal((await first).status, 'STAGED')
  host.dispose()
})

test('a malformed DELETE success body leaves removal uncertain', async () => {
  let stops = 0
  const host = createStagingProviderBrokerSupabaseRestHost({ managementToken: token,
    stopWorkerGroup() { stops++ }, async fetch(_url, options) {
      return options.method === 'POST' ? new Response(null, { status: 201 }) : response({ error: 'unexpected' }, 200)
    } })
  await host.stage(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, material, { signal })
  const pending = host.remove(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, { signal })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(stops, 1)
  assert.equal(await Promise.race([pending.then(() => 'SETTLED', () => 'SETTLED'),
    new Promise(resolve => setTimeout(() => resolve('PENDING'), 5))]), 'PENDING')
  host.dispose()
})

test('abort of a stalled Supabase response body stops the worker', async () => {
  const controller = new AbortController()
  let stops = 0
  const host = createStagingProviderBrokerSupabaseRestHost({ managementToken: token,
    stopWorkerGroup() { stops++ }, async fetch() {
      return { status: 201, headers: { get: () => null }, body: {
        getReader() { return { read: () => new Promise(() => {}), cancel: () => new Promise(() => {}), releaseLock() {} } },
        cancel() {},
      } }
    } })
  const pending = host.stage(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, material, { signal: controller.signal })
  await new Promise(resolve => setImmediate(resolve))
  controller.abort()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(stops, 1)
  assert.equal(await Promise.race([pending.then(() => 'SETTLED', () => 'SETTLED'),
    new Promise(resolve => setTimeout(() => resolve('PENDING'), 5))]), 'PENDING')
  host.dispose()
})

test('concurrent Supabase removals dispatch only one DELETE', async () => {
  let deletes = 0
  let finishDelete
  const deletion = new Promise(resolve => { finishDelete = resolve })
  const host = createStagingProviderBrokerSupabaseRestHost({ managementToken: token,
    stopWorkerGroup() { throw Error('must not stop') }, async fetch(_url, options) {
      if (options.method === 'POST') return new Response(null, { status: 201 })
      if (options.method === 'DELETE') { deletes++; return deletion }
      throw Error('unexpected')
    } })
  await host.stage(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, material, { signal })
  const first = host.remove(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, { signal })
  await assert.rejects(host.remove(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, { signal }))
  assert.equal(deletes, 1)
  finishDelete(new Response(null, { status: 200 }))
  assert.equal((await first).status, 'REMOVED')
  host.dispose()
})
