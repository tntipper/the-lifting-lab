import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { randomUUID } from 'node:crypto'

const bundle = await build({ stdin: { contents: "export * from './lib/identity/customer-account-operations-repository.ts';export * from './lib/identity/customer-token-vault.ts'", resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' })
const { createCustomerAccountOperationsRepository, createAesGcmEnvelopeVault } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))

const NOW = Date.parse('2026-09-18T15:00:00Z')
const OP = 'aaaaaaaa-1111-4222-8333-444444444444'
const USER = 'bbbbbbbb-1111-4222-8333-444444444444'
const SESSION = 'cccccccc-1111-4222-8333-444444444444'
const TX = 'dddddddd-1111-4222-8333-444444444444'
const RECEIPT = 'eeeeeeee-1111-4222-8333-444444444444'
const SHOP = '107532616020', ISSUER = `https://shopify.com/authentication/${SHOP}`
const CHALLENGE = Buffer.alloc(32, 2).toString('base64url')
const vault = () => createAesGcmEnvelopeVault({ activeKeyId: 'account-test', keys: new Map([['account-test', Buffer.alloc(32, 7)]]) })
const tokenBundle = () => ({ accessToken: 'private-shopify-access', refreshToken: 'private-shopify-refresh', idToken: 'private-shopify-id',
  accessExpiresAt: NOW + 3_600_000, originalNonce: Buffer.alloc(32, 3).toString('base64url'), scopes: ['openid', 'email', 'customer-account-api:full'],
  scopeProvenance: null, refreshTokenProvenance: null })
const metadata = { transactionId: TX, receiptId: RECEIPT, shopId: SHOP, issuer: ISSUER, subject: 'customer-subject', innerPkceChallenge: CHALLENGE,
  verifiedAt: NOW - 60_000, proofExpiresAt: NOW + 60_000, proofFence: '19', accessExpiresAt: NOW + 3_600_000 }
const aad = ['tll-shopify-proof/v1', 'qdmvngjwkcsilzmqksme', 'tokens', TX, RECEIPT, SHOP, ISSUER, 'customer-subject', CHALLENGE,
  String(metadata.verifiedAt), String(metadata.proofExpiresAt), '19']
const owner = { operationId: OP, userId: USER, sessionId: SESSION }

function fixture(mutate = (x) => x, fault = () => false) {
  const v = vault(), calls = [], releases = []
  const claimed = { status: 'claimed', operationId: OP, userId: USER, sessionId: SESSION, transactionId: TX, receiptId: RECEIPT,
    generation: '0', fence: '7', leaseExpiresAt: NOW + 30_000, tokenSource: { ...metadata, tokens: v.seal(tokenBundle(), aad) } }
  const pool = { async connect() { calls.push(['connect']); let operation
    return { async query(sql, values) { calls.push([sql, values]); if (values) operation = values[0]
      if (fault({ sql, operation })) throw Error('lost acknowledgement')
      if (!sql.startsWith('SELECT ')) return { rows: [] }
      const result = operation === 'claim_orders' ? claimed : operation === 'finish_orders' ? { status: 'completed' } : { status: 'held' }
      return { rows: [{ result: mutate(result, operation) }] } }, release(destroy) { releases.push(destroy) } } } }
  return { v, calls, releases, repo: createCustomerAccountOperationsRepository({ pool, vault: v, now: () => NOW, syntheticExecution: true }) }
}

test('acknowledged exact claim decrypts only the original proof AAD and exposes one access token', async () => {
  const f = fixture(), result = await f.repo.claimOrders(owner)
  assert.deepEqual(result, { status: 'claimed', operationId: OP, fence: '7', owner: { userId: USER, sessionId: SESSION },
    receiptId: RECEIPT, accessToken: 'private-shopify-access', accessExpiresAt: NOW + 3_600_000 })
  const rpc = f.calls.find(([sql]) => sql.startsWith('SELECT '))
  assert.equal(rpc[0], 'SELECT tll_bridge_private.account_repository($1::text,$2::jsonb) AS result')
  assert.deepEqual(JSON.parse(rpc[1][1]), owner)
  assert.doesNotMatch(rpc[1][1], /private-shopify|customer-subject|receiptId/)
  assert.deepEqual(f.releases, [false])
  f.v.destroy()
})

test('substituted claim metadata is quarantined with the committed fence and never releases a token', async () => {
  const f = fixture((result, operation) => operation === 'claim_orders' ? { ...result, receiptId: randomUUID() } : result)
  await assert.rejects(() => f.repo.claimOrders(owner), /^Error: Customer account operations repository unavailable$/)
  const operations = f.calls.filter(([sql]) => sql.startsWith('SELECT ')).map(([, values]) => [values[0], JSON.parse(values[1])])
  assert.deepEqual(operations, [['claim_orders', owner], ['hold_orders', { ...owner, fence: '7' }]])
  assert.deepEqual(f.releases, [false, false])
  f.v.destroy()
})

test('lost claim COMMIT acknowledgement destroys the connection and performs only an unfenced quarantine', async () => {
  let lost = false
  const f = fixture(x => x, ({ sql, operation }) => { if (!lost && operation === 'claim_orders' && sql === 'COMMIT') { lost = true; return true } return false })
  await assert.rejects(() => f.repo.claimOrders(owner), /^Error: Customer account operations repository unavailable$/)
  const operations = f.calls.filter(([sql]) => sql.startsWith('SELECT ')).map(([, values]) => [values[0], JSON.parse(values[1])])
  assert.deepEqual(operations, [['claim_orders', owner], ['hold_orders', owner]])
  assert.deepEqual(f.releases, [true, false])
  f.v.destroy()
})

test('finish and hold use the fixed RPC while disabled construction performs no database work', async () => {
  const f = fixture()
  assert.equal(await f.repo.finishOrders({ ...owner, fence: '7' }), true)
  await f.repo.holdOrders({ ...owner, fence: '7' })
  assert.deepEqual(f.calls.filter(([sql]) => sql.startsWith('SELECT ')).map(([, values]) => values[0]), ['finish_orders', 'hold_orders'])
  let acquired = 0
  const disabled = createCustomerAccountOperationsRepository({ pool: { async connect() { acquired++; throw Error() } }, vault: f.v })
  assert.deepEqual(await disabled.claimOrders(owner), { status: 'rejected' })
  assert.equal(acquired, 0)
  f.v.destroy()
})
