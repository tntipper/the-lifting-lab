import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url), root = fileURLToPath(new URL('../', import.meta.url))
function loader(env = {}) {
  const cache = new Map()
  function load(filename) {
    filename = resolve(root, filename)
    if (cache.has(filename)) return cache.get(filename)
    const mod = { exports: {} }; cache.set(filename, mod.exports)
    const js = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText
    vm.runInNewContext(js, { module: mod, exports: mod.exports,
      require: name => {
        if (!name.startsWith('.') && !name.startsWith('@/')) return require(name)
        const base = name.startsWith('@/') ? resolve(root, name.slice(2)) : resolve(dirname(filename), name)
        assert.ok(existsSync(base + '.ts'), name); return load(base + '.ts')
      }, process: { env }, Buffer, Uint8Array, TextDecoder, structuredClone, Request, Response, Date, setTimeout, clearTimeout,
      fetch() { throw new Error('No network calls allowed') },
    }, { filename })
    cache.set(filename, mod.exports); return mod.exports
  }
  return load
}
const load = loader(), { routePaidOrder } = load('lib/commerce/harness/route-orders.ts')
const { createOrdersPaidHandler } = load('lib/commerce/harness/orders-paid-http.ts')
const { sealDelivery, openDelivery } = load('lib/commerce/harness/delivery-privacy.ts')
const { createHmac } = require('node:crypto')
const plain = value => JSON.parse(JSON.stringify(value))
const now = Date.parse('2026-10-12T10:00:00Z')
const event = { shop: 'synthetic.myshopify.com', eventId: 'event-1', orderId: 'gid://shopify/Order/1' }
const address = { name: 'Synthetic Recipient', address1: '1 Test Street', city: 'Test Town', postcode: 'TE1 1ST', countryCode: 'GB' }
function mapping(n, supplier = 'tropship') {
  const pack = { version: 'v1', sellingUnit: 'single', innerCount: 1, amountPerInner: 500, unit: 'g' }
  const identity = { formulaId: 'synthetic', formulaVersion: 'v1', flavourId: 'Vanilla', labelVersion: 'v1', pack }
  return { id: `00000000-0000-4000-8000-00000000000${n}`, row: {
    comparison_product_id: `synthetic-${n}`, status: 'store', shopify_product_id: `gid://shopify/Product/${n}`,
    shopify_variant_id: `gid://shopify/ProductVariant/${n}`, handle: `synthetic-${n}`, supplier, supplier_sku: `SYN-${n}`,
    ean: '4006381333931', pack, flavour: 'Vanilla', cost_ex_vat: '10.00', price_auto: false, active: true,
    approval_reference: 'synthetic-review', mapping_status: 'exact', mapping_source: 'verified_labels',
    shop_identity: identity, supplier_identity: structuredClone(identity),
    review: { approved: true, version: 'v1', expectedVersion: 'v1', verifiedAtMs: now - 3600_000, expiresAtMs: now + 3600_000 },
  } }
}
function setup() {
  const state = { inbox: new Map(), plans: new Map(), batches: new Map(), calls: [], holds: [], reads: 0 }
  const order = { id: event.orderId, shop: event.shop, paid: true, cancelled: false, refunded: false, complete: true,
    deliveryAddress: address, lines: [1, 2, 3].map(n => ({ id: `gid://shopify/LineItem/${n}`, variantId: `gid://shopify/ProductVariant/${n}`, quantity: n })) }
  const inbox = { async save(e) {
    const k = e.shop + ':' + e.eventId
    if (state.inbox.has(k)) return 'duplicate'
    state.inbox.set(k, structuredClone(e)); return 'saved'
  } }
  const store = {
    async planAndReserve(plan) {
      const k = plan.shop + ':' + plan.orderId
      if (state.plans.has(k)) return 'duplicate'
      state.plans.set(k, structuredClone(plan))
      for (const group of plan.groups) state.batches.set(group.localKey, { group, attempts: 0, status: 'pending' })
      return 'created'
    },
    async claimSubmission(k) {
      const batch = state.batches.get(k)
      if (batch.attempts !== 0 || batch.status !== 'pending') return false
      batch.attempts = 1; batch.status = 'manual'; return true
    },
    async recordResult(k, result) { Object.assign(state.batches.get(k), structuredClone(result)) },
    async complete() {},
    async hold(e, code) { state.holds.push({ event: e, code }) },
  }
  const adapter = id => ({ id, async placeOrder(request) {
    const batch = state.batches.get(request.localKey)
    assert.equal(batch.attempts, 1); assert.equal(batch.status, 'manual', 'spent marker saved BEFORE supplier call')
    state.calls.push({ supplier: id, request: plain(request) })
    return { status: 'accepted', supplierRef: `synthetic-${id}` }
  } })
  const secretKey = Buffer.alloc(32, 7) // synthetic, no env edits
  const deps = { enabled: 'true', shop: event.shop, shopify: { async readOrder() { state.reads++; return structuredClone(order) } },
    mappings: async () => [mapping(1), mapping(2, 'bodypower'), mapping(3)], store,
    adapters: { tropship: adapter('tropship'), bodypower: adapter('bodypower') }, dispatchCostPence: { tropship: 600, bodypower: 700 },
    protectDelivery: async (a, context) => sealDelivery(a, secretKey, context), now: () => now, timeoutMs: 15 }
  const env = { ORDER_FORWARDING_ENABLED: 'true', SHOPIFY_WEBHOOK_SECRET: 'synthetic-secret', ORDER_FORWARDING_SHOP: event.shop }
  const handler = createOrdersPaidHandler({ env: () => env, loadInbox: async () => inbox })
  return { state, order, deps, env, inbox, handler }
}
function request(env, body = JSON.stringify({ admin_graphql_api_id: event.orderId, shipping_address: address, line_items: [] }), headers = {}) {
  return new Request('https://example.invalid/api/webhooks/shopify/orders-paid', { method: 'POST', body, headers: {
    'x-shopify-hmac-sha256': createHmac('sha256', env.SHOPIFY_WEBHOOK_SECRET).update(body).digest('base64'),
    'x-shopify-shop-domain': event.shop, 'x-shopify-topic': 'orders/paid', 'x-shopify-event-id': event.eventId, ...headers,
  } })
}

