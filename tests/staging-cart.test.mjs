import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { relative } from 'node:path'
import vm from 'node:vm'
import { randomUUID, createHash } from 'node:crypto'

const require = createRequire(import.meta.url), ts = require('typescript')
function modules({ env = {}, fetch = async () => { throw new Error('Unexpected network') }, postgresRuntime = () => { throw Error('Unexpected database factory') } } = {}) {
  const cache = new Map()
  function load(path) {
    if (cache.has(path)) return cache.get(path)
    const filename = fileURLToPath(new URL('../' + path, import.meta.url)), loaded = { exports: {} }
    const code = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const local = name => name === '@/lib/server/staging-postgres' ? { STAGING_POSTGRES_PROJECT_REF: 'qdmvngjwkcsilzmqksme', createStagingPostgresRuntime: postgresRuntime }
      : name === '@/lib/supabase-server' ? { createServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } }) }
      : name.startsWith('@/') ? load(name.slice(2) + '.ts')
        : name.startsWith('.') ? load(relative(fileURLToPath(new URL('../', import.meta.url)), fileURLToPath(new URL(/\.[mc]?[jt]s$/.test(name) ? name : name + '.ts', new URL('../' + path, import.meta.url))))) : require(name)
    vm.runInNewContext(code, { module: loaded, exports: loaded.exports, require: local, Buffer, Map, Uint8Array, URL, Request, Response, Headers, AbortSignal, TextDecoder, process: { env }, fetch, console }, { filename })
    cache.set(path, loaded.exports); return loaded.exports
  }
  return load
}
const load = modules(), sf = load('lib/commerce/staging-cart-storefront.ts'), svc = load('lib/commerce/staging-cart-service.ts'), http = load('lib/commerce/staging-cart-http.ts')
const transitions = load('lib/commerce/staging-cart-transition.ts')
const { createAesGcmEnvelopeVault } = load('lib/identity/customer-token-vault.ts')
const ORIGIN = 'https://the-lifting-lab-git-codex-tll-4adea2-my-lifting-lab-s-projects.vercel.app'
const RAW_CART = 'gid://shopify/Cart/synthetic-cart?key=PRIVATE-CART-KEY-NEVER-RETURN'
const LINE = 'gid://shopify/CartLine/synthetic'
const HMAC = 'a'.repeat(64), ACTOR = '70000000-0000-4000-8000-000000000001'
const jsonResponse = value => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json', 'x-shopify-api-version': sf.STOREFRONT_VERSION } })
const hash = value => createHash('sha256').update(value).digest('hex')

