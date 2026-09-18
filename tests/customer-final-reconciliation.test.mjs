import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createHash } from 'node:crypto'

const bundle = await build({ entryPoints: ['lib/identity/customer-final-reconciliation.ts'], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' })
const { createCustomerFinalReconciliation } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const TX = 'aaaaaaaa-1111-4222-8333-444444444444', USER = 'bbbbbbbb-1111-4222-8333-444444444444'
const IDENTITY = 'cccccccc-1111-4222-8333-444444444444', RECEIPT = 'dddddddd-1111-4222-8333-444444444444'
const VERIFIER = Buffer.alloc(32, 1).toString('base64url'), CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url')
const SUBJECT = `tllb_${Buffer.alloc(32, 2).toString('base64url')}`, BROWSER = '3'.repeat(64)
const CALLBACK = `https://the-lifting-preview-my-lifting-lab-s-projects.vercel.app/auth/customer/callback?code=${TX}`
const NOW = Date.parse('2026-09-18T12:00:00Z')
const callback = () => ({ transactionId: TX, browserHash: BROWSER, callbackUrl: CALLBACK })
const result = (userId = USER) => Object.freeze({ kind: 'private_provisional',
  session: Object.freeze({ accessToken: 'private-access', refreshToken: 'private-refresh', tokenType: 'Bearer', expiresAt: NOW + 3_600_000 }),
  proof: Object.freeze({ userId, sessionId: 'eeeeeeee-1111-4222-8333-444444444444', issuer: 'https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1',
    audience: 'authenticated', anonymous: false, authenticatedAt: NOW - 1000, checkedAt: NOW, expiresAt: NOW + 3_600_000 }),
  identity: Object.freeze({ provider: 'custom:tll-staging-subject-broker-v1', subject: SUBJECT, identityId: IDENTITY, userId }) })
function fixture(changes = {}) {
  const calls = [], value = result(), claim = { status: 'claimed', transactionId: TX, browserHash: BROWSER,
    callbackHash: createHash('sha256').update(CALLBACK).digest('hex'), mode: changes.mode ?? 'sign_in',
    exchange: { authCode: TX, applicationVerifier: VERIFIER, applicationPkceChallenge: CHALLENGE, reservedSubject: SUBJECT },
    originalUserId: changes.mode === 'migration' ? USER : null, shopifyProofReceiptId: RECEIPT,
    fence: '1', generation: '0', expiresAt: NOW + 60_000, ...changes.claim }
  let finished = false
  const repository = {
    async claim(v) { calls.push(['claim', v]); return changes.claimResult ?? claim },
    async finish(v) { calls.push(['finish', v]); if (changes.finishError) throw new Error('lost'); finished = changes.finishResult ?? true; return finished },
    async release(v) { calls.push(['release', v]); assert.equal(finished, true, 'release before acknowledged finish')
      return changes.releaseResult ?? { status: 'reconciled', transactionId: TX, callbackHash: claim.callbackHash,
        userId: USER, identityId: IDENTITY, reservedSubject: SUBJECT, session: value.session } },
    async hold(v) { calls.push(['hold', v]); if (changes.holdError) throw new Error('hold unavailable') },
  }
  const exchange = {
    async exchangeSignIn(v) { calls.push(['sign_in', v]); if (changes.exchangeError) throw new Error('uncertain'); return changes.exchangeResult ?? value },
    async exchangeMigration(v) { calls.push(['migration', v]); if (changes.exchangeError) throw new Error('uncertain'); return changes.exchangeResult ?? value },
  }
  return { calls, api: createCustomerFinalReconciliation({ repository, exchange, now: () => NOW, syntheticExecution: true }) }
}
const rejected = async f => assert.rejects(f, error => error.message === 'Customer final reconciliation unavailable' && error.cause === undefined)

test('sign-in claims, exchanges, commits and rereads exact release before returning session', async () => {
  const f = fixture(), release = await f.api.complete(callback())
  assert.equal(release.status, 'reconciled'); assert.equal(release.userId, USER); assert.equal(release.reservedSubject, SUBJECT)
  assert.deepEqual(f.calls.map(([name]) => name), ['claim', 'sign_in', 'finish', 'release'])
  assert.equal(f.calls[0][1].callbackUrl, CALLBACK); assert.match(f.calls[0][1].operationId, /^[0-9a-f-]{36}$/)
  assert.equal(f.calls[2][1].result.kind, 'private_provisional')
  assert.equal(f.calls[3][1].callbackUrl, CALLBACK)
})

test('migration uses the retained original UUID and never falls back to sign-in', async () => {
  const f = fixture({ mode: 'migration' }); await f.api.complete(callback())
  assert.deepEqual(f.calls.map(([name]) => name), ['claim', 'migration', 'finish', 'release'])
  assert.equal(f.calls[1][1].originalUserId, USER)
})

test('invalid callback or claim is held before any exchange', async t => {
  for (const input of [
    { ...callback(), callbackUrl: CALLBACK + '&extra=1' },
    { ...callback(), browserHash: 'x' },
  ]) await t.test('callback', async () => { const f = fixture(); await rejected(() => f.api.complete(input)); assert.equal(f.calls.some(([n]) => n === 'sign_in'), false) })
  const f = fixture({ claim: { callbackHash: '0'.repeat(64) } })
  await rejected(() => f.api.complete(callback())); assert.deepEqual(f.calls.map(([name]) => name), ['claim', 'hold'])
})

test('exchange uncertainty, rejected/lost finish and mismatched release never return a session', async t => {
  for (const changes of [
    { exchangeError: true }, { finishResult: false }, { finishError: true },
    { releaseResult: { status: 'reconciled', transactionId: TX, callbackHash: createHash('sha256').update(CALLBACK).digest('hex'),
      userId: 'ffffffff-1111-4222-8333-444444444444', identityId: IDENTITY, reservedSubject: SUBJECT, session: result().session } },
  ]) await t.test(JSON.stringify(Object.keys(changes)), async () => {
    const f = fixture(changes); await rejected(() => f.api.complete(callback()))
    assert.equal(f.calls.at(-1)[0], 'hold')
    assert.equal(f.calls.filter(([n]) => n === 'release').length, changes.releaseResult ? 1 : 0)
  })
})

test('subject or migration-owner substitution is held after exchange', async t => {
  const wrongSubject = { ...result(), identity: { ...result().identity, subject: `tllb_${Buffer.alloc(32, 4).toString('base64url')}` } }
  const wrongUser = result('ffffffff-1111-4222-8333-444444444444')
  for (const changes of [{ exchangeResult: wrongSubject }, { mode: 'migration', exchangeResult: wrongUser }]) await t.test('substitution', async () => {
    const f = fixture(changes); await rejected(() => f.api.complete(callback()))
    assert.deepEqual(f.calls.map(([name]) => name), ['claim', changes.mode ? 'migration' : 'sign_in', 'hold'])
  })
})

test('disabled composition and repository failure remain fixed and secret-free', async () => {
  const f = fixture(); const api = createCustomerFinalReconciliation({ repository: {}, exchange: {}, now: () => NOW })
  await assert.rejects(() => api.complete(callback()), error => {
    assert.equal(error.message, 'Customer final reconciliation unavailable')
    assert.doesNotMatch(JSON.stringify(error), /private-access|private-refresh|code=/)
    return true
  })
  assert.equal(f.calls.length, 0)
})
