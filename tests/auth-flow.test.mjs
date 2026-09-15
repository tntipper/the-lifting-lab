import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import test from 'node:test'
import {
  authErrorMessage,
  completeAuthCallback,
  completeSignOut,
  safeAuthReturnPath,
} from '../lib/auth-flow.ts'

const origin = 'https://app.example.test'
const callback = query => new URL(`/auth/callback${query ? `?${query}` : ''}`, origin)
const validExchange = async () => ({ data: { session: { user: { id: 'test-user' } } }, error: null })

for (const destination of [
  '/dashboard',
  '/stack',
  '/favourites',
  '/account/settings',
  '/stack?view=saved#products',
  '/dashboard?ref=TEST-CREW',
  '/favourites?search=vitamin%20C',
  '/stack?label=caf%C3%A9',
  '/stack?label=R%26D',
]) {
  test(`keeps supported destination ${destination}`, () => {
    assert.equal(safeAuthReturnPath(destination), destination)
  })
}

for (const destination of [
  null, '', 'dashboard', '?next=/stack', '#/stack',
  'https://outside.example/stack', 'http://outside.example',
  'https://app.example.test/stack', 'javascript:alert(1)', 'data:text/html,test',
  '//outside.example', '///outside.example', '/\\outside.example', '\\outside.example',
  ' /stack', '/stack ', '\t/stack', '/\n/outside.example', '/stack\r\nLocation:evil',
  '/stack?value=\u0000', '/stack?value=\u0085',
  '%2f%2foutside.example', '/%2foutside.example', '/%5coutside.example',
  '%252f%252foutside.example', '/%252foutside.example', '/%255coutside.example',
  '/%25252foutside.example', '/stack?value=%0d%0aLocation%3Aevil',
  '/stack?value=%250d', '/stack?value=%255c', '/stack?value=%25255c',
  '/stack?value=%', '/stack?value=%ZZ', '/stack?value=%C0%AF',
  '/stack?value=%E0%A4%A', '/%73tack', '/stack/../auth/callback',
  '/stack/../stack', '/stack/.', '/stack/', '/auth', '/auth/callback',
  '/api/profile', '/unknown', '/stack?value=' + 'x'.repeat(2048),
  '/stack?value=%25252525252525',
]) {
  const label = destination?.length > 100 ? `${destination.slice(0, 60)}… (${destination.length} characters)` : destination
  test(`rejects unsupported or ambiguous destination ${JSON.stringify(label)}`, () => {
    assert.equal(safeAuthReturnPath(destination), '/dashboard')
  })
}

test('successful exchange is required before returning to a supported local route', async () => {
  let suppliedCode
  const response = await completeAuthCallback(callback('code=synthetic-code&next=%2Fstack%3Fview%3Dsaved'), async code => {
    suppliedCode = code
    return validExchange()
  })
  assert.equal(suppliedCode, 'synthetic-code')
  assert.equal(response.status, 303)
  assert.equal(response.headers.get('location'), `${origin}/stack?view=saved`)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
})

test('successful exchange defaults safely for missing, external or duplicate next parameters', async () => {
  for (const query of ['code=test', 'code=test&next=https%3A%2F%2Foutside.example', 'code=test&next=%2Fstack&next=%2Ffavourites']) {
    const response = await completeAuthCallback(callback(query), validExchange)
    assert.equal(response.headers.get('location'), `${origin}/dashboard`)
  }
})

test('missing, empty, duplicate or provider-denied codes never attempt an exchange', async () => {
  for (const query of [
    '', 'next=https://outside.example', 'code=', 'code=%20%20', 'code=one&code=two',
    'error=access_denied&error_description=private-provider-detail',
    'code=test&error=access_denied', 'code=test&error_code=otp_expired',
    'code=test&error_description=',
  ]) {
    const response = await completeAuthCallback(callback(query), async () => {
      assert.fail('must not contact auth provider')
    })
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), `${origin}/auth?error=callback_failed`)
  }
})

test('expired, rejected, sessionless and thrown exchanges use a fixed failure destination', async () => {
  const exchanges = [
    async () => ({ data: { session: null }, error: { code: 'otp_expired', message: 'private-provider-detail' } }),
    async () => ({ data: { session: null }, error: null }),
    async () => ({ data: { session: { user: {} } }, error: { message: 'failed' } }),
    async () => { throw new Error('private-transport-detail') },
  ]
  for (const exchange of exchanges) {
    const response = await completeAuthCallback(callback('code=private-code&next=https://outside.example'), exchange)
    assert.equal(response.headers.get('location'), `${origin}/auth?error=callback_failed`)
    assert.equal(await response.text(), '')
    assert.equal(response.headers.get('cache-control'), 'no-store')
  }
})

test('only fixed auth error messages reach the sign-in form', () => {
  assert.match(authErrorMessage('callback_failed'), /request a new link/)
  assert.match(authErrorMessage('signout_failed'), /session may still be active/)
  for (const value of [null, '', '<script>alert(1)</script>', 'constructor', '__proto__', 'private-provider-detail']) {
    assert.equal(authErrorMessage(value), '')
  }
})

test('sign-out awaits session invalidation and redirects with 303', async () => {
  let cleared = false
  const response = await completeSignOut(new URL('/auth/signout?next=https://outside.example', origin), async () => {
    await Promise.resolve()
    cleared = true
    return { error: null }
  })
  assert.equal(cleared, true)
  assert.equal(response.status, 303)
  assert.equal(response.headers.get('location'), `${origin}/auth`)
  assert.equal(response.headers.get('cache-control'), 'no-store')
})

test('sign-out errors are not presented as successful session clearance', async () => {
  for (const signOut of [
    async () => ({ error: { message: 'private-provider-detail' } }),
    async () => { throw new Error('private-transport-detail') },
  ]) {
    const response = await completeSignOut(new URL('/auth/signout', origin), signOut)
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), `${origin}/auth?error=signout_failed`)
  }
})

test('HTTP client follows a POST sign-out redirect with GET', async t => {
  const requests = []
  const server = createServer(async (request, response) => {
    requests.push({ method: request.method, path: request.url })
    if (request.url === '/auth/signout') {
      const result = await completeSignOut(new URL(request.url, `http://${request.headers.host}`), async () => ({ error: null }))
      response.writeHead(result.status, Object.fromEntries(result.headers))
      response.end()
    } else {
      response.writeHead(request.method === 'GET' ? 200 : 405)
      response.end('Sign in')
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); server.close() })
  const response = await fetch(`http://127.0.0.1:${server.address().port}/auth/signout`, { method: 'POST' })
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'Sign in')
  assert.deepEqual(requests, [{ method: 'POST', path: '/auth/signout' }, { method: 'GET', path: '/auth' }])
})
