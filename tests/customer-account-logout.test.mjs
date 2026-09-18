import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundle = await build({ stdin: { contents: "export * from './lib/identity/customer-account-logout.ts'", resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' })
const { createCustomerAccountLogout } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const USER = 'aaaaaaaa-1111-4222-8333-444444444444', SESSION = 'bbbbbbbb-1111-4222-8333-444444444444'
const ORIGIN = 'https://the-lifting-logout-test-my-lifting-lab-s-projects.vercel.app', NOW = Date.parse('2026-09-18T18:00:00Z')
const proof = change => ({ userId: USER, sessionId: SESSION, issuer: 'https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1',
  audience: 'authenticated', anonymous: false, authenticatedAt: NOW - 1000, checkedAt: NOW, expiresAt: NOW + 60_000, ...change })

function fixture(change = {}) {
  const events = [], operation = { value: null }
  const repository = { async beginLogout(input) { events.push(['local', input]); operation.value = input.operationId
    if (change.localError) throw Error('secret'); const result = change.result ?? { status: 'local_revoked',
      owner: { userId: USER, sessionId: SESSION }, generation: '2', upstreamLogout: { status: 'pending', idToken: 'header.payload.signature' } }
    return { ...result, operationId: change.substituteOperation ? 'dddddddd-1111-4222-8333-444444444444' : input.operationId } } }
  const api = createCustomerAccountLogout({ repository, currentSession: async () => { events.push(['session']); return change.session === undefined ? proof({}) : change.session },
    invalidateSupabaseSession: async () => { events.push(['invalidate']); if (change.invalidateError) throw Error('private'); return change.invalidated !== false },
    applicationOrigin: change.origin ?? ORIGIN, now: () => NOW, syntheticExecution: true, ...change.options })
  return { api, events, operation }
}

test('acknowledged local revocation precedes session invalidation and builds only the pinned Shopify logout redirect', async () => {
  const f = fixture(), result = await f.api.logout()
  assert.equal(result.status, 'logged_out'); assert.deepEqual(f.events.map(([event]) => event), ['session','local','invalidate'])
  const url = new URL(result.providerRedirect); assert.equal(url.origin + url.pathname, 'https://shopify.com/authentication/107532616020/logout')
  assert.deepEqual([...url.searchParams], [['id_token_hint','header.payload.signature'],['post_logout_redirect_uri',ORIGIN + '/auth']])
  assert.match(f.operation.value, /^[0-9a-f-]{36}$/)
})

test('a repeated local logout does not create a provider redirect', async () => {
  const f = fixture({ result: { status: 'local_revoked', operationId: 'REPLACED', owner: { userId: USER, sessionId: SESSION },
    generation: '2', upstreamLogout: { status: 'not_required' } } })
  const result = await f.api.logout(); assert.deepEqual(result, { status: 'logged_out', providerRedirect: null })
})

test('uncertain local commit still invalidates Supabase and releases no provider hint', async () => {
  const f = fixture({ localError: true }), result = await f.api.logout()
  assert.deepEqual(result, { status: 'held', code: 'LOGOUT_UNCERTAIN' }); assert.deepEqual(f.events.map(([event]) => event), ['session','local','invalidate'])
  assert.equal(JSON.stringify(result).includes('token'), false)
})

test('missing or substituted session proof invalidates Supabase without calling local custody', async t => {
  for (const session of [null, proof({ userId: 'wrong' }), proof({ sessionId: 'wrong' }), proof({ checkedAt: NOW - 20_000 })]) await t.test(String(session?.userId ?? 'none'), async () => {
    const f = fixture({ session }), result = await f.api.logout(); assert.equal(result.status, 'held')
    assert.deepEqual(f.events.map(([event]) => event), ['session','invalidate'])
  })
})

test('session invalidation failure is explicit after durable local revocation and suppresses provider redirect', async () => {
  const f = fixture({ invalidated: false }), result = await f.api.logout()
  assert.deepEqual(result, { status: 'local_revoked', code: 'SESSION_INVALIDATION_FAILED' }); assert.deepEqual(f.events.map(([event]) => event), ['session','local','invalidate'])
})

test('substituted repository ownership fails closed and invalidates Supabase', async () => {
  const f = fixture({ result: { status: 'local_revoked', operationId: 'ignored', owner: { userId: 'cccccccc-1111-4222-8333-444444444444', sessionId: SESSION },
    generation: '2', upstreamLogout: { status: 'pending', idToken: 'secret' } } }), result = await f.api.logout()
  assert.deepEqual(result, { status: 'held', code: 'LOGOUT_UNCERTAIN' }); assert.equal(f.events.at(-1)[0], 'invalidate')
})

test('a substituted operation result fails closed and invalidates Supabase', async () => {
  const f = fixture({ substituteOperation: true }), result = await f.api.logout()
  assert.deepEqual(result, { status: 'held', code: 'LOGOUT_UNCERTAIN' }); assert.equal(f.events.at(-1)[0], 'invalidate')
})

test('disabled or malformed configuration performs no session, database or invalidation work', async t => {
  for (const changes of [{ options: { syntheticExecution: false } }, { options: { liveEnabled: true } }, { origin: 'https://example.com' }]) await t.test(JSON.stringify(changes), async () => {
    const f = fixture(changes); await assert.rejects(() => f.api.logout(), /unavailable/); assert.deepEqual(f.events, [])
  })
})
