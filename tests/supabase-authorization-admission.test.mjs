import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { resolve } from 'node:path'

const bundle = await build({ entryPoints: ['lib/identity/supabase-authorization-admission.ts'], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' })
const { createSupabaseAuthorizationAdmission: adapter, SupabaseAdmissionHeld } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const nativeBundle = await build({ stdin: { contents: "export * from './lib/identity/supabase-authorization-admission.ts'; export { probe } from './tests/fixtures/customer-https-probe.mjs'", resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent', plugins: [{ name: 'offline-native-https', setup(build) {
    build.onResolve({ filter: /^node:https$/ }, () => ({ path: resolve('tests/fixtures/customer-https-probe.mjs') }))
  } }] })
const native = await import(`data:text/javascript;base64,${Buffer.from(nativeBundle.outputFiles[0].text).toString('base64')}`)
const ISSUER = 'https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1'
const ORIGIN = 'https://the-lifting-synthetic-my-lifting-lab-s-projects.vercel.app'
const PROVIDER = 'custom:tll-staging-subject-broker-v1', CLIENT = 'tll-staging-subject-broker-v1'
const STATE = '99999999-8888-4777-8666-555555555555', CHALLENGE = Buffer.alloc(32, 21).toString('base64url'), OUTER = Buffer.alloc(32, 22).toString('base64url')
const KEY = 'sb_publishable_synthetic000000000000', TOKEN = 'synthetic.original.token'
const input = { applicationPkceChallenge: CHALLENGE }, migrationInput = { ...input, accessToken: TOKEN }
const options = transport => ({ enabled: true, applicationOrigin: ORIGIN, publishableKey: KEY, transport })
function broker(changes = {}, extra = '') {
  return `${ORIGIN}/auth/customer/authorize?${new URLSearchParams({ response_type: 'code', client_id: CLIENT, redirect_uri: `${ISSUER}/callback`, scope: 'subject', state: STATE,
    code_challenge_method: 'S256', code_challenge: OUTER, ...changes })}${extra}`
}
const response = (request, migration = false, returned = broker()) => ({ url: request.url, status: migration ? 200 : 302,
  headers: migration ? [['content-type', 'application/json; charset=utf-8']] : [['location', returned]], body: migration ? Buffer.from(JSON.stringify({ url: returned })) : Buffer.alloc(0) })
const held = outcome => error => {
  assert.ok(error instanceof SupabaseAdmissionHeld)
  assert.equal(error.outcome, outcome)
  assert.equal(error.code, 'SUPABASE_ADMISSION_HELD')
  assert.equal(error.message, 'Customer authorization admission held')
  assert.equal(error.cause, undefined)
  assert.doesNotMatch(JSON.stringify(error), /synthetic|original|token|vercel|private-provider/)
  return true
}

test('sign-in constructs only the fixed project/provider/application PKCE request and captures one redirect', async () => {
  const calls = []
  const result = await adapter(options(async request => { calls.push(request); return response(request) })).authorizeSignIn(input)
  assert.equal(calls.length, 1)
  const request = calls[0], url = new URL(request.url)
  assert.equal(`${url.origin}${url.pathname}`, `${ISSUER}/authorize`)
  assert.deepEqual(Object.fromEntries(url.searchParams), { provider: PROVIDER, redirect_to: `${ORIGIN}/auth/customer/callback`, scopes: 'subject', code_challenge: CHALLENGE, code_challenge_method: 's256' })
  assert.equal(request.method, 'GET')
  assert.equal(request.headers.apikey, KEY)
  assert.equal(request.headers.authorization, undefined)
  assert.equal(request.headers.cookie, undefined)
  assert.equal(request.body, undefined)
  assert.equal(request.headers['cache-control'], 'no-store')
  assert.equal(request.headers['accept-encoding'], 'identity')
  assert.ok(Object.isFrozen(request.headers))
  assert.equal(result.authorizationUrl, broker())
  assert.equal(result.authorizationQuery, new URL(broker()).search.slice(1))
  assert.ok(Object.isFrozen(result))
  assert.equal(request.signal.aborted, true)
})

