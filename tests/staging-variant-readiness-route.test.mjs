import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const fixturePlugin = {
  name: 'fixed-test-dependencies',
  setup(plugin) {
    plugin.onResolve({ filter: /^next\/server$/ }, () => ({ path: 'next/server', namespace: 'fixture' }))
    plugin.onResolve({ filter: /^@\/lib\/commerce\/staging-cart-storefront$/ }, () => ({ path: 'storefront', namespace: 'fixture' }))
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'next/server'
      ? 'export const NextResponse = { json: (body, options) => Response.json(body, options) }'
      : `export const STAGING_CART_SHOP = 'tll-integration-staging.myshopify.com';
         export const STAGING_SHOPIFY_VARIANT = 'gid://shopify/ProductVariant/57160491139412';
         export const createStagingStorefront = options => {
           if (options.shop !== STAGING_CART_SHOP || options.privateToken !== 'synthetic-secret') throw Error('wrong config');
           return { readVariantPrice: () => globalThis.__tllReadPrice() };
         }` }))
  },
}
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../app/api/staging/variant-readiness/route.ts', import.meta.url))],
  bundle: true, platform: 'node', format: 'esm', write: false, plugins: [fixturePlugin],
})
const { GET } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)
const env = {
  NEXT_PUBLIC_TLL_ENVIRONMENT: 'staging', VERCEL: '1', VERCEL_ENV: 'preview',
  TLL_STAGING_SUPABASE_PROJECT_REF: 'qdmvngjwkcsilzmqksme',
  VERCEL_GIT_COMMIT_REF: 'codex/tll-integration', VERCEL_DEPLOYMENT_ID: 'dpl_fixed123',
  VERCEL_URL: 'fixed-123.vercel.app', TLL_STAGING_CART_SHOP: 'tll-integration-staging.myshopify.com',
  TLL_STAGING_CART_STOREFRONT_TOKEN: 'synthetic-secret',
}
const request = id => new Request('https://fixed-123.vercel.app/api/staging/variant-readiness',
  { headers: { 'x-tll-deployment-id': id } })

test('held Preview reads one fixed Shopify staging price without activating cart', async () => {
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]))
  let reads = 0
  Object.assign(process.env, env)
  globalThis.__tllReadPrice = async () => { reads++; return 1299 }
  try {
    const result = await GET(request('dpl_fixed123'))
    assert.equal(result.status, 200)
    assert.equal(result.headers.get('Cache-Control'), 'private, no-store')
    const body = await result.json()
    assert.deepEqual(Object.keys(body).sort(), ['deploymentId', 'immutableUrl', 'observedAt',
      'pricePence', 'status', 'variantId'])
    assert.equal(body.pricePence, 1299)
    assert.equal(body.deploymentId, 'dpl_fixed123')
    assert.equal(reads, 1)
    assert.equal(process.env.TLL_STAGING_CART_ENABLED, undefined)
    assert.equal((await GET(request('dpl_other'))).status, 404)
    assert.equal(reads, 1)
    process.env.VERCEL_ENV = 'production'
    assert.equal((await GET(request('dpl_fixed123'))).status, 404)
    assert.equal(reads, 1)
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    delete globalThis.__tllReadPrice
  }
})
