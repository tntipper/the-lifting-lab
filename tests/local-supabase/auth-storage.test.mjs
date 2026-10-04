import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import https from 'node:https'
import http from 'node:http'

const API = 'https://127.0.0.1:55521'
const MAIL = 'http://127.0.0.1:55524'
const PROJECT = 'tll-local-integration'
const state = process.env.TLL_LOCAL_SUPABASE_DIR
const users = []
const objectPaths = []
let anon, service, alice, bob, referred, certificate
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3S8AAAAASUVORK5CYII=', 'base64')

// Trust the dedicated local certificate explicitly. TLS verification remains
// enabled; redirects are never followed (especially email links).
function request(url, { method = 'GET', token = anon, body, headers = {} } = {}) {
  const target = new URL(url, API)
  assert.ok([API, MAIL].includes(target.origin), 'Refusing a non-fixture HTTP destination')
  const payload = body === undefined ? undefined : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body))
  return new Promise((resolve, reject) => {
    const req = (target.protocol === 'https:' ? https : http).request(target, {
      method, ca: certificate, timeout: 10000,
      headers: { ...(target.origin === API ? { apikey: anon, Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}), ...headers },
    }, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        const bytes = Buffer.concat(chunks)
        let json
        try { json = JSON.parse(bytes.toString()) } catch {}
        resolve({ status: res.statusCode, headers: res.headers, bytes, json })
      })
    })
    req.on('timeout', () => req.destroy(new Error('Local fixture HTTP timeout')))
    req.on('error', reject)
    req.end(payload)
  })
}
function ok(response, expected = 200) {
  assert.equal(response.status, expected, `Unexpected fixture response status: ${response.status}; code=${response.json?.code ?? response.json?.error_code ?? ''}`)
  return response.json
}
function denied(response) { assert.ok(response.status >= 400 && response.status < 500, `Expected denial, got ${response.status}`) }
const rest = (path, options) => request(`/rest/v1/${path}`, options)
const profile = user => rest(`profiles?id=eq.${user.id}&select=*`, { token: user.token }).then(ok)
const rpc = (name, user, body = {}) => rest(`rpc/${name}`, { method: 'POST', token: user.token, body }).then(ok)
function uuid(value) { assert.match(value, /^[0-9a-f-]{36}$/); return value }

async function signup(label, data = {}) {
  const email = `fixture_${label}_${randomBytes(6).toString('hex')}@example.invalid`
  const password = randomBytes(24).toString('base64url')
  const response = await request('/auth/v1/signup', { method: 'POST', body: { email, password, data } })
  const signed = ok(response)
  assert.equal(signed.access_token, undefined, 'Unconfirmed signup must not get a session')
  const user = { id: uuid(signed.id ?? signed.user?.id), email, password }
  users.push(user)
  // Prove the real GoTrue insertion fired the profile trigger before any helper RPC.
  const rows = ok(await rest(`profiles?id=eq.${user.id}&select=id,total_points,points_spent`, { token: service }))
  assert.equal(rows.length, 1); assert.equal(rows[0].id, user.id)
  assert.equal(rows[0].total_points, 0); assert.equal(rows[0].points_spent, 0)
  denied(await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }))
  return user
}
async function confirm(user) {
  let message
  for (let attempt = 0; attempt < 40; attempt++) {
    const inbox = ok(await request(`${MAIL}/api/v1/messages`))
    message = inbox.messages.find(item => item.To?.some(to => to.Address === user.email))
    if (message) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(message, 'Signup email must be captured in local Mailpit')
  const detail = ok(await request(`${MAIL}/api/v1/message/${message.ID}`))
  const href = detail.HTML.match(/href="([^"]*\/auth\/v1\/verify[^\"]*)"/i)?.[1]
  assert.ok(href, 'Captured email must contain the verification link')
  const verification = new URL(href.replaceAll('&amp;', '&'))
  assert.equal(verification.origin, API)
  const response = await request(verification.href)
  assert.equal(response.status, 303)
  const redirect = new URL(response.headers.location)
  assert.equal(redirect.origin, 'http://127.0.0.1:55530')
  // Inspect the local result only; no browser navigation or redirect request.
  const hash = new URLSearchParams(redirect.hash.slice(1))
  user.token = hash.get('access_token')
  assert.ok(user.token, 'Confirmation should issue a local session')
  const verified = ok(await request('/auth/v1/user', { token: user.token }))
  assert.equal(verified.id, user.id); assert.ok(verified.email_confirmed_at)
  const signed = ok(await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: user.email, password: user.password } }))
  assert.equal(signed.user.id, user.id); assert.ok(signed.access_token)
}

