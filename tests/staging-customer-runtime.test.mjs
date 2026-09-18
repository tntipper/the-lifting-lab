import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { build } from 'esbuild'

const bundle = await build({ stdin: { contents: "export * from './lib/server/staging-customer.ts'", resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' })
const { createStagingCustomerRuntime } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const ORIGIN = 'https://the-lifting-customer-test-my-lifting-lab-s-projects.vercel.app'
const proofHash = createHash('sha256').update(JSON.stringify(['tll-shopify-proof/v1','107532616020','https://shopify.com/authentication/107532616020',
  'c8f7b926-9073-416c-9949-0d99e89a99c0','https://shopify.com/authentication/107532616020/oauth/authorize',
  'https://shopify.com/authentication/107532616020/oauth/token','https://shopify.com/authentication/107532616020/.well-known/jwks.json',
  ORIGIN + '/auth/customer/shopify/callback','openid email customer-account-api:full'])).digest('hex')
const now = Date.now()
const base = Object.freeze({ NEXT_PUBLIC_TLL_ENVIRONMENT: 'staging', NEXT_PUBLIC_TLL_STAGING_CUSTOMER: 'enabled',
  TLL_STAGING_CUSTOMER_ENABLED: 'true', VERCEL: '1', VERCEL_ENV: 'preview', TLL_STAGING_CUSTOMER_ORIGIN: ORIGIN,
  TLL_STAGING_SUPABASE_PROJECT_REF: 'qdmvngjwkcsilzmqksme', NEXT_PUBLIC_SUPABASE_URL: 'https://qdmvngjwkcsilzmqksme.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_staging_customer_fixture', TLL_STAGING_POSTGRES_CA_PEM: 'synthetic-public-ca',
  TLL_STAGING_POSTGRES_CA_SHA256: 'a'.repeat(64), TLL_STAGING_CUSTOMER_DATABASE_PASSWORD: 'customer-' + '1'.repeat(40),
  TLL_STAGING_SHOPIFY_CUSTOMER_CLIENT_SECRET: 'shopify-' + '5'.repeat(40), TLL_STAGING_SHOPIFY_PROOF_EVIDENCE_ID: 'synthetic-review-v1',
  TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET: 'broker-secret-' + '6'.repeat(40),
  TLL_STAGING_SHOPIFY_PROOF_CONFIG_SHA256: proofHash, TLL_STAGING_SHOPIFY_PROOF_VERIFIED_AT_MS: String(now - 1000),
  TLL_STAGING_SHOPIFY_PROOF_EXPIRES_AT_MS: String(now + 3600000),
  TLL_STAGING_BROKER_DATABASE_PASSWORD: 'broker-' + '2'.repeat(40), TLL_STAGING_PROVISIONAL_DATABASE_PASSWORD: 'provisional-' + '3'.repeat(40),
  TLL_STAGING_BRIDGE_DATABASE_PASSWORD: 'bridge-' + '4'.repeat(40), TLL_STAGING_CUSTOMER_TOKEN_VAULT_KEY_ID: 'customer-token-v1',
  TLL_STAGING_CUSTOMER_TOKEN_VAULT_KEY_HEX: 'b'.repeat(64), TLL_STAGING_CUSTOMER_PROVISIONAL_VAULT_KEY_ID: 'customer-provisional-v1',
  TLL_STAGING_CUSTOMER_PROVISIONAL_VAULT_KEY_HEX: 'c'.repeat(64), TLL_STAGING_CUSTOMER_COOKIE_VAULT_KEY_ID: 'customer-cookie-v1',
  TLL_STAGING_CUSTOMER_COOKIE_VAULT_KEY_HEX: 'd'.repeat(64), TLL_STAGING_CUSTOMER_FINAL_VAULT_KEY_ID: 'customer-final-v1',
  TLL_STAGING_CUSTOMER_FINAL_VAULT_KEY_HEX: 'e'.repeat(64) })

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
  const proofRepository = Object.freeze({ marker: 'proof-repository' })
  const proofRepositoryFactory = options => { calls.push(['proof-repository', options]); return proofRepository }
  const tokenAdapter = Object.freeze({ exchangeCode: async () => { throw Error('No exchange expected') } })
  const tokenAdapterFactory = options => { calls.push(['token-adapter', options]); return tokenAdapter }
  const jwks = Object.freeze({ verifyIdToken: async () => null })
  const jwksLoaderFactory = options => { calls.push(['jwks', options]); return jwks }
  const shopifyProof = Object.freeze({ marker: 'shopify-proof' })
  const proofFlowFactory = options => { calls.push(['proof-flow', options]); return shopifyProof }
  const finalRepository = Object.freeze({ marker:'final-repository' })
  const finalRepositoryFactory = options => { calls.push(['final-repository', options]); return finalRepository }
  const finalExchange = Object.freeze({ marker:'final-exchange' })
  const finalExchangeFactory = options => { calls.push(['final-exchange', options]); return finalExchange }
  const finalReconciliation = Object.freeze({ marker:'final-reconciliation' })
  const finalReconciliationFactory = options => { calls.push(['final-reconciliation', options]); return finalReconciliation }
  const sessionReader = Object.freeze({ currentSession: async () => null })
  const sessionReaderFactory = options => { calls.push(['session-reader', options]); return sessionReader }
  const accountRepository = Object.freeze({ marker: 'account-repository' })
  const accountRepositoryFactory = options => { calls.push(['account-repository', options]); return accountRepository }
  const ordersReader = Object.freeze({ marker: 'orders-reader' })
  const ordersReaderFactory = options => { calls.push(['orders-reader', options]); return ordersReader }
  const accountOperations = Object.freeze({ marker: 'account-operations' })
  const accountOperationsFactory = options => { calls.push(['account-operations', options]); return accountOperations }
  const accountLogoutRepository = Object.freeze({ marker: 'account-logout-repository' })
  const accountLogoutRepositoryFactory = options => { calls.push(['account-logout-repository', options]); return accountLogoutRepository }
  const accountLogout = Object.freeze({ marker: 'account-logout' })
  const accountLogoutFactory = options => { calls.push(['account-logout', options]); return accountLogout }
  const readAccessToken = async () => null
  const invalidateSupabaseSession = async () => false
  return { runtime: createStagingCustomerRuntime({ env, readAccessToken, invalidateSupabaseSession }, { runtimeFactory, vaultFactory, deliveryFactory,
      proofRepositoryFactory, tokenAdapterFactory, jwksLoaderFactory, proofFlowFactory, finalRepositoryFactory,
      finalExchangeFactory, finalReconciliationFactory, sessionReaderFactory, accountRepositoryFactory,
      ordersReaderFactory, accountOperationsFactory, accountLogoutRepositoryFactory, accountLogoutFactory, ...changes }),
    calls, closed, destroyed, pools, delivery, proofRepository, tokenAdapter, jwks, finalRepository,
    finalExchange, finalReconciliation, sessionReader, accountRepository, ordersReader, accountOperations,
    accountLogoutRepository, accountLogout, readAccessToken, invalidateSupabaseSession }
}

test('valid preview composition owns four distinct purpose pools and four isolated keyrings', async () => {
  const f = fixture(); assert.ok(f.runtime); assert.equal(f.runtime.enabled, true); assert.equal(f.runtime.delivery, f.delivery)
  assert.equal(f.runtime.shopifyProof.marker, 'shopify-proof')
  const runtimeCalls = f.calls.filter(([kind]) => kind === 'runtime'); assert.deepEqual(runtimeCalls.map(([, x]) => x.purpose), ['customer','broker','provisional','bridge'])
  assert.equal(new Set(runtimeCalls.map(([, x]) => x.password)).size, 4)
  for (const [, options] of runtimeCalls) { assert.equal(options.enabled, true); assert.equal(options.tlsCa.pem, base.TLL_STAGING_POSTGRES_CA_PEM); assert.equal(options.tlsCa.sha256, base.TLL_STAGING_POSTGRES_CA_SHA256) }
  const vaultCalls = f.calls.filter(([kind]) => kind === 'vault'); assert.deepEqual(vaultCalls.map(([, id]) => id), ['customer-token-v1','customer-provisional-v1','customer-cookie-v1','customer-final-v1'])
  assert.equal(new Set(vaultCalls.map(([, , key]) => key.toString('hex'))).size, 4)
  const options = f.calls.find(([kind]) => kind === 'delivery')[1]
  assert.equal(options.provisionalPool, f.pools.get('provisional')); assert.equal(options.bridgePool, f.pools.get('bridge')); assert.equal(options.brokerPool, f.pools.get('broker'))
  assert.notEqual(options.vault, options.cookieVault); assert.equal(options.applicationOrigin, ORIGIN); assert.equal(options.publishableKey, base.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  assert.equal(options.readAccessToken, f.readAccessToken); assert.equal(options.syntheticExecution, true); assert.equal(options.liveEnabled, false)
  assert.equal(options.shopifyProof.marker, 'shopify-proof'); assert.equal(options.shopifyProofRepository, f.proofRepository)
  assert.equal(options.subjectBrokerClientSecret, base.TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET)
  assert.equal(f.runtime.customerPool, f.pools.get('customer')); assert.notEqual(f.runtime.tokenVault, options.vault); assert.notEqual(f.runtime.tokenVault, options.cookieVault)
  const proofRepo = f.calls.find(([kind]) => kind === 'proof-repository')[1]
  assert.equal(proofRepo.pool, f.pools.get('customer')); assert.equal(proofRepo.vault, f.runtime.tokenVault)
  assert.equal(proofRepo.syntheticExecution, true); assert.equal(proofRepo.liveEnabled, false)
  const adapter = f.calls.find(([kind]) => kind === 'token-adapter')[1]
  assert.equal(adapter.clientSecret, base.TLL_STAGING_SHOPIFY_CUSTOMER_CLIENT_SECRET)
  assert.equal(adapter.callbackUrl, ORIGIN + '/auth/customer/shopify/callback')
  assert.equal(adapter.authorizationScope, 'openid email customer-account-api:full'); assert.equal(adapter.enabled, true)
  assert.deepEqual(f.calls.find(([kind]) => kind === 'jwks')[1], { enabled: true })
  const flow = f.calls.find(([kind]) => kind === 'proof-flow')[1]
  assert.equal(flow.config.applicationOrigin, ORIGIN); assert.equal(flow.config.verification.configHash, proofHash)
  assert.equal(flow.ports.repository, f.proofRepository); assert.equal(flow.ports.exchangeCode, f.tokenAdapter.exchangeCode)
  assert.equal(flow.ports.verifyIdToken, f.jwks.verifyIdToken); assert.equal(flow.syntheticExecution, true); assert.equal(flow.liveEnabled, false)
  const finalRepo=f.calls.find(([kind])=>kind==='final-repository')[1]
  assert.equal(finalRepo.pool,f.pools.get('bridge'));assert.notEqual(finalRepo.provisionalVault,finalRepo.finalVault)
  assert.equal(finalRepo.syntheticExecution,true);assert.equal(finalRepo.liveEnabled,false)
  assert.deepEqual(f.calls.find(([kind])=>kind==='final-exchange')[1],{enabled:true,publishableKey:base.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY})
  const final=f.calls.find(([kind])=>kind==='final-reconciliation')[1]
  assert.equal(final.repository,f.finalRepository);assert.equal(final.exchange,f.finalExchange);assert.equal(final.syntheticExecution,true);assert.equal(final.liveEnabled,false)
  assert.equal(f.runtime.finalReconciliation,f.finalReconciliation)
  const session=f.calls.find(([kind])=>kind==='session-reader')[1]
  assert.deepEqual(session,{enabled:true,publishableKey:base.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,readAccessToken:f.readAccessToken})
  const accountRepo=f.calls.find(([kind])=>kind==='account-repository')[1]
  assert.equal(accountRepo.pool,f.pools.get('bridge'));assert.equal(accountRepo.vault,f.runtime.tokenVault)
  assert.equal(accountRepo.syntheticExecution,true);assert.equal(accountRepo.liveEnabled,false)
  assert.deepEqual(f.calls.find(([kind])=>kind==='orders-reader')[1],{enabled:true})
  const account=f.calls.find(([kind])=>kind==='account-operations')[1]
  assert.equal(account.repository,f.accountRepository);assert.equal(account.orders,f.ordersReader)
  assert.equal(account.currentSession,f.sessionReader.currentSession);assert.equal(account.syntheticExecution,true);assert.equal(account.liveEnabled,false)
  const logout=f.calls.find(([kind])=>kind==='account-logout-repository')[1]
  assert.equal(logout.pool,f.pools.get('bridge'));assert.equal(logout.vault,f.runtime.tokenVault)
  assert.equal(logout.syntheticExecution,true);assert.equal(logout.liveEnabled,false)
  const coordinated=f.calls.find(([kind])=>kind==='account-logout')[1]
  assert.equal(coordinated.repository,f.accountLogoutRepository);assert.equal(coordinated.currentSession,f.sessionReader.currentSession)
  assert.equal(coordinated.invalidateSupabaseSession,f.invalidateSupabaseSession);assert.equal(coordinated.applicationOrigin,ORIGIN)
  assert.equal(coordinated.syntheticExecution,true);assert.equal(coordinated.liveEnabled,false)
  assert.equal(f.runtime.accountOperations,f.accountOperations);assert.equal(f.runtime.accountLogout,f.accountLogout)
  assert.deepEqual(f.runtime.connection, { projectRef:'qdmvngjwkcsilzmqksme', shopId:'107532616020', clientId:'c8f7b926-9073-416c-9949-0d99e89a99c0',
    issuer:'https://shopify.com/authentication/107532616020', discovery:'https://tll-integration-staging.myshopify.com/.well-known/openid-configuration' })
  await f.runtime.close(); await f.runtime.close(); assert.deepEqual(f.closed.sort(), ['bridge','broker','customer','provisional']); assert.deepEqual(f.destroyed, ['customer-token-v1','customer-provisional-v1','customer-cookie-v1','customer-final-v1'])
})

test('missing, production, malformed and overlapping configuration fails before resources', () => {
  const changes = [
    ['NEXT_PUBLIC_TLL_ENVIRONMENT','production'], ['NEXT_PUBLIC_TLL_STAGING_CUSTOMER',undefined], ['TLL_STAGING_CUSTOMER_ENABLED','false'],
    ['VERCEL_ENV','production'], ['TLL_STAGING_CUSTOMER_ORIGIN','https://example.com'], ['TLL_STAGING_SUPABASE_PROJECT_REF','wrhgscovsgsudtedbljr'],
    ['NEXT_PUBLIC_SUPABASE_URL','https://wrhgscovsgsudtedbljr.supabase.co'], ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','bad'],
    ['TLL_STAGING_POSTGRES_CA_PEM',''], ['TLL_STAGING_POSTGRES_CA_SHA256','bad'], ['TLL_STAGING_CUSTOMER_DATABASE_PASSWORD','short'],
    ['TLL_STAGING_SHOPIFY_CUSTOMER_CLIENT_SECRET','short'], ['TLL_STAGING_SHOPIFY_PROOF_EVIDENCE_ID','bad evidence'],
    ['TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET','short'],
    ['TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET',base.TLL_STAGING_SHOPIFY_CUSTOMER_CLIENT_SECRET],
    ['TLL_STAGING_SHOPIFY_PROOF_CONFIG_SHA256','a'.repeat(64)], ['TLL_STAGING_SHOPIFY_PROOF_EXPIRES_AT_MS',base.TLL_STAGING_SHOPIFY_PROOF_VERIFIED_AT_MS],
    ['TLL_STAGING_BROKER_DATABASE_PASSWORD',base.TLL_STAGING_CUSTOMER_DATABASE_PASSWORD], ['TLL_STAGING_CUSTOMER_TOKEN_VAULT_KEY_HEX','bad'],
    ['TLL_STAGING_CUSTOMER_COOKIE_VAULT_KEY_HEX',base.TLL_STAGING_CUSTOMER_PROVISIONAL_VAULT_KEY_HEX],
    ['TLL_STAGING_CUSTOMER_COOKIE_VAULT_KEY_ID',base.TLL_STAGING_CUSTOMER_PROVISIONAL_VAULT_KEY_ID],
    ['TLL_STAGING_CUSTOMER_FINAL_VAULT_KEY_HEX',base.TLL_STAGING_CUSTOMER_PROVISIONAL_VAULT_KEY_HEX],
    ['TLL_STAGING_CUSTOMER_FINAL_VAULT_KEY_ID',base.TLL_STAGING_CUSTOMER_COOKIE_VAULT_KEY_ID],
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
