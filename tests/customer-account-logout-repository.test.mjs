import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundle = await build({ stdin: { contents: "export * from './lib/identity/customer-account-logout-repository.ts';export * from './lib/identity/customer-token-vault.ts'", resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' })
const { createCustomerAccountLogoutRepository, createAesGcmEnvelopeVault } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const OP = 'aaaaaaaa-1111-4222-8333-444444444444', USER = 'bbbbbbbb-1111-4222-8333-444444444444', SESSION = 'cccccccc-1111-4222-8333-444444444444'
const TX = 'dddddddd-1111-4222-8333-444444444444', RECEIPT = 'eeeeeeee-1111-4222-8333-444444444444', NOW = Date.parse('2026-09-18T16:00:00Z')
const SHOP = '107532616020', ISSUER = `https://shopify.com/authentication/${SHOP}`, CHALLENGE = Buffer.alloc(32, 2).toString('base64url')
const request = { operationId: OP, userId: USER, sessionId: SESSION }
const vault = () => createAesGcmEnvelopeVault({ activeKeyId: 'logout-test', keys: new Map([['logout-test', Buffer.alloc(32, 9)]]) })
function fixture(mutator = x => x, fault = () => false) {
  const v = vault(), calls = [], releases = [], verifiedAt = NOW - 60_000, proofExpiresAt = NOW - 30_000, accessExpiresAt = NOW - 10_000, proofFence = '19'
  const aad = ['tll-shopify-proof/v1', 'qdmvngjwkcsilzmqksme', 'tokens', TX, RECEIPT, SHOP, ISSUER, 'customer-subject', CHALLENGE, String(verifiedAt), String(proofExpiresAt), proofFence]
  const tokens = v.seal({ accessToken: 'expired-access', refreshToken: 'private-refresh', idToken: 'header.payload.signature', accessExpiresAt,
    originalNonce: Buffer.alloc(32, 3).toString('base64url'), scopes: ['openid', 'email', 'customer-account-api:full'], scopeProvenance: null, refreshTokenProvenance: null }, aad)
  const response = { status: 'local_revoked', operationId: OP, userId: USER, sessionId: SESSION, generation: '4', upstreamLogout: 'pending',
    tokenSource: { transactionId: TX, receiptId: RECEIPT, shopId: SHOP, issuer: ISSUER, subject: 'customer-subject', innerPkceChallenge: CHALLENGE,
      verifiedAt, proofExpiresAt, proofFence, accessExpiresAt, tokens } }
  const pool = { async connect() { calls.push(['connect']); let operation; return { async query(sql, values) { calls.push([sql, values]); if (values) operation = values[0]
    if (fault({ sql, operation })) throw Error('lost acknowledgement'); if (!sql.startsWith('SELECT ')) return { rows: [] }; return { rows: [{ result: mutator(response) }] } },
    release(destroy) { releases.push(destroy) } } } }
  return { v, calls, releases, repo: createCustomerAccountLogoutRepository({ pool, vault: v, syntheticExecution: true }) }
}

test('acknowledged local revocation opens only the original ID-token hint, even after access expiry', async () => {
  const f = fixture(), result = await f.repo.beginLogout(request)
  assert.deepEqual(result, { status: 'local_revoked', operationId: OP, owner: { userId: USER, sessionId: SESSION }, generation: '4',
    upstreamLogout: { status: 'pending', idToken: 'header.payload.signature' } })
  const rpc = f.calls.find(([sql]) => sql.startsWith('SELECT ')); assert.equal(rpc[0], 'SELECT tll_bridge_private.account_logout_repository($1::text,$2::jsonb) AS result')
  assert.deepEqual(rpc[1], ['logout', JSON.stringify(request)]); assert.doesNotMatch(rpc[1][1], /private|token|subject|receipt/); assert.deepEqual(f.releases, [false]); f.v.destroy()
})

test('not-required revocation returns no token material', async () => {
  const f = fixture(result => ({ ...result, upstreamLogout: 'not_required', tokenSource: null })), result = await f.repo.beginLogout(request)
  assert.deepEqual(result.upstreamLogout, { status: 'not_required' }); assert.equal(JSON.stringify(result).includes('token'), false); f.v.destroy()
})

test('substituted metadata and lost COMMIT acknowledgement fail closed without retry', async t => {
  await t.test('substitution', async () => { const f = fixture(result => ({ ...result, userId: 'ffffffff-1111-4222-8333-444444444444' })); await assert.rejects(() => f.repo.beginLogout(request), /unavailable/); assert.deepEqual(f.releases, [false]); f.v.destroy() })
  await t.test('lost commit', async () => { let lost = false; const f = fixture(x => x, ({ sql }) => { if (!lost && sql === 'COMMIT') { lost = true; return true } return false }); await assert.rejects(() => f.repo.beginLogout(request), /unavailable/)
    assert.equal(f.calls.filter(([sql]) => sql.startsWith('SELECT ')).length, 1); assert.deepEqual(f.releases, [true]); f.v.destroy() })
})

test('disabled construction rejects without acquiring a database connection', async () => {
  const v = vault(); let acquired = 0; const repo = createCustomerAccountLogoutRepository({ pool: { async connect() { acquired++; throw Error() } }, vault: v })
  assert.deepEqual(await repo.beginLogout(request), { status: 'rejected' }); assert.equal(acquired, 0); v.destroy()
})
