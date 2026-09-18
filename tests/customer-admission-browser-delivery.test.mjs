import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { build } from 'esbuild'
import { createAesGcmEnvelopeVault } from '../lib/identity/customer-token-vault.ts'
const bundle = await build({ stdin: { contents: "export * from './lib/identity/customer-admission-browser-delivery.ts'; export * from './lib/identity/customer-admission-bridge-continuation.ts'", resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' })
const { createCustomerAdmissionBrowserDelivery: delivery, createCustomerAdmissionBridgeContinuation: continuation } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const ORIGIN = 'https://the-lifting-synthetic-my-lifting-lab-s-projects.vercel.app', BOOT = '__Host-tll-customer-start', TX = '__Host-tll-customer-transaction'
const vault = () => createAesGcmEnvelopeVault({ activeKeyId: 'browser-synthetic', keys: new Map([['browser-synthetic', randomBytes(32)]]) })
function fixture(changes = {}) {
  let calls = 0, at = Date.now(); const fail = () => { calls++; throw Error('No repository or HTTP work expected') }
  const cookieVault = vault(), provisionalVault = vault(), options = { applicationOrigin: ORIGIN, syntheticExecution: true, publishableKey: 'sb_publishable_synthetic00000000000',
    provisionalPool: { connect: fail }, bridgePool: { connect: fail }, brokerPool: { connect: fail }, vault: provisionalVault, cookieVault,
    readAccessToken: fail, sessionTransport: fail, admissionTransport: fail,
    shopifyProof: { start: fail, complete: fail }, shopifyProofRepository: { verifiedSubject: fail }, subjectBrokerClientSecret: 's'.repeat(64),
    now: () => at, ...changes }
  return { api: delivery(options), options, count: () => calls, cookieVault, advance: ms => { at += ms }, close() { cookieVault.destroy(); provisionalVault.destroy() } }
}
const request = (path = 'prepare', fields = { mode: 'sign_in' }, changes = {}) => new Request(ORIGIN + '/auth/customer/' + path, { method: 'POST',
  headers: { origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'content-type': 'application/x-www-form-urlencoded', ...changes.headers }, body: new URLSearchParams(fields), ...changes })
const cookie = r => r.headers.getSetCookie()[0].split(';')[0]
const open = (f, c, name = BOOT) => f.cookieVault.open(JSON.parse(Buffer.from(c.slice(c.indexOf('=') + 1), 'base64url').toString()), ['tll-customer-browser-cookie/v1', ORIGIN, name, '/'])
async function held(r) { assert.equal(r.status, 409); assert.deepEqual(await r.json(), { status: 'held' }); assert.equal(r.headers.has('location'), false); assert.equal(r.headers.has('set-cookie'), false) }

test('disabled, live, browser and foreign origin configurations touch no vault, database or HTTP ports', async t => {
  for (const changes of [{ syntheticExecution: false }, { liveEnabled: true }, { applicationOrigin: 'https://example.com' }, { applicationOrigin: ORIGIN + '/' }]) await t.test(JSON.stringify(changes), async () => {
    const f = fixture(changes); for (const method of ['prepare', 'start', 'recover', 'admit']) await held(await f.api[method](request()))
    assert.equal(f.count(), 0); f.close()
  })
  globalThis.window = {}
  try { const f = fixture(); await held(await f.api.prepare(request())); assert.equal(f.count(), 0); f.close() } finally { delete globalThis.window }
  const f = fixture(); f.options.cookieVault = f.options.vault // captured options cannot switch custody after construction
  assert.equal((await f.api.prepare(request())).status, 200); f.close()
  const shared = vault(), g = fixture({ vault: shared, cookieVault: shared }); await held(await g.api.prepare(request())); shared.destroy(); g.close()
})
test('bootstrap uses authenticated __Host HttpOnly Secure SameSite custody and rereads without replacing its browser binding', async () => {
  const f = fixture(), r = await f.api.prepare(request()), c = cookie(r), body = await r.json(), b = open(f, c)
  assert.equal(r.status, 200); assert.deepEqual(Object.keys(body), ['csrf']); assert.equal(body.csrf, b.csrf)
  assert.equal(Buffer.from(b.browserSecret, 'base64url').length, 32); assert.notEqual(b.browserSecret, b.csrf)
  assert.match(r.headers.get('set-cookie'), /; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Expires=/)
  assert.doesNotMatch(r.headers.get('set-cookie'), /Domain=/); assert.match(r.headers.get('cache-control'), /no-store/)
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer'); assert.equal(c.includes(b.browserSecret), false)
  const again = await f.api.prepare(request('prepare', { mode: 'sign_in' }, { headers: { origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'content-type': 'application/x-www-form-urlencoded', cookie: c } }))
  assert.deepEqual(open(f, cookie(again)), b); assert.deepEqual(await again.json(), body)
  assert.throws(() => open(f, c, TX)); assert.equal(f.count(), 0); f.close()
})
test('method/origin/fetch metadata/path/content type/duplicate fields and malformed mode are denied before ports', async t => {
  for (const changes of [
    { method: 'PUT' }, { headers: { origin: 'https://evil.example' } }, { headers: { origin: ORIGIN, 'sec-fetch-site': 'same-site', 'content-type': 'application/x-www-form-urlencoded' } },
    { headers: { origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'content-type': 'text/plain' } },
    { headers: { origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'content-type': 'application/x-www-form-urlencoded', 'content-length': '513' } },
    { body: 'mode=sign_in&mode=migration' }, { body: 'mode=sign_in&browserSecret=chosen' }, { body: 'mode=unknown' }, { body: 'mode=' + 'x'.repeat(600) },
  ]) await t.test(JSON.stringify(changes), async () => { const f = fixture(); await held(await f.api.prepare(request('prepare', {}, changes))); assert.equal(f.count(), 0); f.close() })
  for (const suffix of ['prepare?mode=sign_in', 'prepare/', '%70repare']) { const f = fixture(); await held(await f.api.prepare(request(suffix))); assert.equal(f.count(), 0); f.close() }
})
test('strict CSRF, retained mode, duplicate/malformed/foreign cookie and active transaction rejection occur before admission', async () => {
  const f = fixture(), p = await f.api.prepare(request()), c = cookie(p), { csrf } = await p.json()
  const headers = { origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'content-type': 'application/x-www-form-urlencoded' }
  for (const [value, fields] of [[c, { csrf: 'wrong', mode: 'sign_in' }], [c, { csrf, mode: 'migration' }], [c + '; ' + c, { csrf, mode: 'sign_in' }],
    [c + '; ' + TX + '=x', { csrf, mode: 'sign_in' }], [BOOT + '=AAAA', { csrf, mode: 'sign_in' }], ['', { csrf, mode: 'sign_in' }], [c, { csrf, mode: 'sign_in', verified: 'true' }]]) {
    await held(await f.api.start(request('start', fields, { headers: { ...headers, cookie: value } })))
  }
  const foreign = fixture(); await held(await foreign.api.start(request('start', { csrf, mode: 'sign_in' }, { headers: { ...headers, cookie: c } })))
  assert.equal(f.count(), 0); assert.equal(foreign.count(), 0); f.close(); foreign.close()
})
test('expired start window never refreshes or replaces binding; malformed cookies cannot mint a replacement', async () => {
  const f = fixture(), p = await f.api.prepare(request()), c = cookie(p), { csrf } = await p.json()
  f.advance(300000)
  const headers = { origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'content-type': 'application/x-www-form-urlencoded', cookie: c }
  await held(await f.api.prepare(request('prepare', { mode: 'sign_in' }, { headers })))
  await held(await f.api.start(request('start', { csrf, mode: 'sign_in' }, { headers })))
  f.advance(300000); await held(await f.api.prepare(request('prepare', { mode: 'sign_in' }, { headers })))
  await held(await f.api.prepare(request('prepare', { mode: 'sign_in' }, { headers: { ...headers, cookie: BOOT + '=x' } })))
  assert.equal(f.count(), 0); f.close()
})
test('slow request body has one total deadline and is cancelled without ports', async () => {
  let cancelled = false
  const f = fixture(), body = new ReadableStream({ pull() { return new Promise(() => {}) }, cancel() { cancelled = true } })
  const at = Date.now(); await held(await f.api.prepare(request('prepare', {}, { body, duplex: 'half' })))
  assert.ok(Date.now() - at >= 900 && Date.now() - at < 2000); assert.equal(cancelled, true); assert.equal(f.count(), 0); f.close()
})


test('cookie ciphertext tampering and expired/malformed constructor deadlines fail without authority work', async () => {
  const f=fixture(), r=await f.api.prepare(request()), c=cookie(r), {csrf}=await r.json()
  const raw=c.slice(c.indexOf('=')+1), envelope=JSON.parse(Buffer.from(raw,'base64url').toString())
  envelope.ciphertext=(envelope.ciphertext[0]==='A'?'B':'A')+envelope.ciphertext.slice(1)
  const altered=BOOT+'='+Buffer.from(JSON.stringify(envelope)).toString('base64url')
  await held(await f.api.start(request('start',{mode:'sign_in',csrf},{headers:{origin:ORIGIN,'sec-fetch-site':'same-origin','content-type':'application/x-www-form-urlencoded',cookie:altered}})))
  for(const transactionExpiresAt of [null,NaN,Infinity,0,-1,1.5,Date.now()-1000,Number.MAX_SAFE_INTEGER]) {
    const result=await continuation({...f.options,transactionExpiresAt}).startMigration({browserSecret:randomBytes(32).toString('base64url')})
    assert.equal(result.status,'held')
  }
  assert.equal(f.count(),0); f.close()
})
