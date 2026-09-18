import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundle = await build({ stdin: { contents: "export * from './lib/server/staging-customer.ts'", resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' })
const { createStagingCustomerRuntime } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const ORIGIN = 'https://the-lifting-customer-test-my-lifting-lab-s-projects.vercel.app'
const base = Object.freeze({ NEXT_PUBLIC_TLL_ENVIRONMENT: 'staging', NEXT_PUBLIC_TLL_STAGING_CUSTOMER: 'enabled',
  TLL_STAGING_CUSTOMER_ENABLED: 'true', VERCEL: '1', VERCEL_ENV: 'preview', TLL_STAGING_CUSTOMER_ORIGIN: ORIGIN,
  TLL_STAGING_SUPABASE_PROJECT_REF: 'qdmvngjwkcsilzmqksme', NEXT_PUBLIC_SUPABASE_URL: 'https://qdmvngjwkcsilzmqksme.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_staging_customer_fixture', TLL_STAGING_POSTGRES_CA_PEM: 'synthetic-public-ca',
  TLL_STAGING_POSTGRES_CA_SHA256: 'a'.repeat(64), TLL_STAGING_CUSTOMER_DATABASE_PASSWORD: 'customer-' + '1'.repeat(40),
  TLL_STAGING_BROKER_DATABASE_PASSWORD: 'broker-' + '2'.repeat(40), TLL_STAGING_PROVISIONAL_DATABASE_PASSWORD: 'provisional-' + '3'.repeat(40),
  TLL_STAGING_BRIDGE_DATABASE_PASSWORD: 'bridge-' + '4'.repeat(40), TLL_STAGING_CUSTOMER_TOKEN_VAULT_KEY_ID: 'customer-token-v1',
  TLL_STAGING_CUSTOMER_TOKEN_VAULT_KEY_HEX: 'b'.repeat(64), TLL_STAGING_CUSTOMER_PROVISIONAL_VAULT_KEY_ID: 'customer-provisional-v1',
  TLL_STAGING_CUSTOMER_PROVISIONAL_VAULT_KEY_HEX: 'c'.repeat(64), TLL_STAGING_CUSTOMER_COOKIE_VAULT_KEY_ID: 'customer-cookie-v1',
  TLL_STAGING_CUSTOMER_COOKIE_VAULT_KEY_HEX: 'd'.repeat(64) })

function fixture(env = base, changes = {}) {
  const calls = [], closed = [], destroyed = []
  const pools = new Map()
  const runtimeFactory = options => {
    calls.push(['runtime', structuredClone(options)])
    const pool = Object.freeze({ purpose: options.purpose, connect: async () => { throw Error('No database call expected') } })
    pools.set(options.purpose, pool)
    return { enabled: true, pool, async close() { closed.push(options.purpose) } }
  }
  const vaultFactory = options => {
    calls.push(['vault', options.activeKeyId, Buffer.from(options.keys.get(options.activeKeyId))])
    return { seal() { throw Error('No seal expected') }, open() { throw Error('No open expected') }, destroy() { destroyed.push(options.activeKeyId) } }
  }
  const delivery = Object.freeze({ marker: 'delivery' })
  const deliveryFactory = options => { calls.push(['delivery', options]); return delivery }
  const readAccessToken = async () => null
  return { runtime: createStagingCustomerRuntime({ env, readAccessToken }, { runtimeFactory, vaultFactory, deliveryFactory, ...changes }),
    calls, closed, destroyed, pools, delivery, readAccessToken }
}

test('valid preview composition owns four distinct purpose pools and three isolated keyrings', async () => {
  const f = fixture(); assert.ok(f.runtime); assert.equal(f.runtime.enabled, true); assert.equal(f.runtime.delivery, f.delivery)
  const runtimeCalls = f.calls.filter(([kind]) => kind === 'runtime'); assert.deepEqual(runtimeCalls.map(([, x]) => x.purpose), ['customer','broker','provisional','bridge'])
  assert.equal(new Set(runtimeCalls.map(([, x]) => x.password)).size, 4)
  for (const [, options] of runtimeCalls) { assert.equal(options.enabled, true); assert.equal(options.tlsCa.pem, base.TLL_STAGING_POSTGRES_CA_PEM); assert.equal(options.tlsCa.sha256, base.TLL_STAGING_POSTGRES_CA_SHA256) }
  const vaultCalls = f.calls.filter(([kind]) => kind === 'vault'); assert.deepEqual(vaultCalls.map(([, id]) => id), ['customer-token-v1','customer-provisional-v1','customer-cookie-v1'])
  assert.equal(new Set(vaultCalls.map(([, , key]) => key.toString('hex'))).size, 3)
  const options = f.calls.find(([kind]) => kind === 'delivery')[1]
  assert.equal(options.provisionalPool, f.pools.get('provisional')); assert.equal(options.bridgePool, f.pools.get('bridge')); assert.equal(options.brokerPool, f.pools.get('broker'))
  assert.notEqual(options.vault, options.cookieVault); assert.equal(options.applicationOrigin, ORIGIN); assert.equal(options.publishableKey, base.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  assert.equal(options.readAccessToken, f.readAccessToken); assert.equal(options.syntheticExecution, true); assert.equal(options.liveEnabled, false)
  assert.equal(f.runtime.customerPool, f.pools.get('customer')); assert.notEqual(f.runtime.tokenVault, options.vault); assert.notEqual(f.runtime.tokenVault, options.cookieVault)
  assert.deepEqual(f.runtime.connection, { projectRef:'qdmvngjwkcsilzmqksme', shopId:'107532616020', clientId:'c8f7b926-9073-416c-9949-0d99e89a99c0',
    issuer:'https://shopify.com/authentication/107532616020', discovery:'https://tll-integration-staging.myshopify.com/.well-known/openid-configuration' })
  await f.runtime.close(); await f.runtime.close(); assert.deepEqual(f.closed.sort(), ['bridge','broker','customer','provisional']); assert.deepEqual(f.destroyed, ['customer-token-v1','customer-provisional-v1','customer-cookie-v1'])
})

test('missing, production, malformed and overlapping configuration fails before resources', () => {
  const changes = [
    ['NEXT_PUBLIC_TLL_ENVIRONMENT','production'], ['NEXT_PUBLIC_TLL_STAGING_CUSTOMER',undefined], ['TLL_STAGING_CUSTOMER_ENABLED','false'],
    ['VERCEL_ENV','production'], ['TLL_STAGING_CUSTOMER_ORIGIN','https://example.com'], ['TLL_STAGING_SUPABASE_PROJECT_REF','wrhgscovsgsudtedbljr'],
    ['NEXT_PUBLIC_SUPABASE_URL','https://wrhgscovsgsudtedbljr.supabase.co'], ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','bad'],
    ['TLL_STAGING_POSTGRES_CA_PEM',''], ['TLL_STAGING_POSTGRES_CA_SHA256','bad'], ['TLL_STAGING_CUSTOMER_DATABASE_PASSWORD','short'],
    ['TLL_STAGING_BROKER_DATABASE_PASSWORD',base.TLL_STAGING_CUSTOMER_DATABASE_PASSWORD], ['TLL_STAGING_CUSTOMER_TOKEN_VAULT_KEY_HEX','bad'],
    ['TLL_STAGING_CUSTOMER_COOKIE_VAULT_KEY_HEX',base.TLL_STAGING_CUSTOMER_PROVISIONAL_VAULT_KEY_HEX],
    ['TLL_STAGING_CUSTOMER_COOKIE_VAULT_KEY_ID',base.TLL_STAGING_CUSTOMER_PROVISIONAL_VAULT_KEY_ID],
  ]
  for (const [name, value] of changes) { const env = { ...base, [name]: value }; const f = fixture(env); assert.equal(f.runtime, null, name); assert.equal(f.calls.length, 0, name) }
})

test('constructor failure returns unavailable and closes every resource already created', async () => {
  let count = 0; const closed = []
  const f = fixture(base, { runtimeFactory(options) { count++; if (count === 3) throw Error('private failure'); const pool = { connect: async()=>{throw Error()} }; return { enabled:true, pool, async close(){ closed.push(options.purpose) } } } })
  assert.equal(f.runtime, null); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(closed.sort(), ['broker','customer'])
})

test('browser runtime is unavailable', () => {
  globalThis.window = {}
  try { const f = fixture(); assert.equal(f.runtime, null); assert.equal(f.calls.length, 0) } finally { delete globalThis.window }
})
