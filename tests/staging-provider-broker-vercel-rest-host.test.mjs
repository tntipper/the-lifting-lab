import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BROKER_SECRET_NAME, STAGING_PROVIDER_TARGET } from '../scripts/staging-provider-broker-rotation.mjs'
import { createStagingProviderBrokerVercelRestHost, STAGING_BROKER_VERCEL_REST_HOST_ENABLED } from '../scripts/staging-provider-broker-vercel-rest-host.mjs'

const token = Buffer.from('fixture-vercel-token')
const material = Buffer.from('a'.repeat(48))
const signal = new AbortController().signal
const response = (body, status) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const present = present => ({ envs: present ? [{ key: BROKER_SECRET_NAME, gitBranch: STAGING_PROVIDER_TARGET.branch,
  target: ['preview'], type: 'sensitive' }] : [] })
const created = { created: { id: 'icfg_fixture1234', key: BROKER_SECRET_NAME, gitBranch: STAGING_PROVIDER_TARGET.branch,
  target: ['preview'], type: 'sensitive', visibility: 'secret' }, failed: [] }

test('fixed Vercel request creates a sensitive Preview-branch secret and removes only returned ID', async () => {
  assert.equal(STAGING_BROKER_VERCEL_REST_HOST_ENABLED, false)
  const calls = []
  const host = createStagingProviderBrokerVercelRestHost({ vercelToken: token, stopWorkerGroup() { throw Error('must not stop') },
    async fetch(url, options) {
      calls.push({ url, options })
      if (options.method === 'GET') return response(present(calls.length > 2), 200, url)
      if (options.method === 'POST') return response(created, 201, url)
      if (options.method === 'DELETE') return response([{ id: created.created.id, key: BROKER_SECRET_NAME,
        gitBranch: STAGING_PROVIDER_TARGET.branch, target: ['preview'] }], 200, url)
      throw Error('unexpected')
    } })
  assert.deepEqual(await host.readNames(STAGING_PROVIDER_TARGET, { signal }), [])
  assert.equal((await host.stage(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, material, { signal })).status, 'STAGED')
  assert.equal(calls[1].url, 'https://api.vercel.com/v10/projects/prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4/env?teamId=team_gf7cgIkkoeMLtODFDDT5MrW4')
  assert.deepEqual(JSON.parse(calls[1].options.body), { key: BROKER_SECRET_NAME, value: material.toString(),
    type: 'sensitive', visibility: 'secret', target: ['preview'], gitBranch: 'codex/tll-integration' })
  assert.equal(calls[1].options.redirect, 'error')
  assert.deepEqual(await host.readNames(STAGING_PROVIDER_TARGET, { signal }), [BROKER_SECRET_NAME])
  assert.equal((await host.remove(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, { signal })).status, 'REMOVED')
  assert.equal(calls[3].url, 'https://api.vercel.com/v9/projects/prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4/env/icfg_fixture1234?teamId=team_gf7cgIkkoeMLtODFDDT5MrW4')
  host.dispose()
})

test('a lost create acknowledgement stops the worker and never starts removal', async () => {
  let stops = 0
  let removes = 0
  const host = createStagingProviderBrokerVercelRestHost({ vercelToken: token, stopWorkerGroup() { stops++ },
    async fetch(_url, options) {
      if (options.method === 'POST') throw Error('connection lost after acceptance')
      if (options.method === 'DELETE') removes++
      return response(present(false), 200)
    } })
  const pending = host.stage(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, material, { signal })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(stops, 1)
  assert.equal(removes, 0)
  assert.equal(await Promise.race([pending.then(() => 'SETTLED', () => 'SETTLED'), Promise.resolve('PENDING')]), 'PENDING')
  host.dispose()
})

test('local target and material errors stop before any write', async () => {
  let calls = 0
  const host = createStagingProviderBrokerVercelRestHost({ vercelToken: token, stopWorkerGroup() { throw Error('must not stop') },
    async fetch() { calls++; throw Error('unexpected') } })
  await assert.rejects(host.stage({ ...STAGING_PROVIDER_TARGET, branch: 'main' }, BROKER_SECRET_NAME, material, { signal }))
  await assert.rejects(host.stage(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, Buffer.from('bad'), { signal }))
  assert.equal(calls, 0)
  host.dispose()
})

test('an aborted request that never replies stops the worker before cleanup', async () => {
  const controller = new AbortController()
  let stops = 0
  const host = createStagingProviderBrokerVercelRestHost({ vercelToken: token, stopWorkerGroup() { stops++ },
    async fetch() { return new Promise(() => {}) } })
  const pending = host.stage(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, material, { signal: controller.signal })
  await new Promise(resolve => setImmediate(resolve))
  controller.abort()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(stops, 1)
  assert.equal(await Promise.race([pending.then(() => 'SETTLED', () => 'SETTLED'),
    new Promise(resolve => setTimeout(() => resolve('PENDING'), 5))]), 'PENDING')
  host.dispose()
})

test('an aborted response body that never replies stops the worker before cleanup', async () => {
  const controller = new AbortController()
  let stops = 0
  const host = createStagingProviderBrokerVercelRestHost({ vercelToken: token, stopWorkerGroup() { stops++ },
    async fetch() { return { status: 201, headers: { get: () => null }, body: {
      getReader() { return { read: () => new Promise(() => {}), cancel: () => new Promise(() => {}), releaseLock() {} } },
      cancel() {},
    } } } })
  const pending = host.stage(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, material, { signal: controller.signal })
  await new Promise(resolve => setImmediate(resolve))
  controller.abort()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(stops, 1)
  assert.equal(await Promise.race([pending.then(() => 'SETTLED', () => 'SETTLED'),
    new Promise(resolve => setTimeout(() => resolve('PENDING'), 5))]), 'PENDING')
  host.dispose()
})

test('two concurrent removals cannot dispatch two DELETE requests', async () => {
  let deleteCalls = 0
  let finishDelete
  const deletion = new Promise(resolve => { finishDelete = resolve })
  const host = createStagingProviderBrokerVercelRestHost({ vercelToken: token, stopWorkerGroup() { throw Error('must not stop') },
    async fetch(url, options) {
      if (options.method === 'POST') return response(created, 201)
      if (options.method === 'DELETE') { deleteCalls++; return deletion }
      throw Error(`unexpected ${url}`)
    } })
  await host.stage(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, material, { signal })
  const first = host.remove(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, { signal })
  await assert.rejects(host.remove(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, { signal }))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(deleteCalls, 1)
  finishDelete(response({ id: created.created.id, key: BROKER_SECRET_NAME,
    gitBranch: STAGING_PROVIDER_TARGET.branch, target: ['preview'] }, 200))
  assert.equal((await first).status, 'REMOVED')
  host.dispose()
})

test('a misleading successful DELETE status without the exact deleted ID is uncertain', async () => {
  let stops = 0
  const host = createStagingProviderBrokerVercelRestHost({ vercelToken: token, stopWorkerGroup() { stops++ },
    async fetch(_url, options) {
      if (options.method === 'POST') return response(created, 201)
      if (options.method === 'DELETE') return response({ error: 'unexpected' }, 200)
      throw Error('unexpected')
    } })
  await host.stage(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, material, { signal })
  const pending = host.remove(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, { signal })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(stops, 1)
  assert.equal(await Promise.race([pending.then(() => 'SETTLED', () => 'SETTLED'),
    new Promise(resolve => setTimeout(() => resolve('PENDING'), 5))]), 'PENDING')
  host.dispose()
})
