import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundle = await build({ entryPoints: ['lib/server/staging-consumer-readiness.ts'], bundle: true,
  platform: 'node', format: 'esm', packages: 'external', write: false, logLevel: 'silent' })
const { checkStagingWebsiteConsumers } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const purposes = ['customer', 'cart', 'provisional', 'bridge']
const env = Object.freeze({ VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'codex/tll-integration',
  TLL_STAGING_SUPABASE_PROJECT_REF: 'qdmvngjwkcsilzmqksme', TLL_STAGING_CUSTOMER_ENABLED: 'false',
  TLL_STAGING_CART_ENABLED: 'false', TLL_STAGING_CART_CHECKOUT_HANDOFF_ENABLED: 'false',
  TLL_STAGING_POSTGRES_CA_PEM: 'public-ca-fixture', TLL_STAGING_POSTGRES_CA_SHA256: 'a'.repeat(64),
  ...Object.fromEntries(purposes.map(purpose => [`TLL_STAGING_${purpose.toUpperCase()}_DATABASE_PASSWORD`, `SYNTHETIC_PRIVATE_${purpose}_${'x'.repeat(32)}`])),
})

test('the protected website check reads every supplied role and returns safe pass fields', async () => {
  const seen = [], closed = []
  const result = await checkStagingWebsiteConsumers(env, input => {
    assert.equal(input.password, env[`TLL_STAGING_${input.purpose.toUpperCase()}_DATABASE_PASSWORD`])
    assert.equal(input.tlsCa.pem, env.TLL_STAGING_POSTGRES_CA_PEM)
    seen.push(input.purpose)
    return { pool: { async connect() { return { async query(sql) {
      assert.equal(sql, 'SELECT current_user::text AS role')
      return { rows: [{ role: `tll_${input.purpose}_runtime` }] }
    }, release() {} } } }, async close() { closed.push(input.purpose) } }
  })
  assert.deepEqual(seen, purposes)
  assert.deepEqual(closed, purposes)
  assert.equal(result.status, 'PASS')
  assert.ok(purposes.every(purpose => result.checks[purpose] === 'PASS'))
  assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_PRIVATE|public-ca-fixture/)
})

test('a failed role is reported without hiding later checks or leaking its error', async () => {
  const seen = []
  const result = await checkStagingWebsiteConsumers(env, input => {
    seen.push(input.purpose)
    return { pool: { async connect() {
      if (input.purpose === 'cart') throw Error(`SYNTHETIC_PRIVATE_${input.password}`)
      return { async query() { return { rows: [{ role: `tll_${input.purpose}_runtime` }] } }, release() {} }
    } }, async close() {} }
  })
  assert.equal(result.status, 'FAIL')
  assert.equal(result.checks.cart, 'FAIL')
  assert.deepEqual(seen, purposes)
  assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_PRIVATE/)
})

test('customer or checkout activation holds before constructing a database runtime', async () => {
  for (const key of ['TLL_STAGING_CUSTOMER_ENABLED', 'TLL_STAGING_CART_ENABLED',
    'TLL_STAGING_CART_CHECKOUT_HANDOFF_ENABLED']) {
    let constructed = false
    assert.equal(await checkStagingWebsiteConsumers({ ...env, [key]: 'true' }, () => { constructed = true }), null)
    assert.equal(constructed, false)
  }
})