before(async () => {
  assert.ok(state, 'Use run-local.mjs, or set TLL_LOCAL_SUPABASE_DIR to the dedicated CLI project')
  const containers = JSON.parse(execFileSync('docker', ['inspect', `supabase_db_${PROJECT}`, `supabase_auth_${PROJECT}`, `supabase_storage_${PROJECT}`, `supabase_kong_${PROJECT}`, `supabase_inbucket_${PROJECT}`], { encoding: 'utf8' }))
  for (const container of containers) {
    assert.equal(container.Config.Labels['com.supabase.cli.project'], PROJECT)
    for (const bindings of Object.values(container.NetworkSettings.Ports ?? {})) for (const binding of bindings ?? []) assert.equal(binding.HostIp, '127.0.0.1')
    assert.deepEqual(Object.keys(container.NetworkSettings.Networks), [`${PROJECT}-net`])
  }
  const network = JSON.parse(execFileSync('docker', ['network', 'inspect', `${PROJECT}-net`], { encoding: 'utf8' }))[0]
  // Linux host access is supplied by verified loopback relays, not an egress route.
  assert.equal(network.Internal, true)
  assert.equal(network.Options['com.docker.network.bridge.host_binding_ipv4'], '127.0.0.1')
  const authEnv = containers.find(c => c.Name === `/supabase_auth_${PROJECT}`).Config.Env
  assert.ok(authEnv.includes(`GOTRUE_SMTP_HOST=supabase_inbucket_${PROJECT}`))
  assert.ok(authEnv.includes('GOTRUE_SMTP_PORT=1025'))
  assert.ok(authEnv.includes('GOTRUE_MAILER_AUTOCONFIRM=false'))
  const mailEnv = containers.find(c => c.Name === `/supabase_inbucket_${PROJECT}`).Config.Env
  assert.ok(!mailEnv.some(value => /MP_SMTP_RELAY|MP_SMTP_FORWARD/.test(value)), 'Mailpit must have no external relay')
  const status = JSON.parse(execFileSync('npx', ['--yes', 'supabase@2.117.0', 'status', '--workdir', state, '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
  assert.equal(status.API_URL, API)
  certificate = execFileSync('docker', ['exec', `supabase_kong_${PROJECT}`, 'cat', '/home/kong/localhost.crt'])
  anon = status.ANON_KEY; service = status.SERVICE_ROLE_KEY
  assert.ok(anon); assert.ok(service)
  // No credentials, tokens or email contents are printed or persisted.
})

after(async () => {
  if (!service) return
  if (objectPaths.length) ok(await request('/storage/v1/object/avatars', { method: 'DELETE', token: service, body: { prefixes: objectPaths } }))
  for (const user of users) {
    const response = await request(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE', token: service })
    assert.ok([200, 404].includes(response.status), 'Synthetic user cleanup failed')
  }
})

test('real signup creates a profile and captured confirmation enables sign-in', async () => {
  alice = await signup('alice', { total_points: 999999, points_spent: -1000, avatar_id: 'custom-photo' })
  await confirm(alice)
  const rows = await profile(alice)
  assert.equal(rows.length, 1); assert.equal(rows[0].avatar_id, 'barbell')
  assert.equal(rows[0].total_points, 0)
  bob = await signup('bob'); await confirm(bob)
})

test('real JWTs preserve own profile editing and deny authority/cross-user writes', async () => {
  assert.deepEqual(ok(await rest(`profiles?id=eq.${alice.id}&select=id`, { token: bob.token })), [])
  denied(await rest('profiles?select=id'))
  ok(await rest(`profiles?id=eq.${alice.id}`, { method: 'PATCH', token: alice.token, body: { display_name: 'Synthetic Alice' }, headers: { Prefer: 'return=representation' } }))
  assert.equal((await profile(alice))[0].display_name, 'Synthetic Alice')
  for (const body of [{ total_points: 99999 }, { points_spent: -1 }, { referred_by: bob.id }]) denied(await rest(`profiles?id=eq.${alice.id}`, { method: 'PATCH', token: alice.token, body }))
  ok(await rest(`profiles?id=eq.${alice.id}`, { method: 'PATCH', token: bob.token, body: { display_name: 'Not the owner' } }), 204)
  assert.equal((await profile(alice))[0].display_name, 'Synthetic Alice')
})

test('signup points are awarded once through real authenticated RPCs', async () => {
  const awards = await Promise.all(Array.from({ length: 6 }, () => rpc('award_points', alice, { p_action: 'signup', p_ref_id: null })))
  assert.equal(awards.filter(points => points > 0).length, 1)
  const sum = awards.reduce((a, b) => a + b, 0)
  assert.equal((await profile(alice))[0].total_points, sum)
  assert.equal(await rpc('award_points', alice, { p_action: 'referral', p_ref_id: bob.id }), 0)
})

test('signup referral metadata creates a protected link and credits the referrer once', async () => {
  const original = (await profile(alice))[0]
  referred = await signup('referred', { referred_by: original.referral_code })
  await confirm(referred)
  assert.equal((await profile(referred))[0].referred_by, alice.id)
  const awards = await Promise.all(Array.from({ length: 6 }, () => rpc('claim_referral', referred)))
  assert.equal(awards.filter(points => points > 0).length, 1)
  assert.equal((await profile(alice))[0].total_points, original.total_points + awards.reduce((a, b) => a + b, 0))
})

test('real Storage allows own-folder upload/public read and denies anonymous or cross-folder writes', async () => {
  const own = `${alice.id}/fixture.png`; const other = `${bob.id}/fixture.png`
  ok(await request(`/storage/v1/object/avatars/${own}`, { method: 'POST', token: alice.token, body: png, headers: { 'Content-Type': 'image/png' } }))
  objectPaths.push(own)
  const image = await request(`/storage/v1/object/public/avatars/${own}`)
  assert.equal(image.status, 200); assert.deepEqual(image.bytes, png)
  denied(await request(`/storage/v1/object/avatars/${other}`, { method: 'POST', token: alice.token, body: png, headers: { 'Content-Type': 'image/png' } }))
  denied(await request(`/storage/v1/object/avatars/${alice.id}/anonymous.png`, { method: 'POST', body: png, headers: { 'Content-Type': 'image/png' } }))
  denied(await request(`/storage/v1/object/avatars/${own}`, { method: 'PUT', token: bob.token, body: Buffer.from('changed'), headers: { 'Content-Type': 'image/png' } }))
  const removal = await request('/storage/v1/object/avatars', { method: 'DELETE', token: bob.token, body: { prefixes: [own] } })
  assert.ok(removal.status < 500)
  assert.deepEqual((await request(`/storage/v1/object/public/avatars/${own}`)).bytes, png)
})

test('custom avatar selection requires unlock and rejects a different user folder', async () => {
  const url = `${API}/storage/v1/object/public/avatars/${alice.id}/fixture.png`
  const selection = { avatar_type: 'custom_photo', avatar_id: 'custom-photo', avatar_url: url }
  denied(await rest(`profiles?id=eq.${alice.id}`, { method: 'PATCH', token: alice.token, body: selection }))
  assert.equal((await rpc('unlock_avatar', alice, { p_avatar_id: 'custom-photo' })).error, 'insufficient_points')
  // Administrator-only synthetic fixture credit; never a client privilege bypass.
  ok(await rest(`profiles?id=eq.${alice.id}`, { method: 'PATCH', token: service, body: { total_points: 1200 } }), 204)
  const results = await Promise.all(Array.from({ length: 4 }, () => rpc('unlock_avatar', alice, { p_avatar_id: 'custom-photo' })))
  assert.equal(results.filter(result => result.ok).length, 1)
  assert.equal((await profile(alice))[0].points_spent, 1000)
  ok(await rest(`profiles?id=eq.${alice.id}`, { method: 'PATCH', token: alice.token, body: selection }), 204)
  assert.equal((await profile(alice))[0].avatar_url, url)
  denied(await rest(`profiles?id=eq.${alice.id}`, { method: 'PATCH', token: alice.token, body: { ...selection, avatar_url: `${API}/storage/v1/object/public/avatars/${bob.id}/fixture.png` } }))
  denied(await rest(`profiles?id=eq.${bob.id}`, { method: 'PATCH', token: bob.token, body: { avatar_type: 'premium', avatar_id: 'gold-barbell' } }))
})