test('migration sends the exact original bearer only to fixed linkIdentity and requires JSON success', async () => {
  const calls = []
  const result = await adapter(options(async request => { calls.push(request); return response(request, true) })).authorizeMigration(migrationInput)
  assert.equal(calls.length, 1)
  const request = calls[0], url = new URL(request.url)
  assert.equal(`${url.origin}${url.pathname}`, `${ISSUER}/user/identities/authorize`)
  assert.equal(url.searchParams.get('skip_http_redirect'), 'true')
  assert.equal(url.searchParams.get('provider'), PROVIDER)
  assert.equal(url.searchParams.get('redirect_to'), `${ORIGIN}/auth/customer/callback`)
  assert.equal(request.headers.authorization, `Bearer ${TOKEN}`)
  assert.ok(!request.url.includes(TOKEN))
  assert.ok(!JSON.stringify(result).includes(TOKEN))
  assert.equal(result.authorizationUrl, broker())
})

test('unrecognized OAuth extensions are discarded; expected forwarded extensions are accepted', async () => {
  const result = await adapter(options(async request => response(request, true, broker({ prompt: 'select_account', nonce: 'synthetic-nonce',
    redirect_to: `${ORIGIN}/auth/customer/callback`, skip_http_redirect: 'true', provider: PROVIDER, scopes: 'subject', hint: TOKEN })))).authorizeMigration(migrationInput)
  assert.equal(result.authorizationUrl, broker())
  assert.doesNotMatch(JSON.stringify(result), /nonce|prompt|hint|synthetic-nonce|original.token|skip_http_redirect/)
})

test('constructor configuration is captured immutably across the in-flight request', async () => {
  let release
  const config = options(request => new Promise(resolve => { release = () => resolve(response(request)) }))
  const client = adapter(config), operation = client.authorizeSignIn(input)
  await Promise.resolve()
  config.applicationOrigin = 'https://evil.example'; config.enabled = false; config.publishableKey = 'secret'
  release()
  assert.equal((await operation).authorizationUrl, broker())
})

test('default-disabled, browser, configuration and argument failures occur before dispatch', async t => {
  const configurations = [
    ['disabled', { enabled: false }], ['unset enabled', { enabled: undefined }], ['wrong preview owner', { applicationOrigin: 'https://arbitrary.vercel.app' }],
    ['production', { applicationOrigin: 'https://www.theliftinglab.co.uk' }], ['trailing slash', { applicationOrigin: `${ORIGIN}/` }],
    ['port', { applicationOrigin: `${ORIGIN}:443` }], ['query', { applicationOrigin: `${ORIGIN}?a=b` }], ['origin suffix', { applicationOrigin: `${ORIGIN}.evil.example` }],
    ['non HTTPS', { applicationOrigin: ORIGIN.replace('https:', 'http:') }], ['credentials', { applicationOrigin: ORIGIN.replace('https://', 'https://user@') }],
    ['missing key', { publishableKey: undefined }], ['secret key', { publishableKey: 'sb_secret_never_allowed' }],
    ['short timeout', { timeoutMs: 49 }], ['long timeout', { timeoutMs: 10001 }], ['fraction timeout', { timeoutMs: 75.5 }],
  ]
  for (const [name, change] of configurations) await t.test(name, async () => {
    let calls = 0
    await assert.rejects(adapter({ ...options(async () => { calls++; throw Error('unexpected') }), ...change }).authorizeSignIn(input), held('not_attempted'))
    assert.equal(calls, 0)
  })
  for (const challenge of [undefined, null, '', 'short', `${CHALLENGE}=`, `${CHALLENGE.slice(0, -1)}_`]) await t.test(`invalid challenge ${String(challenge).length}`, async () => {
    let calls = 0
    await assert.rejects(adapter(options(async () => { calls++ })).authorizeSignIn({ applicationPkceChallenge: challenge }), held('not_attempted'))
    assert.equal(calls, 0)
  })
  for (const accessToken of [undefined, null, '', 'Bearer x', `${TOKEN}\r\nleak: yes`, 'x'.repeat(16385)]) await t.test(`invalid migration token ${String(accessToken).length}`, async () => {
    let calls = 0
    await assert.rejects(adapter(options(async () => { calls++ })).authorizeMigration({ ...input, accessToken }), held('not_attempted'))
    assert.equal(calls, 0)
  })
  globalThis.window = {}
  try { await assert.rejects(adapter(options(async () => { throw Error('unexpected') })).authorizeSignIn(input), held('not_attempted')) }
  finally { delete globalThis.window }
})