test('signed webhook is saved before acknowledgement; original address/body is never persisted', async () => {
  const s = setup(); const response = await s.handler(request(s.env))
  assert.equal(response.status, 200); assert.equal((await response.json()).status, 'saved')
  assert.deepEqual([...s.state.inbox.values()], [event]); assert.equal(s.state.calls.length, 0)
})
test('webhook replay + worker replay with another event ID never duplicates rows or supplier calls', async () => {
  const s = setup()
  assert.equal((await s.handler(request(s.env))).status, 200)
  assert.equal((await (await s.handler(request(s.env))).json()).status, 'duplicate')
  assert.equal((await routePaidOrder(event, s.deps)).status, 'processed')
  assert.equal((await routePaidOrder({ ...event, eventId: 'event-2' }, s.deps)).status, 'duplicate')
  assert.equal(s.state.plans.size, 1); assert.equal(s.state.batches.size, 2); assert.equal(s.state.calls.length, 2)
})
test('concurrent workers produce exactly one submission per supplier', async () => {
  const s = setup(); const results = await Promise.all([routePaidOrder(event, s.deps), routePaidOrder(event, s.deps)])
  assert.deepEqual(results.map(r => r.status).sort(), ['duplicate', 'processed']); assert.equal(s.state.calls.length, 2)
})
test('fresh order lines override webhook lines; mixed supplier split preserves quantities and one cost per group', async () => {
  const s = setup(); await s.handler(request(s.env)); const result = await routePaidOrder(event, s.deps)
  assert.equal(s.state.reads, 1); assert.equal(result.groups, 2)
  assert.deepEqual(s.state.calls.map(c => c.request.lines), [[{ sku: 'SYN-1', quantity: 1 }, { sku: 'SYN-3', quantity: 3 }], [{ sku: 'SYN-2', quantity: 2 }]])
  assert.deepEqual([...s.state.batches.values()].map(b => b.group.absorbedDispatchPence), [600, 700])
  const plan = [...s.state.plans.values()][0]
  assert.equal(plan.groups.flatMap(g => g.lines).length, 3)
  assert.equal(new Set(plan.groups.flatMap(g => g.lines.map(l => l.localKey))).size, 3)
  assert.ok(!JSON.stringify(plan).includes(address.address1)); assert.ok(!JSON.stringify(plan).includes(address.name))
  assert.deepEqual(s.state.calls[0].request.deliveryAddress, address)
})
for (const flag of [undefined, 'false', 'TRUE', '1', ' true ']) test(`flag ${String(flag)} disables both ingress and worker without reads/writes`, async () => {
  const s = setup(); s.env.ORDER_FORWARDING_ENABLED = flag; s.deps.enabled = flag
  assert.equal((await (await s.handler(request(s.env))).json()).status, 'disabled')
  assert.equal((await routePaidOrder(event, s.deps)).status, 'disabled')
  assert.equal(s.state.inbox.size + s.state.plans.size + s.state.reads + s.state.holds.length, 0)
})
for (const sig of ['', 'bad', Buffer.alloc(32).toString('base64')]) test(`bad HMAC ${sig || 'missing'} is rejected without any persistence`, async () => {
  const s = setup(); assert.equal((await s.handler(request(s.env, undefined, { 'x-shopify-hmac-sha256': sig }))).status, 401)
  assert.equal(s.state.inbox.size, 0)
})
test('HMAC uses exact raw bytes, so whitespace tampering fails', async () => {
  const s = setup(); const raw = JSON.stringify({ admin_graphql_api_id: event.orderId })
  assert.equal((await s.handler(request(s.env, raw + ' ', { 'x-shopify-hmac-sha256': createHmac('sha256', s.env.SHOPIFY_WEBHOOK_SECRET).update(raw).digest('base64') }))).status, 401)
})
for (const headers of [{ 'x-shopify-shop-domain': 'other.myshopify.com' }, { 'x-shopify-topic': 'orders/create' }, { 'x-shopify-event-id': '' }]) test(`wrong event headers ${JSON.stringify(headers)} rejected`, async () => {
  const s = setup(); assert.equal((await s.handler(request(s.env, undefined, headers))).status, 400); assert.equal(s.state.inbox.size, 0)
})
test('inbox failure returns 503 rather than a false acknowledgement', async () => {
  const s = setup(); s.inbox.save = async () => { throw new Error(address.address1) }
  const response = await s.handler(request(s.env)); assert.equal(response.status, 503)
  assert.ok(!(await response.text()).includes(address.address1))
})
test('default exported route cannot connect even if flag enabled; no inbox binding', async () => {
  const s = setup(), route = loader(s.env)('app/api/webhooks/shopify/orders-paid/route.ts')
  assert.equal((await route.POST(request(s.env))).status, 503)
  assert.equal((await loader()('app/api/webhooks/shopify/orders-paid/route.ts').POST(request(s.env))).status, 200)
})
for (const patch of [{ paid: false }, { cancelled: true }, { refunded: true }, { complete: false }, { id: 'gid://shopify/Order/2' }, { shop: 'other.myshopify.com' }]) test(`fresh order fails eligibility ${JSON.stringify(patch)}`, async () => {
  const s = setup(); Object.assign(s.order, patch); assert.equal((await routePaidOrder(event, s.deps)).status, 'manual')
  assert.equal(s.state.calls.length + s.state.plans.size, 0)
})
for (const status of ['submitted', 'accepted', 'rejected', 'uncertain', 'unknown']) test(`supplier ${status} recorded distinctly; uncertain/unknown becomes manual`, async () => {
  const s = setup(); s.deps.adapters.tropship.placeOrder = async () => ({ status, supplierRef: status === 'accepted' ? 'ACK-123' : undefined, reason: address.address1 })
  await routePaidOrder(event, s.deps)
  const batch = [...s.state.batches.values()][0]
  assert.equal(batch.status, ['uncertain', 'unknown'].includes(status) ? 'manual' : status)
  assert.ok(!JSON.stringify(batch).includes(address.address1))
})
test('accepted without acknowledgement reference becomes manual', async () => {
  const s = setup(); s.deps.adapters.tropship.placeOrder = async () => ({ status: 'accepted' })
  assert.equal((await routePaidOrder(event, s.deps)).status, 'manual')
  assert.equal([...s.state.batches.values()][0].status, 'manual')
})
test('actual timeout becomes manual; later successful result and replay cannot resubmit', async () => {
  const s = setup(); let complete, attempts = 0
  s.deps.adapters.tropship.placeOrder = () => { attempts++; return new Promise(resolve => { complete = resolve }) }
  assert.equal((await routePaidOrder(event, s.deps)).status, 'manual')
  complete({ status: 'accepted', supplierRef: 'LATE-ACK' }); await new Promise(resolve => setTimeout(resolve, 1))
  assert.equal([...s.state.batches.values()][0].status, 'manual')
  assert.equal((await routePaidOrder(event, s.deps)).status, 'duplicate'); assert.equal(attempts, 1)
})
test('supplier exception becomes manual without retry or raw error persistence', async () => {
  const s = setup(); let attempts = 0
  s.deps.adapters.tropship.placeOrder = async () => { attempts++; throw new Error(address.address1) }
  assert.equal((await routePaidOrder(event, s.deps)).status, 'manual'); await routePaidOrder(event, s.deps)
  assert.equal(attempts, 1); assert.ok(!JSON.stringify(s.state.holds).includes(address.address1))
})
for (const operation of ['planAndReserve', 'claimSubmission']) test(`${operation} failure stops supplier transport`, async () => {
  const s = setup(); s.deps.store[operation] = async () => { throw new Error('synthetic db failure') }
  assert.equal((await routePaidOrder(event, s.deps)).status, 'manual'); assert.equal(s.state.calls.length, 0)
})
test('result persistence failure leaves spent manual record; replay never sends again', async () => {
  const s = setup(); s.deps.store.recordResult = async () => { throw new Error('synthetic db failure') }
  assert.equal((await routePaidOrder(event, s.deps)).status, 'manual')
  assert.equal((await routePaidOrder(event, s.deps)).status, 'duplicate')
  assert.equal(s.state.calls.length, 1); assert.equal([...s.state.batches.values()][0].status, 'manual')
})
for (const fault of ['inactive', 'expired', 'missing', 'adapter', 'cost', 'encryption', 'stock']) test(`${fault} prevents partial order forwarding`, async () => {
  const s = setup()
  if (['inactive', 'expired', 'missing'].includes(fault)) s.deps.mappings = async () => {
    const maps = [mapping(1), mapping(2, 'bodypower'), mapping(3)]
    if (fault === 'inactive') maps[1].row.active = false
    if (fault === 'expired') maps[1].row.review.expiresAtMs = now
    return fault === 'missing' ? maps.slice(0, 1) : maps
  }
  if (fault === 'adapter') delete s.deps.adapters.bodypower
  if (fault === 'cost') delete s.deps.dispatchCostPence.bodypower
  if (fault === 'encryption') s.deps.protectDelivery = async () => { throw new Error('synthetic') }
  if (fault === 'stock') s.deps.store.planAndReserve = async () => { throw new Error('insufficient stock; rolled back') }
  assert.equal((await routePaidOrder(event, s.deps)).status, 'manual'); assert.equal(s.state.calls.length, 0)
})
test('AES envelope decrypts only with correct key and order context; fresh nonce per encryption', () => {
  const k = Buffer.alloc(32, 8), encrypted = sealDelivery(address, k, 'shop/order')
  assert.deepEqual(plain(openDelivery(encrypted, k, 'shop/order')), address)
  assert.notEqual(sealDelivery(address, k, 'shop/order'), encrypted)
  assert.throws(() => openDelivery(encrypted, Buffer.alloc(32, 9), 'shop/order'))
  assert.throws(() => openDelivery(encrypted, k, 'other/order'))
  const corrupt = JSON.parse(encrypted); corrupt.tag = Buffer.alloc(16).toString('base64')
  assert.throws(() => openDelivery(JSON.stringify(corrupt), k, 'shop/order'))
  assert.throws(() => sealDelivery(address, Buffer.alloc(16), 'shop/order'))
})
test('static migration contains private tables, dedupe and atomic spent marker; no hosted database used', () => {
  const sql = readFileSync(resolve(root, 'supabase/migrations/202610120019_order_forwarding.sql'), 'utf8')
  for (const table of ['order_inbox', 'order_plans', 'customer_delivery_payloads', 'supplier_order_batches', 'supplier_orders', 'order_reservations']) {
    assert.ok(sql.includes(`create table tll_harness_private.${table}`)); assert.ok(sql.includes(`alter table tll_harness_private.${table} enable row level security`))
  }
  assert.match(sql, /unique \(shop, event_id\)/); assert.match(sql, /unique \(shop, order_id, line_id, supplier\)/)
  assert.match(sql, /unique \(shop, order_id\)/); assert.match(sql, /attempts = 1, spent_at = now\(\), status = 'manual'/)
  assert.match(sql, /status = 'pending' and attempts = 0 and spent_at is null/)
  assert.match(sql, /from public, anon, authenticated/); assert.doesNotMatch(sql, /security definer/i)
})
const { createOrderInbox, createOrderRoutingStore } = load('lib/commerce/harness/order-store.ts')
function sqlFake() {
  const state = { committed: [], transaction: false, rollbacks: 0, begin: 0, duplicate: false, fail: null }
  const query = async (sql, values) => {
    if (state.fail && sql.includes(state.fail)) throw new Error('synthetic SQL fault')
    const record = { sql, values: plain(values), transaction: state.transaction }
    state.target.push(record)
    if (sql.includes('claim_order_submission')) return { rows: [{ claimed: true }] }
    if (state.duplicate && sql.includes('on conflict') && sql.includes('do nothing')) return { rows: [] }
    return { rows: [{ id: 'synthetic-db-id' }] }
  }
  state.target = state.committed
  const db = { query, async transaction(run) {
    state.begin++; state.transaction = true; state.target = []
    try { const result = await run({ query }); state.committed.push(...state.target); return result }
    catch (error) { state.rollbacks++; throw error }
    finally { state.transaction = false; state.target = state.committed }
  } }
  return { state, db }
}
async function samplePlan() {
  const s = setup(); await routePaidOrder(event, s.deps); return plain([...s.state.plans.values()][0])
}
test('injected private SQL inbox uses dedupe; saving requires successful query', async () => {
  const s = sqlFake(), inbox = createOrderInbox(s.db)
  assert.equal(await inbox.save(event), 'saved'); s.state.duplicate = true
  assert.equal(await inbox.save(event), 'duplicate')
  assert.deepEqual(s.state.committed[0].values, [event.shop, event.eventId, event.orderId])
  s.state.fail = 'order_inbox'; await assert.rejects(inbox.save(event))
})
test('SQL store saves encrypted address, split batches, all lines and reservations in one transaction', async () => {
  const s = sqlFake(); let stockChecks = 0
  const store = createOrderRoutingStore({ db: s.db, checkAndLockStock: async (tx, lines) => {
    assert.equal(s.state.transaction, true); assert.equal(lines.length, 3); stockChecks++
    await tx.query('synthetic stock locks', [])
  } })
  assert.equal(await store.planAndReserve(await samplePlan()), 'created')
  assert.equal(s.state.begin, 1); assert.equal(stockChecks, 1)
  assert.equal(s.state.committed.filter(q => q.sql.includes('insert into tll_harness_private.supplier_orders')).length, 3)
  assert.equal(s.state.committed.filter(q => q.sql.includes('insert into tll_harness_private.order_reservations')).length, 3)
  assert.ok(s.state.committed.every(q => q.transaction))
  assert.ok(!JSON.stringify(s.state.committed).includes(address.address1))
})
for (const failure of ['stock', 'supplier_orders']) test(`SQL planning ${failure} failure rolls back complete plan before transport`, async () => {
  const s = sqlFake(); if (failure !== 'stock') s.state.fail = failure
  const store = createOrderRoutingStore({ db: s.db, checkAndLockStock: async () => { if (failure === 'stock') throw new Error('insufficient stock') } })
  await assert.rejects(store.planAndReserve(await samplePlan())); assert.equal(s.state.rollbacks, 1); assert.equal(s.state.committed.length, 0)
})
test('duplicate SQL plan never appends rows or reserves new stock', async () => {
  const s = sqlFake(); s.state.duplicate = true
  const store = createOrderRoutingStore({ db: s.db, checkAndLockStock: async () => assert.fail('must not reserve replay') })
  assert.equal(await store.planAndReserve(await samplePlan()), 'duplicate'); assert.equal(s.state.committed.length, 1)
})
test('SQL spent claim commits outside plan transaction; rejection releases reservations atomically', async () => {
  const s = sqlFake(), store = createOrderRoutingStore({ db: s.db, checkAndLockStock: async () => {} })
  assert.equal(await store.claimSubmission('synthetic-key'), true); assert.equal(s.state.committed[0].transaction, false)
  await store.recordResult('synthetic-key', { status: 'rejected', code: 'SUPPLIER_REJECTED' })
  assert.equal(s.state.begin, 1); assert.ok(s.state.committed.slice(1).every(q => q.transaction))
  assert.ok(s.state.committed.some(q => q.sql.includes("status='released'")))
})
test('SQL result write failure rolls back updates; manual outcome keeps reservations', async () => {
  const s = sqlFake(), store = createOrderRoutingStore({ db: s.db, checkAndLockStock: async () => {} })
  s.state.fail = 'supplier_orders'
  await assert.rejects(store.recordResult('synthetic-key', { status: 'accepted', supplierRef: 'ACK', code: 'SUPPLIER_ACCEPTED' }))
  assert.equal(s.state.rollbacks, 1); assert.equal(s.state.committed.length, 0)
  s.state.fail = null; await store.recordResult('synthetic-key', { status: 'manual', code: 'SUPPLIER_RESULT_UNCERTAIN' })
  assert.ok(!s.state.committed.some(q => q.sql.includes("status='released'")))
})
test('oversized webhook is rejected without persistence; JSON/numeric ID errors rejected safely', async () => {
  const s = setup(); assert.equal((await s.handler(request(s.env, 'x'.repeat(1024 * 1024 + 1)))).status, 413)
  for (const body of ['{', 'null', JSON.stringify({ id: 9007199254740992 }), JSON.stringify({ admin_graphql_api_id: 'bad' })]) {
    assert.equal((await s.handler(request(s.env, body))).status, 400)
  }
  assert.equal(s.state.inbox.size, 0)
})
test('fresh read failure produces private hold; later cancellation after submission is held without another send', async () => {
  const s = setup(); await routePaidOrder(event, s.deps); s.order.cancelled = true
  assert.equal((await routePaidOrder({ ...event, eventId: 'cancellation' }, s.deps)).status, 'manual'); assert.equal(s.state.calls.length, 2)
  s.deps.shopify.readOrder = async () => { throw new Error(address.address1) }
  assert.equal((await routePaidOrder(event, s.deps)).status, 'manual')
  assert.equal(s.state.holds.at(-1).code, 'FRESH_ORDER_READ_FAILED')
})
test('inbox completion preserves pending/manual crash recovery and never reclaims a batch', async () => {
  const s = sqlFake(), store = createOrderRoutingStore({ db: s.db, checkAndLockStock: async () => {} })
  await store.complete(event)
  assert.match(s.state.committed[0].sql, /b.status in \('pending','manual'\)/)
  assert.match(s.state.committed[0].sql, /RECOVERY_REVIEW_REQUIRED/)
  assert.doesNotMatch(s.state.committed[0].sql, /set attempts/)
})
test('unclaimed existing supplier batch becomes manual without calling that supplier', async () => {
  const s = setup(); s.deps.store.claimSubmission = async () => false
  assert.equal((await routePaidOrder(event, s.deps)).status, 'manual'); assert.equal(s.state.calls.length, 0)
})
test('delivery contract strips unrelated customer fields before encryption and transport', async () => {
  const s = setup(); s.order.deliveryAddress = { ...address, email: 'synthetic@example.invalid', arbitrary: 'private-excess' }
  await routePaidOrder(event, s.deps)
  assert.deepEqual(s.state.calls[0].request.deliveryAddress, address)
})