function fixture(faults = {}) {
  const rows = new Map(), ops = new Map(), transitionRows = new Map(), calls = []
  let count = 0, actor = null, authReads = 0
  const variant = () => ({ id: faults.wrongVariant ? 'gid://shopify/ProductVariant/9' : sf.STAGING_SHOPIFY_VARIANT,
    availableForSale: !faults.unavailable, product: { id: faults.wrongProduct ? 'gid://shopify/Product/9' : sf.STAGING_SHOPIFY_PRODUCT }, price: { amount: faults.zeroPrice ? '0.00' : '12.00', currencyCode: faults.foreignCurrency ? 'USD' : 'GBP' } })
  const cart = () => ({ id: RAW_CART, totalQuantity: count, cost: { subtotalAmount: { amount: (count * 12).toFixed(2), currencyCode: 'GBP' } },
    lines: { pageInfo: { hasNextPage: !!faults.truncated }, nodes: count ? [{ id: LINE, quantity: count, merchandise: variant(), cost: { totalAmount: { amount: (count * 12).toFixed(2), currencyCode: 'GBP' } } }] : [] } })
  const transport = async (url, init) => {
    assert.equal(url, `https://${sf.STAGING_CART_SHOP}/api/2026-07/graphql.json`)
    assert.equal(init.redirect, 'manual'); assert.equal(init.credentials, 'omit'); assert.equal(init.cache, 'no-store')
    assert.equal(init.headers['Shopify-Storefront-Private-Token'], 'synthetic-private-token')
    assert.ok(init.signal instanceof AbortSignal)
    const body = JSON.parse(init.body); calls.push(body)
    assert.equal(body.query.includes('checkoutUrl'), false)
    if (faults.redirect) return new Response(null, { status: 302, headers: { location: 'https://example.invalid' } })
    if (body.query.startsWith('query TllStagingVariant')) return jsonResponse({ data: { productVariant: variant() } })
    if (body.query.startsWith('query TllStagingCart')) {
      assert.equal(body.variables.id, RAW_CART); if (faults.readLost) throw new Error('PRIVATE transport detail')
      return jsonResponse({ data: { cart: cart() } })
    }
    let key
    if (body.query.includes('mutation TllStagingCartCreate')) {
      assert.equal(body.variables.input.lines[0].merchandiseId, sf.STAGING_SHOPIFY_VARIANT)
      assert.equal(body.variables.input.buyerIdentity.countryCode, 'GB')
      assert.equal(body.variables.input.buyerIdentity.email, undefined)
      count = body.variables.input.lines[0].quantity; key = 'cartCreate'
      if (faults.createLost) throw new Error('Lost create response ' + RAW_CART)
    } else {
      assert.equal(body.variables.cartId, RAW_CART)
      if (body.query.includes('TllStagingCartRemove')) { count = 0; key = 'cartLinesRemove' }
      else if (body.query.includes('TllStagingCartUpdate')) { count = body.variables.lines[0].quantity; key = 'cartLinesUpdate' }
      else { count = body.variables.lines[0].quantity; key = 'cartLinesAdd' }
      if (faults.writeLost) throw new Error('Lost response with raw key ' + RAW_CART)
    }
    return jsonResponse({ data: { [key]: { cart: cart(), userErrors: [], warnings: faults.warning ? [{ code: 'MERCHANDISE_NOT_ENOUGH_STOCK' }] : [] } } })
  }
  const repository = {
    async open(sessionHash, actorHash) {
      if (!rows.has(sessionHash)) rows.set(sessionHash, { sessionHash, actorHash, revision: 0, phase: 'ready', envelope: null, quantity: 0, unitPricePence: null, subtotalPence: 0, operationId: null, expiresAt: new Date(Date.now() + 86400000).toISOString() })
      if (faults.openLost) throw Error('Lost open COMMIT response')
      return structuredClone(rows.get(sessionHash))
    },
    async read(session, owner) { if(faults.disabled)throw new svc.CartUnavailable();const row = rows.get(session); return row?.actorHash === owner ? structuredClone(row) : null },
    async claim(session, owner, id, requestHash, revision, target) {
      const row = rows.get(session); assert.equal(row.actorHash, owner)
      const existing = ops.get(session + id)
      if (existing) return { status: existing.hash === requestHash ? 'replay' : 'conflict', record: structuredClone(row) }
      if (row.phase !== 'ready') return { status: 'held', record: structuredClone(row) }
      if (row.revision !== revision) return { status: 'conflict', record: structuredClone(row) }
      ops.set(session + id, { hash: requestHash, target }); row.phase = 'working'; row.operationId = id
      if (faults.claimLost) throw Error('Lost claim COMMIT response')
      return { status: 'claimed', record: structuredClone(row) }
    },
    async finish(session, owner, id, state, envelope, observed) {
      const row = rows.get(session); assert.equal(row.actorHash, owner)
      if (row.phase !== 'working' || row.operationId !== id) return structuredClone(row)
      row.phase = state
      if (state === 'ready') { Object.assign(row, observed, { envelope }); delete row.id; delete row.lineId; row.revision++ }
      if (faults.finishLost && state === 'ready') throw new Error('Lost successful repository write')
      return structuredClone(row)
    },
  }
  const vault = createAesGcmEnvelopeVault({ activeKeyId: 'cart-v1', keys: new Map([['cart-v1', Buffer.alloc(32, 1)]]) })
  const storefront = sf.createStagingStorefront({ enabled: true, environment: 'staging', shop: sf.STAGING_CART_SHOP, privateToken: 'synthetic-private-token', transport })
  const service = svc.createCartService({ repository, storefront, vault, context: ['synthetic-project', sf.STAGING_CART_SHOP, ORIGIN] })
  const transitionRepository = {
    async read(binding) {
      const receipt = transitionRows.get(binding.sourceSession)
      if (receipt) return structuredClone(receipt)
      const source = rows.get(binding.sourceSession), target = rows.get(binding.targetSession)
      if (target) return { status: 'conflict', source: null, target: null }
      return { status: 'absent', source: source ? structuredClone(source) : null, target: null }
    },
    async claim(binding, requestId, revision) {
      const prior = transitionRows.get(binding.sourceSession)
      if (prior) return structuredClone(prior)
      const source = rows.get(binding.sourceSession), target = rows.get(binding.targetSession)
      if (!source || target || source.actorHash !== binding.sourceActor || source.revision !== revision || source.phase !== 'ready') return { status: 'conflict', source: null, target: null }
      source.phase = 'working'; source.operationId = requestId
      const claimed = { status: 'claimed', source: structuredClone(source), target: null }
      transitionRows.set(binding.sourceSession, claimed); return structuredClone(claimed)
    },
    async finish(binding, requestId, envelope, source) {
      const target = { ...structuredClone(source), sessionHash: binding.targetSession, actorHash: binding.targetActor, phase: 'ready', envelope, operationId: null }
      rows.set(binding.targetSession, target)
      const original = rows.get(binding.sourceSession); Object.assign(original, { phase: 'held', envelope: null, quantity: 0, unitPricePence: null, subtotalPence: 0 })
      const reconciled = { status: 'reconciled', source: structuredClone(original), target: structuredClone(target) }
      transitionRows.set(binding.sourceSession, reconciled)
      if (faults.transitionFinishLost) throw Error('Lost transition finish response')
      return { status: 'reconciled', target: structuredClone(target) }
    },
  }
  const transition = transitions.createCartTransitionService({ repository: transitionRepository, vault, context: ['synthetic-project', sf.STAGING_CART_SHOP, ORIGIN] })
  const handler = http.createCartHandler({ enabled: true, origin: ORIGIN, hmacKeyHex: HMAC, service, transition, currentActor: async () => { authReads++; return actor } })
  let cookie = '', view
  async function request(method = 'GET', body, headers = {}, rawCookie = cookie) {
    const response = await handler(new Request(ORIGIN + '/api/cart', { method, headers: { ...(rawCookie ? { cookie: rawCookie } : {}),
      ...(method !== 'GET' ? { Origin: ORIGIN, 'Content-Type': 'application/json', 'X-TLL-Cart-Intent': 'staging-cart', 'X-TLL-Cart-CSRF': view?.csrfToken ?? '', 'Idempotency-Key': randomUUID() } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }))
    const text = await response.text(); assert.equal(text.includes('PRIVATE'), false); assert.equal(text.includes(RAW_CART), false); assert.equal(text.includes(LINE), false)
    if (response.headers.has('set-cookie')) cookie = /Max-Age=0/.test(response.headers.get('set-cookie')) ? '' : response.headers.get('set-cookie').split(';')[0]
    view = JSON.parse(text); return { response, view }
  }
  const open = () => request('POST', { action: 'open' })
  const set = (quantity, headers = {}) => request('PATCH', { productId: sf.STAGING_CART_PRODUCT, quantity, revision: view.revision }, headers)
  return { rows, ops, transitionRows, calls, transport, repository, service, handler, request, open, set, faults,
    setActor: value => { actor = value }, setProviderQuantity: value => { count = value },
    get cookie() { return cookie }, get view() { return view }, get authReads() { return authReads } }
}

test('opaque HttpOnly bootstrap precedes cart creation; browser receives only safe prices and quantities', async () => {
  const f = fixture(); assert.equal((await f.request()).view.state, 'empty'); assert.equal(f.calls.length, 0)
  const opened = await f.open(); assert.match(opened.response.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Strict/); assert.equal(f.calls.length, 0)
  assert.equal((await f.set(1)).view.subtotalPence, 1200)
  assert.equal(JSON.stringify([...f.rows.values()]).includes(RAW_CART), false)
  assert.equal((await f.set(3)).view.quantity, 3)
  assert.equal((await f.request('DELETE', { productId: sf.STAGING_CART_PRODUCT, revision: f.view.revision })).view.quantity, 0)
  assert.equal((await f.set(1)).view.quantity, 1)
  assert.equal(f.calls.filter(c => c.query.includes('mutation TllStagingCartCreate')).length, 1)
})
test('uncertain create remains durably held across a new service request and never creates again', async () => {
  const f = fixture({ createLost: true }); await f.open(); assert.equal((await f.set(1)).response.status, 503)
  assert.equal((await f.request()).view.state, 'held')
  assert.equal((await f.set(1)).response.status, 409)
  assert.equal(f.calls.filter(c => c.query.includes('mutation TllStagingCartCreate')).length, 1)
})
test('uncertain known-cart mutation reads the actual quantity while retaining hold; no write replay', async () => {
  const f = fixture(); await f.open(); await f.set(1); f.faults.writeLost = true
  await f.set(2); const refreshed = await f.request(); assert.equal(refreshed.view.quantity, 2); assert.equal(refreshed.view.state, 'held')
  const previous = f.calls.length; await f.set(3); assert.equal(f.calls.length, previous)
})
test('server success with lost repository response is recoverable by read without a second create', async () => {
  const f = fixture({ finishLost: true }); await f.open(); assert.equal((await f.set(1)).response.status, 503)
  assert.equal((await f.request()).view.state, 'ready'); assert.equal(f.view.quantity, 1)
  assert.equal(f.calls.filter(c => c.query.includes('mutation TllStagingCartCreate')).length, 1)
})
test('same request retry and concurrent clients cannot duplicate a mutation; stale edits conflict', async () => {
  const f = fixture(); await f.open(); const id = randomUUID(), body = { productId: sf.STAGING_CART_PRODUCT, revision: 0, quantity: 1 }
  const first = await f.request('PATCH', body, { 'Idempotency-Key': id }); assert.equal(first.response.status, 200)
  const count = f.calls.length; await f.request('PATCH', body, { 'Idempotency-Key': id }); assert.equal(f.calls.length, count)
  const results = await Promise.all([f.request('PATCH', { ...body, revision: 1, quantity: 2 }), f.request('PATCH', { ...body, revision: 1, quantity: 3 })])
  assert.deepEqual(results.map(r => r.response.status).sort(), [200, 409])
  assert.equal((await f.request('PATCH', body)).response.status, 409)
  assert.equal((await f.request('PATCH', { ...body, quantity: 4 }, { 'Idempotency-Key': id })).response.status, 409)
})
test('sign-in exposes an explicit one-use guest cart decision and acknowledged transfer clears the capability', async () => {
  const f = fixture(); await f.open(); await f.set(1); const guestCookie = f.cookie
  f.setActor(ACTOR); const choice = await f.request(); assert.equal(choice.response.status, 200); assert.equal(choice.view.state, 'transition_required'); assert.equal(choice.view.quantity, 1)
  const moved = await f.request('POST', { action: 'transfer', revision: choice.view.revision })
  assert.equal(moved.response.status, 200); assert.equal(moved.view.state, 'ready'); assert.equal(moved.view.quantity, 1); assert.match(moved.response.headers.get('set-cookie'), /Max-Age=0/)
  assert.equal(f.cookie, ''); assert.equal((await f.request()).view.quantity, 1)
  const replay = await f.request('GET', undefined, {}, guestCookie); assert.equal(replay.response.status, 200); assert.equal(replay.view.quantity, 1)
})

test('signed-in carts use one deterministic server session across browser reads without a cart cookie', async () => {
  const f = fixture(); f.setActor(ACTOR)
  assert.equal((await f.request()).view.state, 'empty'); await f.open(); await f.set(2)
  assert.equal(f.cookie, ''); assert.equal((await f.request()).view.quantity, 2)
  assert.equal((await f.request('PATCH', { productId: sf.STAGING_CART_PRODUCT, revision: f.view.revision, quantity: 3 })).view.quantity, 3)
})

test('choosing the account cart never merges the guest cart and clears only the browser capability', async () => {
  const f = fixture(); f.setActor(ACTOR); await f.open(); await f.set(2)
  f.setActor(null); await f.open(); await f.set(1); const guestSession = hash(f.cookie.slice(f.cookie.indexOf('=') + 1)); f.setActor(ACTOR)
  const choice = await f.request(); assert.equal(choice.view.state, 'transition_required'); assert.match(choice.view.message, /already has a cart/)
  f.setProviderQuantity(2)
  const selected = await f.request('POST', { action: 'use_account' }); assert.equal(selected.view.quantity, 2); assert.equal(f.cookie, '')
  assert.equal(f.rows.get(guestSession).quantity, 1)
})

test('a lost transfer finish response is recovered by inspection and is never transferred twice', async () => {
  const f = fixture({ transitionFinishLost: true }); await f.open(); await f.set(1); f.setActor(ACTOR); await f.request()
  const attempted = await f.request('POST', { action: 'transfer', revision: f.view.revision }); assert.equal(attempted.response.status, 503)
  const recovered = await f.request(); assert.equal(recovered.response.status, 200); assert.equal(recovered.view.quantity, 1); assert.equal(f.cookie, '')
  assert.equal(f.transitionRows.size, 1)
})
test('cross-site requests, missing intent and CSRF are rejected before provider or repository writes', async () => {
  const f = fixture(); await f.open(); const count = f.ops.size
  for (const headers of [{ Origin: 'https://example.invalid' }, { 'Sec-Fetch-Site': 'cross-site' }, { 'X-TLL-Cart-Intent': '' }, { 'X-TLL-Cart-CSRF': '' }]) {
    assert.equal((await f.request('PATCH', { productId: sf.STAGING_CART_PRODUCT, revision: 0, quantity: 1 }, headers)).response.status, 403)
  }
  assert.equal(f.calls.length, 0); assert.equal(f.ops.size, count)
})
test('unmapped products, caller variant/cart IDs, excessive quantities and malformed bodies never reach Shopify', async () => {
  const f = fixture(); await f.open()
  const csrf = f.view.csrfToken
  const base = { productId: sf.STAGING_CART_PRODUCT, revision: 0, quantity: 1 }
  for (const body of [{ ...base, productId: randomUUID() }, { ...base, cartId: RAW_CART }, { ...base, variantId: sf.STAGING_SHOPIFY_VARIANT }, { ...base, quantity: 6 }, { ...base, quantity: 1.2 }, { ...base, revision: -1 }, '{', 'x'.repeat(2049)]) {
    assert.equal((await f.request('PATCH', body, { 'X-TLL-Cart-CSRF': csrf })).response.status, 400)
  }
  assert.equal(f.calls.length, 0)
})
test('POST accepts only open and cannot apply an authenticated PATCH-shaped mutation', async () => {
  const f = fixture(); await f.open()
  const csrf = f.view.csrfToken, before = structuredClone([...f.rows.values()]), authReads = f.authReads
  for (const input of [{ productId: sf.STAGING_CART_PRODUCT, quantity: 1, revision: 0 }, { action: 'open', quantity: 1 }, { action: 'set' }]) {
    assert.equal((await f.request('POST', input, { 'X-TLL-Cart-CSRF': csrf })).response.status, 400)
  }
  assert.equal(f.authReads, authReads); assert.equal(f.calls.length, 0); assert.equal(f.ops.size, 0); assert.deepEqual([...f.rows.values()], before)
})
for (const fault of ['zeroPrice', 'unavailable', 'wrongVariant', 'wrongProduct', 'foreignCurrency', 'redirect', 'warning', 'truncated']) test(`provider ${fault} cannot yield a cart-ready success`, async () => {
  const f = fixture({ [fault]: true }); await f.open(); const result = await f.set(1)
  assert.equal(result.response.status, 503); assert.equal(result.view.state, 'held')
  assert.equal((await f.set(1)).response.status, 409)
})
test('mixed/tampered opaque cookies cannot select arbitrary Shopify carts', async () => {
  const f = fixture(); await f.open()
  assert.equal((await f.request('GET', undefined, {}, `${f.cookie}; ${f.cookie}`)).response.status, 409)
  assert.equal((await f.request('GET', undefined, {}, `${http.CART_COOKIE}=${encodeURIComponent(RAW_CART)}`)).response.status, 409)
  assert.equal(f.calls.length, 0)
})
test('vault context binds ciphertext to both opaque session and actor identity', async () => {
  const f = fixture(); await f.open(); await f.set(1)
  const row = [...f.rows.values()][0], copy = structuredClone(row), sessionHash = hash('different-session')
  copy.sessionHash = sessionHash; f.rows.set(sessionHash, copy)
  const view = await f.service.read(sessionHash, row.actorHash)
  assert.equal(view.state, 'unavailable')
})
test('actual Next cart exports remain off in production, synthetic previews and incomplete staging', async () => {
  for (const env of [{}, { NEXT_PUBLIC_TLL_ENVIRONMENT: 'production', TLL_STAGING_CART_ENABLED: 'true' },
    { NEXT_PUBLIC_TLL_ENVIRONMENT: 'synthetic-preview', TLL_STAGING_CART_ENABLED: 'true' },
    { NEXT_PUBLIC_TLL_ENVIRONMENT: 'staging', NEXT_PUBLIC_TLL_STAGING_CART: 'enabled', TLL_STAGING_CART_ENABLED: 'true', VERCEL: '1', VERCEL_ENV: 'production' },
    { NEXT_PUBLIC_TLL_ENVIRONMENT: 'staging', NEXT_PUBLIC_TLL_STAGING_CART: 'enabled', TLL_STAGING_CART_ENABLED: 'true', VERCEL: '1', VERCEL_ENV: 'preview' }]) {
    const routes = modules({ env })('app/api/cart/route.ts')
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) assert.equal((await routes[method](new Request(ORIGIN + '/api/cart', { method }))).status, 404)
  }
})

test('repository uses fixed parameterized RPCs and acknowledges COMMIT before exposing a reservation', async () => {
  const { createCartRepository } = load('lib/commerce/staging-cart-repository.ts')
  const session='1'.repeat(64), actor='2'.repeat(64), requestId=randomUUID(), requestHash='3'.repeat(64), calls=[]
  const row={sessionHash:session,actorHash:actor,revision:0,phase:'working',envelope:null,quantity:0,unitPricePence:null,subtotalPence:0,operationId:requestId,expiresAt:new Date(Date.now()+60000).toISOString()}
  let finishCommit
  const repository=createCartRepository({enabled:true,pool:{connect:async()=>({
    async query(sql,args){calls.push([sql,args]);if(sql==='COMMIT')await new Promise(resolve=>{finishCommit=resolve});return {rows:sql.startsWith('SELECT')?[{result:{status:'claimed',record:row}}]:[]}},release(destroy){calls.push(['release',destroy])},
  })}})
  let exposed=false;const result=repository.claim(session,actor,requestId,requestHash,0,1).then(value=>{exposed=true;return value})
  await new Promise(resolve=>setImmediate(resolve));assert.equal(exposed,false);assert.equal(calls[2][0],'COMMIT')
  assert.deepEqual(Array.from(calls[1][1]),[session,actor,requestId,requestHash,0,1]);assert.equal(calls[1][0].includes(session),false)
  finishCommit();assert.equal((await result).status,'claimed');assert.deepEqual(calls.at(-1),['release',false])
})
test('lost COMMIT / SELECT / BEGIN responses destroy the exclusive connection and never retry', async () => {
  const { createCartRepository }=load('lib/commerce/staging-cart-repository.ts')
  for(const failure of ['BEGIN','SELECT','COMMIT']) {
    const calls=[]
    const repository=createCartRepository({enabled:true,pool:{connect:async()=>({async query(sql){calls.push(sql);if(sql.startsWith(failure))throw Error('private connection detail');return {rows:sql.startsWith('SELECT')?[{result:null}]:[]}},release(destroy){calls.push(['release',destroy])}})}})
    await assert.rejects(repository.read('1'.repeat(64),'2'.repeat(64)),/Staging cart unavailable/)
    assert.deepEqual(calls.at(-1),['release',true]);assert.equal(calls.filter(c=>typeof c==='string'&&c.startsWith(failure)).length,1)
  }
})
test('bounded provider JSON rejects oversized bodies, invalid UTF8 and untrusted buyer IP', async () => {
  const { cartJson }=load('lib/commerce/staging-cart-json.ts')
  await assert.rejects(cartJson(new Response(' '.repeat(65537))))
  await assert.rejects(cartJson(new Response(new Uint8Array([0xff]))))
  for(const buyerIp of ['1.2.3.4, 5.6.7.8','https://example.invalid','[::1]','1.2.3.4\n']) {
    assert.throws(()=>sf.createStagingStorefront({enabled:true,environment:'staging',shop:sf.STAGING_CART_SHOP,privateToken:'synthetic-private-token',transport:async()=>{throw Error('No transport expected')},buyerIp}))
  }
})

test('unavailable server response cannot be mistaken for an empty zero-price cart', async () => {
  const f=fixture();const response=await f.request('PATCH',{productId:sf.STAGING_CART_PRODUCT,quantity:1,revision:0})
  assert.equal(response.response.status,403);assert.equal(response.view.state,'unavailable');assert.equal(response.view.subtotalPence,null);assert.equal(response.view.productId,null)
})

test('actual enabled Next route composes verified session, acknowledged SQL, encryption and Storefront without leaking keys', async () => {
  const f=fixture(),sqlCalls=[];let closed=0,active=0
  const env={NEXT_PUBLIC_TLL_ENVIRONMENT:'staging',NEXT_PUBLIC_TLL_STAGING_CART:'enabled',TLL_STAGING_CART_ENABLED:'true',VERCEL:'1',VERCEL_ENV:'preview',
    TLL_STAGING_POSTGRES_CA_PEM:'synthetic-public-CA-fixture',TLL_STAGING_POSTGRES_CA_SHA256:'c'.repeat(64),TLL_STAGING_CART_ORIGIN:ORIGIN,TLL_STAGING_SUPABASE_PROJECT_REF:'qdmvngjwkcsilzmqksme',NEXT_PUBLIC_SUPABASE_URL:'https://qdmvngjwkcsilzmqksme.supabase.co',TLL_STAGING_CART_SHOP:sf.STAGING_CART_SHOP,
    TLL_STAGING_CART_VAULT_KEY_HEX:'b'.repeat(64),TLL_STAGING_CART_HMAC_KEY_HEX:HMAC,TLL_STAGING_CART_VAULT_KEY_ID:'cart-v1',TLL_STAGING_CART_STOREFRONT_TOKEN:'synthetic-private-token',TLL_STAGING_CART_DATABASE_PASSWORD:'synthetic-never-a-real-password'}
  const postgresRuntime=options=>{
    assert.equal(options.purpose,'cart');assert.equal(options.enabled,true);assert.equal(options.password,env.TLL_STAGING_CART_DATABASE_PASSWORD);assert.equal(options.tlsCa.pem,env.TLL_STAGING_POSTGRES_CA_PEM);assert.equal(options.tlsCa.sha256,env.TLL_STAGING_POSTGRES_CA_SHA256)
    return {enabled:true,close:async()=>{closed++},pool:{connect:async()=>{
      active++;let transaction=false
      return {async query(sql,args){sqlCalls.push(sql)
        if(sql==='BEGIN'){transaction=true;return {rows:[]}}
        if(sql==='COMMIT'){assert.equal(transaction,true);transaction=false;return {rows:[]}}
        assert.equal(transaction,true)
        const name=/public\.tll_cart_(\w+)\(/.exec(sql)[1]
        const inputs=Array.from(args)
        if(name==='finish'){
          const [session,actor,id,state,envelope,quantity,unitPricePence,subtotalPence]=inputs
          return {rows:[{result:await f.repository.finish(session,actor,id,state,envelope===null?null:JSON.parse(envelope),quantity===null?null:{quantity,unitPricePence,subtotalPence})}]}
        }
        return {rows:[{result:await f.repository[name](...inputs)}]}
      },release(destroy){assert.equal(destroy,false);active--}}
    }}}
  }
  const route=modules({env,fetch:f.transport,postgresRuntime})('app/api/cart/route.ts')
  const opened=await route.POST(new Request(ORIGIN+'/api/cart',{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json','X-TLL-Cart-Intent':'staging-cart'},body:'{"action":"open"}'}))
  assert.equal(opened.status,200);const before=await opened.json(),cookie=opened.headers.get('set-cookie').split(';')[0]
  assert.equal(f.calls.length,0)
  const created=await route.PATCH(new Request(ORIGIN+'/api/cart',{method:'PATCH',headers:{Origin:ORIGIN,cookie,'Content-Type':'application/json','X-TLL-Cart-Intent':'staging-cart','X-TLL-Cart-CSRF':before.csrfToken,'Idempotency-Key':randomUUID()},body:JSON.stringify({productId:sf.STAGING_CART_PRODUCT,quantity:1,revision:0})}))
  assert.equal(created.status,200);const text=await created.text();assert.equal(JSON.parse(text).subtotalPence,1200)
  for(const secret of [RAW_CART,'PRIVATE-CART',env.TLL_STAGING_CART_STOREFRONT_TOKEN,env.TLL_STAGING_CART_DATABASE_PASSWORD,env.TLL_STAGING_CART_VAULT_KEY_HEX])assert.equal(text.includes(secret),false)
  assert.equal(active,0);assert.equal(closed,2);assert.equal(sqlCalls.filter(q=>q==='BEGIN').length,sqlCalls.filter(q=>q==='COMMIT').length)
})

test('lost reservation COMMIT response cannot cause a provider request and a new nonce stays held', async () => {
  const f=fixture({claimLost:true});await f.open();const attempted=await f.set(1)
  assert.equal(attempted.response.status,503);assert.equal(f.calls.length,0)
  assert.equal((await f.request()).view.state,'pending');f.faults.claimLost=false
  assert.equal((await f.set(1)).response.status,409);assert.equal(f.calls.length,0)
})
test('lost bootstrap COMMIT response can only leave an empty local session; no provider cart or cookie escapes', async () => {
  const f=fixture({openLost:true});const attempted=await f.open()
  assert.equal(attempted.response.status,503);assert.equal(attempted.response.headers.has('set-cookie'),false);assert.equal(f.calls.length,0)
  assert.equal([...f.rows.values()][0].envelope,null);f.faults.openLost=false
  await f.open();assert.equal(f.calls.length,0)
})

test('repository disable keeps the opaque cart cookie for a later controlled resume', async () => {
  const f=fixture();await f.open();await f.set(1);const cookie=f.cookie;f.faults.disabled=true
  const paused=await f.request();assert.equal(paused.response.status,503);assert.equal(paused.response.headers.has('set-cookie'),false)
  assert.equal(f.cookie,cookie);f.faults.disabled=false;assert.equal((await f.request()).view.quantity,1)
  assert.equal(f.calls.filter(c=>c.query.includes('mutation TllStagingCartCreate')).length,1)
})

test('stale revision explicitly reports that the requested change was not applied', async () => {
  const f=fixture();await f.open();await f.set(1);const before=f.calls.length
  const conflict=await f.request('PATCH',{productId:sf.STAGING_CART_PRODUCT,quantity:2,revision:0})
  assert.equal(conflict.response.status,409);assert.match(conflict.view.message,/not applied/);assert.equal(conflict.view.quantity,1);assert.equal(f.calls.length,before)
})
