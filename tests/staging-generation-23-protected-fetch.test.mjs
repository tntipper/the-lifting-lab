import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { STAGING_ALIAS } from '../scripts/staging-surface-activation-transport.mjs'
import { createStagingGeneration23ProtectedFetch } from '../scripts/staging-generation-23-protected-fetch.mjs'

const immutableUrl = 'https://tll-verified-123.vercel.app'
const bypass = Buffer.from('offline-bypass-token')
const signal = new AbortController().signal
const ok = () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })

async function armed () {
  const root = new URL('../scripts/', import.meta.url)
  const source = await readFile(new URL('staging-generation-23-protected-fetch.mjs', root), 'utf8')
  const enabled = source.replace('STAGING_GENERATION_23_PROTECTED_FETCH_ENABLED = false',
    'STAGING_GENERATION_23_PROTECTED_FETCH_ENABLED = true').replaceAll("from './", `from '${root.href}`)
  assert.notEqual(enabled, source)
  return import(`data:text/javascript;base64,${Buffer.from(enabled).toString('base64')}`)
}

test('ordinary source never constructs a protected transport', () => {
  assert.throws(() => createStagingGeneration23ProtectedFetch({ fetch: async () => ok(), bypass, immutableUrl }), /unavailable/)
})

test('only the exact immutable Preview and fixed branch alias receive the bypass for GET/HEAD readiness reads', async () => {
  const { createStagingGeneration23ProtectedFetch: create } = await armed()
  const calls = []
  const guarded = create({ bypass, immutableUrl, fetch: async (url, options) => {
    calls.push({ url, options }); return ok(url)
  } })
  const response = await guarded.fetch(`${immutableUrl}/api/staging/readiness`, { method: 'GET', headers: {
    'x-tll-deployment-id': 'dpl_demo123', authorization: 'caller-secret', 'x-vercel-protection-bypass': 'caller-bypass' }, signal })
  await guarded.fetch(`${STAGING_ALIAS}/api/staging/checkout-readiness`, { method: 'HEAD', signal })
  await guarded.fetch(`${immutableUrl}/api/staging/variant-readiness`, { method: 'GET', signal })
  assert.equal(calls.length, 3)
  for (const call of calls) {
    assert.equal(call.options.redirect, 'error')
    assert.equal(call.options.credentials, 'omit')
    assert.equal(call.options.headers.get('x-vercel-protection-bypass'), bypass.toString())
    assert.equal(call.options.headers.get('authorization'), null)
  }
  assert.equal(calls[0].options.headers.get('x-tll-deployment-id'), 'dpl_demo123')
  assert.equal(await response.text(), '{}')
  guarded.dispose()
})

test('the consumer check is allowed only on the fixed protected Preview path', async () => {
  const { createStagingGeneration23ProtectedFetch: create } = await armed()
  const calls = []
  const guarded = create({ bypass, immutableUrl, fetch: async (url) => {
    calls.push(url); return ok()
  } })
  await guarded.fetch(`${immutableUrl}/api/staging/consumer-readiness`, { method: 'GET', signal })
  assert.deepEqual(calls, [`${immutableUrl}/api/staging/consumer-readiness`])
  await assert.rejects(() => guarded.fetch(`${immutableUrl}/api/staging/consumer-readiness?sql=SELECT`,
    { method: 'GET', signal }), /unavailable/)
  guarded.dispose()
})

test('a streaming response remains readable after the protected request has been closed', async () => {
  const { createStagingGeneration23ProtectedFetch: create } = await armed()
  const bytes = new TextEncoder().encode('{"ready":true}')
  const stream = new ReadableStream({
    start (controller) { controller.enqueue(bytes); controller.close() },
  })
  const guarded = create({ bypass, immutableUrl, fetch: async (_url, options) => {
    assert.equal(options.headers.get('x-vercel-protection-bypass'), bypass.toString())
    return new Response(stream, { status: 200, headers: { 'content-type': 'application/json' } })
  } })
  const response = await guarded.fetch(`${immutableUrl}/api/staging/readiness`, { signal })
  assert.deepEqual(await response.json(), { ready: true })
  guarded.dispose()
})

test('arbitrary hosts, Vercel API, Shopify, unsafe verbs, redirects and query substitutions are refused before transport', async () => {
  const { createStagingGeneration23ProtectedFetch: create } = await armed()
  let calls = 0
  const guarded = create({ bypass, immutableUrl, fetch: async () => { calls++; return ok() } })
  const blocked = [
    ['https://api.vercel.com/v9/projects', { method: 'GET' }],
    ['https://tll-integration-staging.myshopify.com/api/2024-01/graphql.json', { method: 'GET' }],
    [`${immutableUrl}/api/staging/readiness?redirect=https://attacker.invalid`, { method: 'GET' }],
    [`${immutableUrl}/api/staging/readiness`, { method: 'POST' }],
    [`${immutableUrl}/anything-else`, { method: 'GET' }],
  ]
  for (const [url, options] of blocked) await assert.rejects(guarded.fetch(url, { ...options, signal }), /unavailable/)
  assert.equal(calls, 0)
  const redirecting = create({ bypass, immutableUrl, fetch: async () => ({ redirected: true, url: 'https://attacker.invalid', body: { cancel: async () => {} } }) })
  await assert.rejects(redirecting.fetch(`${immutableUrl}/api/staging/readiness`, { signal }), /unavailable/)
  guarded.dispose(); redirecting.dispose()
})

test('aborted and exhausted transports fail closed and wipe their private bypass copy on disposal', async () => {
  const { createStagingGeneration23ProtectedFetch: create } = await armed()
  const controller = new AbortController(); controller.abort()
  const guarded = create({ bypass, immutableUrl, maxReads: 1, fetch: async () => ok() })
  await assert.rejects(guarded.fetch(`${immutableUrl}/api/staging/readiness`, { signal: controller.signal }), /unavailable/)
  const second = create({ bypass, immutableUrl, maxReads: 1, fetch: async () => ok() })
  await second.fetch(`${immutableUrl}/api/staging/readiness`, { signal })
  await assert.rejects(second.fetch(`${immutableUrl}/api/staging/readiness`, { signal }), /unavailable/)
  second.dispose()
  await assert.rejects(second.fetch(`${immutableUrl}/api/staging/readiness`, { signal }), /unavailable/)

  const duringRead = new AbortController()
  const interrupted = create({ bypass, immutableUrl, fetch: async (_url, options) => new Promise(resolve => {
    if (options.signal.aborted) resolve(ok())
    else options.signal.addEventListener('abort', () => resolve(ok()), { once: true })
  }) })
  const pending = interrupted.fetch(`${immutableUrl}/api/staging/readiness`, { signal: duringRead.signal })
  duringRead.abort()
  await assert.rejects(pending, /unavailable/)
  await assert.rejects(interrupted.fetch(`${immutableUrl}/api/staging/readiness`, { signal }), /unavailable/)
})
