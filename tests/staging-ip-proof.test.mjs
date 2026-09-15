import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const now = 1_789_480_000_000
const key = 'ab'.repeat(32)
const run = 'cd'.repeat(16)
const env = () => ({ NEXT_PUBLIC_TLL_ENVIRONMENT: 'staging', VERCEL: '1', VERCEL_ENV: 'preview',
  TLL_IP_PROOF_ENABLED: 'true', TLL_IP_PROOF_KEY_HEX: key, TLL_IP_PROOF_RUN_ID: run,
  TLL_IP_PROOF_EXPIRES_AT: String(now + 30 * 60 * 1000) })
function fixture(overrides = {}) {
  const config = { ...env(), ...overrides }, loaded = new Map(), logs = []
  const context = vm.createContext({ Request, Response, URL, Buffer, process: { env: config },
    Date: { now: () => now }, fetch: () => assert.fail('Diagnostic must never call a provider'),
    console: { log: (...x) => logs.push(x), error: (...x) => logs.push(x), warn: (...x) => logs.push(x) } })
  function load(path) {
    if (loaded.has(path)) return loaded.get(path)
    const filename = fileURLToPath(new URL(`../${path}`, import.meta.url))
    const output = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText
    const loadedModule = { exports: {} }
    const resolve = name => {
      if (name.startsWith('@/')) return load(name.slice(2) + '.ts')
      if (name === './body-size.mjs') return require('../lib/submissions/body-size.mjs')
      if (name.startsWith('node:')) return require(name)
      assert.fail(`Unexpected diagnostic import ${name}`)
    }
    vm.runInContext(`(function(require,module,exports){${output}\n})`, context)(resolve, loadedModule, loadedModule.exports)
    loaded.set(path, loadedModule.exports)
    return loadedModule.exports
  }
  return { route: load('app/api/staging/ip-proof/route.ts'), logs }
}
const request = (headers = {}, method = 'GET') => new Request('https://preview.example.invalid/api/staging/ip-proof', {
  method, headers: { 'x-tll-ip-proof-key': key, 'x-tll-ip-proof-run': run,
    'x-vercel-forwarded-for': '10.20.30.40', cookie: 'session=PRIVATE_SESSION', authorization: 'Bearer PRIVATE_JWT', ...headers },
})
async function hidden(response) {
  assert.equal(response.status, 404)
  assert.equal(await response.text(), '')
  assert.match(response.headers.get('cache-control'), /no-store/)
}

for (const [label, change] of [
  ['production runtime despite staging marker', { VERCEL_ENV: 'production' }],
  ['production marker despite preview runtime', { NEXT_PUBLIC_TLL_ENVIRONMENT: 'production' }],
  ['synthetic preview', { NEXT_PUBLIC_TLL_ENVIRONMENT: 'synthetic-preview' }],
  ['outside Vercel', { VERCEL: undefined }], ['development', { VERCEL_ENV: 'development' }],
  ['disabled by default', { TLL_IP_PROOF_ENABLED: undefined }], ['false flag', { TLL_IP_PROOF_ENABLED: 'false' }],
  ['missing key', { TLL_IP_PROOF_KEY_HEX: undefined }], ['invalid key', { TLL_IP_PROOF_KEY_HEX: 'secret' }],
  ['missing run', { TLL_IP_PROOF_RUN_ID: undefined }], ['invalid run', { TLL_IP_PROOF_RUN_ID: 'arbitrary' }],
  ['missing expiry', { TLL_IP_PROOF_EXPIRES_AT: undefined }], ['expired', { TLL_IP_PROOF_EXPIRES_AT: String(now) }],
  ['unbounded expiry', { TLL_IP_PROOF_EXPIRES_AT: String(now + 3600001) }],
]) test(`temporary diagnostic is 404: ${label}`, async () => {
  const f = fixture(change); await hidden(f.route.GET(request())); assert.deepEqual(f.logs, [])
})
for (const [label, change] of [
  ['wrong key of correct length', { 'x-tll-ip-proof-key': 'aa'.repeat(32) }],
  ['missing key', { 'x-tll-ip-proof-key': '' }], ['malformed key', { 'x-tll-ip-proof-key': 'not-hex' }],
  ['duplicate key', { 'x-tll-ip-proof-key': `${key}, ${key}` }],
  ['wrong run', { 'x-tll-ip-proof-run': 'ee'.repeat(16) }],
]) test(`credential/run mismatch is 404: ${label}`, async () => { await hidden(fixture().route.GET(request(change))) })

test('actual route and gateway parser expose only a run-scoped fingerprint and test-address flag', async () => {
  const f = fixture(), response = f.route.GET(request({ 'x-forwarded-for': '192.0.2.1', 'x-real-ip': '198.51.100.2', forwarded: 'for=203.0.113.3' }))
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.deepEqual(result, { matches_documentation_spoof: false, fingerprint: createHmac('sha256', Buffer.from(key, 'hex'))
    .update(`tll-ip-proof:v1\n${run}\n10.20.30.40`).digest('hex') })
  const output = JSON.stringify({ result, headers: [...response.headers], logs: f.logs })
  for (const secret of ['10.20.30.40','192.0.2.1','198.51.100.2','203.0.113.3','PRIVATE_SESSION','PRIVATE_JWT',key,run]) assert.ok(!output.includes(secret))
  assert.deepEqual(f.logs, [])
  assert.equal(response.headers.get('vercel-cdn-cache-control'), 'no-store')
  assert.equal(response.headers.get('access-control-allow-origin'), null)
})
for (const address of ['192.0.2.1','198.51.100.2','203.0.113.3','2001:db8::4','2001:0DB8:0:0:0:0:0:4']) {
  test(`documents a failed edge proof when the trusted parser sees the test address ${address}`, async () => {
    const result = await fixture().route.GET(request({ 'x-vercel-forwarded-for': address })).json()
    assert.equal(result.matches_documentation_spoof, true)
    assert.match(result.fingerprint, /^[a-f0-9]{64}$/)
  })
}
test('missing or ambiguous trusted headers remain unavailable without a generic-header fallback', async () => {
  for (const value of ['', '192.0.2.1, 198.51.100.2', 'garbage']) {
    const result = await fixture().route.GET(request({ 'x-vercel-forwarded-for': value, 'x-forwarded-for': '10.20.30.40' })).json()
    assert.deepEqual(result, { matches_documentation_spoof: false, fingerprint: null })
  }
})
test('a new run changes the fingerprint without changing or exposing the client address', async () => {
  const first = await fixture().route.GET(request()).json(), secondRun = 'ef'.repeat(16)
  const second = await fixture({ TLL_IP_PROOF_RUN_ID: secondRun }).route.GET(request({ 'x-tll-ip-proof-run': secondRun })).json()
  assert.notEqual(first.fingerprint, second.fingerprint)
})
test('every other supported method stays 404 without exposing any headers', async () => {
  const f = fixture()
  for (const method of ['HEAD','OPTIONS','POST','PUT','PATCH','DELETE']) await hidden(f.route[method](request({}, method)))
})
test('temporary route has no database, remote transport, header dump or secret literal dependency', () => {
  const source = readFileSync(new URL('../app/api/staging/ip-proof/route.ts', import.meta.url), 'utf8')
  assert.match(source, /timingSafeEqual/)
  assert.doesNotMatch(source, /console\.|fetch\(|\.headers\.entries\(|Object\.fromEntries|sb_secret_|sb_publishable_/)
  assert.ok(existsSync(new URL('../docs/ops/staging-ip-proof.md', import.meta.url)))
})
