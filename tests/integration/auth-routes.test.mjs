// Real Next route handlers and Supabase cookie adapter; all auth traffic goes
// to a loopback fixture. No real account, credential, email or database is used.
// Run separately: node --test tests/integration/auth-routes.test.mjs
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const syntheticUser = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', email: 'test@example.test' }
const base64 = value => Buffer.from(JSON.stringify(value)).toString('base64url')
const token = `${base64({ alg: 'HS256', typ: 'JWT' })}.${base64({ sub: syntheticUser.id, exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic-signature`

test('auth routes preserve session cookies and complete POST sign-out', { timeout: 120000 }, async t => {
  const calls = []
  const provider = createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request) body += chunk
    calls.push({ method: request.method, url: request.url, body: body ? JSON.parse(body) : null })

    if (request.url === '/auth/v1/token?grant_type=pkce') {
      response.setHeader('Content-Type', 'application/json')
      if (JSON.parse(body).auth_code === 'expired-code') {
        response.writeHead(400)
        response.end(JSON.stringify({ error: 'invalid_grant', error_description: 'Synthetic expired code', code: 'otp_expired' }))
      } else {
        response.end(JSON.stringify({ access_token: token, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, user: syntheticUser }))
      }
    } else if (request.url === '/auth/v1/logout?scope=global') {
      response.writeHead(204)
      response.end()
    } else {
      response.writeHead(500)
      response.end('Unexpected fixture request')
    }
  })
  provider.listen(0, '127.0.0.1')
  await once(provider, 'listening')
  t.after(() => { provider.closeAllConnections(); provider.close() })

  const portReservation = createServer()
  portReservation.listen(0, '127.0.0.1')
  await once(portReservation, 'listening')
  const appPort = portReservation.address().port
  await new Promise(resolve => portReservation.close(resolve))
  // Next normalises the incoming loopback IP to localhost in request.url.
  const appOrigin = `http://localhost:${appPort}`
  const cwd = fileURLToPath(new URL('../../', import.meta.url))
  const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(appPort)], {
    cwd,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${provider.address().port}`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon-key',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(async () => {
    if (app.exitCode === null) {
      app.kill('SIGTERM')
      await once(app, 'exit')
    }
  })
  let output = ''
  app.stdout.on('data', data => { output += data.toString() })
  app.stderr.on('data', data => { output += data.toString() })
  const deadline = Date.now() + 30000
  while (!output.includes('Ready in')) {
    if (app.exitCode !== null || Date.now() > deadline) assert.fail(`Next failed to become ready: ${output}`)
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  const request = (path, options = {}) => fetch(`http://127.0.0.1:${appPort}${path}`, { redirect: 'manual', ...options })

  await t.test('missing code fails locally without contacting the provider', async () => {
    const response = await request('/auth/callback?next=https%3A%2F%2Foutside.example')
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), `${appOrigin}/auth?error=callback_failed`)
    assert.equal(calls.length, 0)
  })

  const verifierCookie = `sb-127-auth-token-code-verifier=base64-${base64('synthetic-code-verifier')}`
  let sessionCookie
  await t.test('successful callback writes the SSR session cookie before redirecting', async () => {
    const response = await request('/auth/callback?code=valid-code&next=%2Fstack', { headers: { Cookie: verifierCookie } })
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), `${appOrigin}/stack`)
    assert.equal(calls[0].body.auth_code, 'valid-code')
    assert.equal(calls[0].body.code_verifier, 'synthetic-code-verifier')
    sessionCookie = response.headers.getSetCookie().find(cookie => cookie.startsWith('sb-127-auth-token='))
    assert.ok(sessionCookie, 'session cookie must survive returning a standard Web Response from Next')
    assert.match(sessionCookie, /Path=\//i)
  })

  await t.test('expired callback has no session and a controlled error redirect', async () => {
    const response = await request('/auth/callback?code=expired-code&next=%2Fstack', { headers: { Cookie: verifierCookie } })
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), `${appOrigin}/auth?error=callback_failed`)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.ok(!response.headers.getSetCookie().some(cookie => cookie.startsWith('sb-127-auth-token=base64-')))
  })

  await t.test('sign-out invalidates the session and expires the browser cookie with 303', async () => {
    assert.ok(sessionCookie)
    const response = await request('/auth/signout', { method: 'POST', headers: { Cookie: sessionCookie.split(';', 1)[0] } })
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), `${appOrigin}/auth`)
    assert.ok(calls.some(call => call.method === 'POST' && call.url === '/auth/v1/logout?scope=global'))
    const clearedCookie = response.headers.getSetCookie().find(cookie => cookie.startsWith('sb-127-auth-token='))
    assert.match(clearedCookie, /^sb-127-auth-token=;/)
    assert.match(clearedCookie, /Max-Age=0/i)
  })

  await t.test('signed-out dashboard redirects to the sign-in page', async () => {
    const response = await request('/dashboard')
    assert.equal(response.status, 307)
    assert.equal(new URL(response.headers.get('location'), appOrigin).pathname, '/auth')
  })

  await t.test('sign-in destination is a GET page and sign-out rejects GET', async () => {
    assert.equal((await request('/auth')).status, 200)
    assert.equal((await request('/auth/signout')).status, 405)
  })
})