test('outer URL validation rejects transplant, incorrect protocol bindings and duplicate parameters', async t => {
  const cases = [
    ['foreign origin', broker().replace(ORIGIN, 'https://evil.example')],
    ['different approved preview', broker().replace('-synthetic-', '-other-')],
    ['wrong path', broker().replace('/auth/customer/authorize', '/auth/shopify/callback')],
    ['fragment', `${broker()}#secret`], ['empty fragment', `${broker()}#`], ['relative', new URL(broker()).pathname + new URL(broker()).search],
    ['credentials', broker().replace('https://', 'https://user:pass@')], ['raw whitespace', `${broker()} `],
    ['protocol', broker().replace('https:', 'http:')], ['response type', broker({ response_type: 'token' })],
    ['client', broker({ client_id: 'other' })], ['callback', broker({ redirect_uri: `${ORIGIN}/auth/customer/callback` })],
    ['scope', broker({ scope: 'subject email' })], ['state', broker({ state: 'not-a-uuid' })], ['PKCE method', broker({ code_challenge_method: 'plain' })],
    ['same PKCE', broker({ code_challenge: CHALLENGE })], ['invalid PKCE', broker({ code_challenge: 'x'.repeat(43) })],
    ['duplicate encoded state', broker({}, `&%73tate=${STATE}`)], ['duplicate case', broker({}, `&STATE=${STATE}`)],
    ['duplicate unknown', broker({ extra: '1' }, '&extra=2')], ['malformed encoding', broker({}, '&x=%GG')],
    ['invalid UTF8', broker({}, '&x=%FF')], ['encoded controls', broker({}, '&x=%0D%0A')],
    ['error', broker({ error: 'access_denied' })], ['token', broker({ access_token: TOKEN })], ['secret', broker({ client_secret: 'private-provider-secret' })],
    ['wrong provider', broker({ provider: 'google' })], ['wrong final callback', broker({ redirect_to: 'https://evil.example' })],
    ['extra scope', broker({ scopes: 'email' })], ['unexpected skip flag', broker({ skip_http_redirect: 'true' })], ['oversized URL', broker({ hint: 'x'.repeat(8192) })],
  ]
  for (const [name, url] of cases) await t.test(name, async () => {
    let calls = 0
    await assert.rejects(adapter(options(async request => { calls++; return response(request, false, url) })).authorizeSignIn(input), held('uncertain'))
    assert.equal(calls, 1)
  })
})

test('wrong status, malformed or incomplete HTTP responses hold with no retry', async t => {
  const cases = [
    ['missing location', r => ({ ...r, headers: [] })], ['duplicate location', r => ({ ...r, headers: [...r.headers, ['Location', broker()]] })],
    ['redirect status', r => ({ ...r, status: 307 })], ['error status', r => ({ ...r, status: 400 })],
    ['unexpected JSON', r => ({ ...r, status: 200 })], ['wrong response URL', r => ({ ...r, url: broker() })],
    ['compressed', r => ({ ...r, headers: [...r.headers, ['content-encoding', 'gzip']] })],
    ['wrong length', r => ({ ...r, headers: [...r.headers, ['content-length', '2']] })],
    ['ambiguous framing', r => ({ ...r, headers: [...r.headers, ['content-length', '0'], ['transfer-encoding', 'chunked']] })],
    ['huge headers', r => ({ ...r, headers: [...r.headers, ['x-extra', 'x'.repeat(16384)]] })],
    ['header newline', r => ({ ...r, headers: [...r.headers, ['x-extra', 'a\r\nb']] })],
    ['huge body', r => ({ ...r, body: Buffer.alloc(32769) })], ['wrong body', r => ({ ...r, body: '' })],
  ]
  for (const [name, mutate] of cases) await t.test(name, async () => {
    let calls = 0
    await assert.rejects(adapter(options(async request => { calls++; return mutate(response(request)) })).authorizeSignIn(input), held('uncertain'))
    assert.equal(calls, 1)
  })
})

