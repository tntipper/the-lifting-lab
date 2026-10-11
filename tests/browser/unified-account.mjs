import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'customer@example.test', is_anonymous: false }
const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url')
const token = `${encoded({ alg: 'HS256', typ: 'JWT' })}.${encoded({ sub: user.id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic`
const sessionCookie = `base64-${encoded({ access_token: token, refresh_token: 'synthetic-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user })}`

const listen = async server => {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return server.address().port
}

const json = (response, value, status = 200) => {
  response.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  })
  response.end(JSON.stringify(value))
}

const provider = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://fixture.invalid')
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
      'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    })
    return response.end()
  }
  if (url.pathname === '/auth/v1/user') return json(response, user)
  if (url.pathname === '/rest/v1/rpc/current_season') return json(response, null)
  if (url.pathname === '/rest/v1/rpc/get_user_reviews') return json(response, [])
  if (url.pathname === '/rest/v1/rpc/get_referral_count') return json(response, 0)
  if (url.pathname.startsWith('/rest/v1/rpc/')) return json(response, null)
  if (url.pathname === '/rest/v1/profiles') return json(response, [{
    id: user.id,
    username: 'test_lifter',
    display_name: 'Test Lifter',
    avatar_type: 'standard',
    avatar_id: 'default',
    avatar_url: null,
    total_points: 225,
    points_spent: 0,
    referral_code: 'TEST-CREW',
    referred_by: null,
    created_at: '2026-09-01T10:00:00Z',
  }])
  if (url.pathname === '/rest/v1/points_ledger') return json(response, [])
  if (url.pathname === '/rest/v1/user_stacks') return json(response, [])
  if (url.pathname === '/rest/v1/user_favourites') return json(response, [])
  return json(response, { message: `Unexpected fixture request ${request.method} ${url.pathname}` }, 500)
})

const providerPort = await listen(provider)
const reservation = createServer()
const appPort = await listen(reservation)
await new Promise(resolveClose => reservation.close(resolveClose))
const origin = `http://127.0.0.1:${appPort}`
const cwd = resolve(import.meta.dirname, '../..')
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(appPort)], {
  cwd,
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${providerPort}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon-key',
    NEXT_PUBLIC_TLL_ENVIRONMENT: 'staging',
    NEXT_PUBLIC_TLL_STAGING_CUSTOMER: 'enabled',
    NEXT_PUBLIC_TLL_STAGING_CART: 'disabled',
    TLL_SYNTHETIC_PREVIEW: '0',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
app.stdout.on('data', data => { output += data })
app.stderr.on('data', data => { output += data })

try {
  const deadline = Date.now() + 45_000
  while (!output.includes('Ready in')) {
    if (app.exitCode !== null || Date.now() > deadline) throw new Error(`Next did not start: ${output}`)
    await new Promise(resolveWait => setTimeout(resolveWait, 100))
  }

  const browser = await chromium.launch({ headless: true })
  try {
    const resultDir = resolve(cwd, 'test-results/unified-account')
    await mkdir(resultDir, { recursive: true })
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      await context.addCookies([{ name: 'sb-127-auth-token', value: sessionCookie, url: origin }])
      const page = await context.newPage()
      await page.goto(`${origin}/account`, { waitUntil: 'networkidle' })
      await page.getByRole('heading', { name: 'My account', exact: true }).waitFor()
      assert.equal(await page.getByRole('navigation', { name: 'My account' }).count(), 1)
      assert.equal(await page.getByRole('link', { name: 'Orders', exact: true }).count(), 1)
      await page.getByRole('link', { name: 'My Account', exact: true }).waitFor()
      assert.equal(await page.getByText('Test Lifter', { exact: true }).count() > 0, true)
      assert.equal(await page.locator('body').evaluate(element => element.scrollWidth <= element.clientWidth), true)
      await page.screenshot({ path: resolve(resultDir, `${width}-account.png`), fullPage: true })
      await context.close()
    }
  } finally {
    await browser.close()
  }
  console.log('PASS: unified account renders at phone and desktop widths with no horizontal page overflow')
} finally {
  provider.closeAllConnections()
  provider.close()
  if (app.exitCode === null) {
    app.kill('SIGTERM')
    await once(app, 'exit')
  }
}