// T11: prove the real submission failure path reaches the injected operator queue.
for (const outcome of ['error', 'rejected']) test(`T11 supplier ${outcome} creates queue and alert without a repeat submission`, async () => {
  const s = setup(), queue = [], alerts = []; let submissions = 0
  const { createFailureReporter } = load('lib/commerce/harness/manual-queue.ts')
  s.deps.reportFailure = createFailureReporter({ enabled: 'true', alertsEnabled: 'true',
    store: { enqueue: async failure => { queue.push(plain(failure)); return { inserted: true, item: { id: 'synthetic-queue' } } } },
    sender: async message => { alerts.push(plain(message)) },
  })
  s.deps.adapters.tropship.placeOrder = async () => {
    submissions++
    if (outcome === 'error') throw new Error('private address and provider secret')
    return { status: 'rejected' }
  }
  await routePaidOrder(event, s.deps)
  assert.equal(submissions, 1); assert.equal(queue.length, 1); assert.equal(alerts.length, 1)
  assert.equal(queue[0].code, outcome === 'error' ? 'SUPPLIER_RECONCILIATION_REQUIRED' : 'SUPPLIER_REJECTED')
  assert.equal(queue[0].orderId, event.orderId)
  assert.ok(!JSON.stringify([queue, alerts]).includes('private address'))
  await routePaidOrder({ ...event, eventId: 'replay' }, s.deps)
  assert.equal(submissions, 1); assert.equal(queue.length, 1)
})
