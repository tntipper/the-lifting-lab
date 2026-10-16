import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../scripts/staging-generation-23-variant-readiness-reader.mjs', import.meta.url), 'utf8')
const armed = await import(`data:text/javascript;base64,${Buffer.from(source
  .replace('STAGING_GENERATION_23_VARIANT_READINESS_READER_ENABLED = false',
    'STAGING_GENERATION_23_VARIANT_READINESS_READER_ENABLED = true')
  .replaceAll("from './", `from '${new URL('../scripts/', import.meta.url).href}`)).toString('base64')}`)

test('ordinary source refuses a variant read', async () => {
  const ordinary = await import('../scripts/staging-generation-23-variant-readiness-reader.mjs')
  assert.equal(ordinary.STAGING_GENERATION_23_VARIANT_READINESS_READER_ENABLED, false)
  assert.throws(() => ordinary.createStagingGeneration23VariantReadinessReader(), /unavailable/)
})

test('one protected fixed-variant read proves current amount and deployment', async () => {
  const now = Date.parse('2026-09-27T12:00:00.000Z')
  let reads = 0, disposed = false
  const reader = armed.createStagingGeneration23VariantReadinessReader({
    fetch: async () => assert.fail('raw network'), bypass: Buffer.from('private-bypass'),
    deploymentId: 'dpl_fixed123', immutableUrl: 'https://fixed-123.vercel.app', now: () => now,
    createProtected() { return {
      async fetch(url, options) {
        reads++
        assert.equal(url, 'https://fixed-123.vercel.app/api/staging/variant-readiness')
        assert.equal(options.method, 'GET')
        assert.equal(options.headers['x-tll-deployment-id'], 'dpl_fixed123')
        return new Response(JSON.stringify({ status: 'SHOPIFY_STAGING_VARIANT_PRICE_VERIFIED',
          deploymentId: 'dpl_fixed123', immutableUrl: 'https://fixed-123.vercel.app',
          variantId: armed.STAGING_VARIANT_ID, pricePence: 1299,
          observedAt: '2026-09-27T11:59:59.000Z' }), { status: 200, headers: { 'content-type': 'application/json' } })
      }, dispose() { disposed = true },
    } },
  })
  assert.deepEqual(await reader.read({ variantId: armed.STAGING_VARIANT_ID,
    signal: new AbortController().signal }), { status: 'SHOPIFY_STAGING_VARIANT_PRICE_VERIFIED',
    variantId: armed.STAGING_VARIANT_ID, pricePence: 1299, observedAt: '2026-09-27T11:59:59.000Z' })
  await assert.rejects(reader.read({ variantId: armed.STAGING_VARIANT_ID,
    signal: new AbortController().signal }), /unavailable/)
  assert.equal(reads, 1)
  reader.dispose(); assert.equal(disposed, true)
})

test('changed deployment or stale price never counts as the variant proof', async () => {
  for (const change of [
    { deploymentId: 'dpl_other' },
    { variantId: 'gid://shopify/ProductVariant/9' },
    { pricePence: 0 },
    { observedAt: '2026-09-27T11:50:00.000Z' },
  ]) {
    const reader = armed.createStagingGeneration23VariantReadinessReader({
      fetch: async () => assert.fail('raw network'), bypass: Buffer.from('private-bypass'),
      deploymentId: 'dpl_fixed123', immutableUrl: 'https://fixed-123.vercel.app',
      now: () => Date.parse('2026-09-27T12:00:00.000Z'),
      createProtected: () => ({ async fetch() { return new Response(JSON.stringify({
        status: 'SHOPIFY_STAGING_VARIANT_PRICE_VERIFIED', deploymentId: 'dpl_fixed123',
        immutableUrl: 'https://fixed-123.vercel.app', variantId: armed.STAGING_VARIANT_ID,
        pricePence: 1299, observedAt: '2026-09-27T11:59:59.000Z', ...change,
      }), { status: 200, headers: { 'content-type': 'application/json' } }) }, dispose() {} }),
    })
    await assert.rejects(reader.read({ variantId: armed.STAGING_VARIANT_ID,
      signal: new AbortController().signal }), /unavailable/)
    reader.dispose()
  }
})
