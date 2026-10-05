import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createStagingGeneration23CheckoutReadinessReader } from '../scripts/staging-generation-23-checkout-readiness-reader.mjs'

const deploymentId = 'dpl_checkout123'
const immutableUrl = 'https://tll-checkout-123.vercel.app'
const bypass = Buffer.from('offline-bypass-token')
const signal = new AbortController().signal
const body = enabled => ({ deploymentId, immutableUrl, projectRef: 'qdmvngjwkcsilzmqksme',
  branch: 'codex/tll-integration', checkoutHandoffEnabled: enabled })
const response = value => new Response(JSON.stringify(value), { status: 200,
  headers: { 'content-type': 'application/json' } })

async function armed() {
  const root = new URL('../scripts/', import.meta.url)
  const source = await readFile(new URL('staging-generation-23-checkout-readiness-reader.mjs', root), 'utf8')
  const enabled = source.replace('STAGING_GENERATION_23_CHECKOUT_READINESS_READER_ENABLED = false',
    'STAGING_GENERATION_23_CHECKOUT_READINESS_READER_ENABLED = true')
    .replaceAll("from './", `from '${root.href}`)
  assert.notEqual(enabled, source)
  return import(`data:text/javascript;base64,${Buffer.from(enabled).toString('base64')}`)
}

test('ordinary source refuses protected Preview access', () => {
  assert.throws(() => createStagingGeneration23CheckoutReadinessReader({ fetch: async () => response(body(false)),
    bypass, deploymentId, immutableUrl }), /unavailable/)
})

test('one protected immutable GET proves ON or OFF with exact deployment identity', async () => {
  const { createStagingGeneration23CheckoutReadinessReader: create } = await armed()
  for (const expected of [false, true]) {
    let calls = 0
    const reader = create({ bypass, deploymentId, immutableUrl, fetch: async (url, options) => {
      calls++
      assert.equal(url, `${immutableUrl}/api/staging/checkout-readiness`)
      assert.equal(options.method, 'GET')
      assert.equal(options.redirect, 'error')
      assert.equal(options.headers['x-tll-deployment-id'], deploymentId)
      assert.equal(options.headers['x-vercel-protection-bypass'], 'offline-bypass-token')
      return response(body(expected))
    } })
    assert.deepEqual(await reader.read({ expected, signal }), { status: 'CHECKOUT_RUNTIME_VERIFIED',
      deploymentId, immutableUrl, checkoutHandoffEnabled: expected })
    await assert.rejects(reader.read({ expected, signal }), /unavailable/)
    assert.equal(calls, 1)
    reader.dispose()
  }
})

test('wrong branch, project, deployment or switch state cannot be called verified', async () => {
  const { createStagingGeneration23CheckoutReadinessReader: create } = await armed()
  const wrong = [{ branch: 'main' }, { projectRef: 'wrhgscovsgsudtedbljr' },
    { deploymentId: 'dpl_other' }, { checkoutHandoffEnabled: true }, { unexpected: true }]
  for (const fields of wrong) {
    const reader = create({ bypass, deploymentId, immutableUrl,
      fetch: async () => response({ ...body(false), ...fields }) })
    await assert.rejects(reader.read({ expected: false, signal }), /unavailable/)
    reader.dispose()
  }
  assert.throws(() => create({ bypass, deploymentId, immutableUrl: 'https://example.com',
    fetch: async () => response(body(false)) }), /unavailable/)
})

test('a lost or oversized reply consumes the one permitted read', async () => {
  const { createStagingGeneration23CheckoutReadinessReader: create } = await armed()
  for (const fetcher of [async () => { throw Error('lost') },
    async () => response({ ...body(false), filler: 'x'.repeat(5000) })]) {
    let calls = 0
    const reader = create({ bypass, deploymentId, immutableUrl,
      fetch: async (...args) => { calls++; return fetcher(...args) } })
    await assert.rejects(reader.read({ expected: false, signal }))
    await assert.rejects(reader.read({ expected: false, signal }), /unavailable/)
    assert.equal(calls, 1)
    reader.dispose()
  }
})