test('migration requires a complete JSON URL and ignores unrelated response extensions', async t => {
  const cases = [
    ['redirect', r => ({ ...r, status: 302, headers: [['location', broker()]] })],
    ['location on JSON', r => ({ ...r, headers: [...r.headers, ['location', broker()]] })],
    ['wrong media', r => ({ ...r, headers: [['content-type', 'text/plain']] })],
    ['duplicate media', r => ({ ...r, headers: [...r.headers, ['Content-Type', 'application/json']] })],
    ['empty JSON', r => ({ ...r, body: Buffer.alloc(0) })], ['invalid UTF8', r => ({ ...r, body: Buffer.from([255]) })],
    ['error with URL', r => ({ ...r, body: Buffer.from(JSON.stringify({ url: broker(), error: 'private-provider-error' })) })],
    ['missing URL', r => ({ ...r, body: Buffer.from('{}') })], ['array', r => ({ ...r, body: Buffer.from('[]') })],
    ['wrong skip flag', r => ({ ...r, body: Buffer.from(JSON.stringify({ url: broker({ skip_http_redirect: 'false' }) })) })],
  ]
  for (const [name, mutate] of cases) await t.test(name, async () => {
    let calls = 0
    await assert.rejects(adapter(options(async request => { calls++; return mutate(response(request, true)) })).authorizeMigration(migrationInput), held('uncertain'))
    assert.equal(calls, 1)
  })
  const result = await adapter(options(async request => ({ ...response(request, true), body: Buffer.from(JSON.stringify({ url: broker(), future_extension: { token: TOKEN } })) }))).authorizeMigration(migrationInput)
  assert.equal(result.authorizationUrl, broker())
  assert.ok(!JSON.stringify(result).includes(TOKEN))
})

test('dispatch exceptions, timeouts and late completions remain uncertain without a second call', async () => {
  let calls = 0
  await assert.rejects(adapter(options(async () => { calls++; throw Error(`private-provider-error ${TOKEN}`) })).authorizeMigration(migrationInput), held('uncertain'))
  assert.equal(calls, 1)
  let captured, complete
  const operation = adapter({ ...options(request => { captured = request; return new Promise(resolve => { complete = resolve }) }), timeoutMs: 50 }).authorizeSignIn(input)
  await assert.rejects(operation, held('uncertain'))
  assert.equal(captured.signal.aborted, true)
  complete(response(captured))
  await Promise.resolve()
})

test('native HTTPS boundary preserves TLS verification and does not follow Location or propagate cookies', async () => {
  native.probe.calls.length = 0
  native.probe.scenario = { status: 302, rawHeaders: ['location', broker(), 'set-cookie', 'private-provider-cookie=1'] }
  const result = await native.createSupabaseAuthorizationAdmission(options(undefined)).authorizeSignIn(input)
  assert.equal(result.authorizationUrl, broker())
  assert.equal(native.probe.calls.length, 1)
  const call = native.probe.calls[0]
  assert.ok(call.url.startsWith(`${ISSUER}/authorize?`))
  assert.equal(call.options.rejectUnauthorized, true)
  assert.equal(call.options.agent.options.rejectUnauthorized, true)
  assert.equal(call.options.agent.options.keepAlive, false)
  assert.equal(call.options.maxHeaderSize, 16384)
  assert.equal(call.options.headers.cookie, undefined)
  assert.equal(call.body, undefined)
  assert.equal(call.options.signal.aborted, true)
  assert.doesNotMatch(JSON.stringify(result), /private-provider-cookie/)
})

test('native migration path accepts only JSON at the fixed endpoint and aborts incomplete/oversized bodies', async t => {
  native.probe.calls.length = 0
  native.probe.scenario = { chunks: [Buffer.from(JSON.stringify({ url: broker() }))] }
  assert.equal((await native.createSupabaseAuthorizationAdmission(options(undefined)).authorizeMigration(migrationInput)).authorizationUrl, broker())
  assert.equal(native.probe.calls.length, 1)
  assert.equal(native.probe.calls[0].options.headers.authorization, `Bearer ${TOKEN}`)
  for (const [name, scenario] of [
    ['incomplete', { complete: false }], ['aborted', { aborted: true }], ['oversized', { chunks: [Buffer.alloc(32769)] }],
    ['redirect', { status: 302, rawHeaders: ['location', broker()] }], ['encoded', { headers: { 'content-encoding': 'gzip' } }], ['socket', { error: true }],
  ]) await t.test(name, async () => {
    native.probe.calls.length = 0; native.probe.scenario = scenario
    await assert.rejects(native.createSupabaseAuthorizationAdmission(options(undefined)).authorizeMigration(migrationInput), error => error.outcome === 'uncertain' && !error.cause)
    assert.equal(native.probe.calls.length, 1)
  })
})
