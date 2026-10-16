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
const load = loader(), { runTracking, buildTrackingClaim } = load('lib/commerce/harness/tracking.ts')
const { createTrackingStore } = load('lib/commerce/harness/tracking-store.ts')
const { createTrackingHandler } = load('lib/commerce/harness/tracking-http.ts')
const plain = value => JSON.parse(JSON.stringify(value))
const shop = 'synthetic.myshopify.com', orderId = 'gid://shopify/Order/1'
const line = (n, quantity = 2) => ({ localKey: String(n).repeat(64), shop, orderId, lineId: `gid://shopify/LineItem/${n}`,
  supplier: 'tropship', supplierRef: 'REF-1', sku: `SYN-${n}`, quantity, fulfilledQuantity: 0, status: 'accepted' })
const parcel = (lines = [{ sku: 'SYN-1', quantity: 2 }, { sku: 'SYN-2', quantity: 2 }], id = 'PARCEL-1') =>
  ({ supplierRef: 'REF-1', shipmentId: id, trackingNumber: 'SYNTHETIC123', carrier: 'Synthetic Carrier', shippedLines: lines })
const snapshot = () => ({ apiVersion: '2026-07', shop, orderId, complete: true, cancelled: false, refunded: false,
  lines: [1, 2].map(n => ({ lineId: `gid://shopify/LineItem/${n}`, fulfillmentOrderId: 'gid://shopify/FulfillmentOrder/10',
    fulfillmentOrderLineItemId: `gid://shopify/FulfillmentOrderLineItem/${n + 100}`, locationId: 'gid://shopify/Location/20', remainingQuantity: 2, canFulfill: true })) })
const success = { data: { fulfillmentCreate: { fulfillment: { id: 'gid://shopify/Fulfillment/50' }, userErrors: [] } } }
function setup(shipments = [parcel()]) {
  const rows = [line(1), line(2)], attempts = new Map(), calls = [], reserved = new Map()
  const deps = { shop, writeEnabled: 'true', timeoutMs: 25,
    adapters: { tropship: { id: 'tropship', async fetchTracking(refs) { calls.push(['tracking', refs]); return structuredClone(shipments) } } },
    shopify: { async readFulfillmentOrder() { calls.push(['read']); return snapshot() }, async fulfillmentCreate(request) { calls.push(['write', plain(request)]); return success } },
    store: {
      async listCandidates() { calls.push(['list']); return structuredClone(rows) },
      async lookup(key, fingerprint) { const old = attempts.get(key); return old ? old.fingerprint !== fingerprint ? 'conflict' : !old.status || old.status === 'uncertain' ? 'unresolved' : 'duplicate' : 'new' },
      async claim(plan) {
        calls.push(['claim']); const old = attempts.get(plan.key)
        if (old) return old.fingerprint === plan.fingerprint ? 'duplicate' : 'conflict'
        if (plan.lines.some(l => { const row = rows.find(r => r.localKey === l.localKey); return row.quantity - row.fulfilledQuantity - (reserved.get(l.localKey) ?? 0) < l.quantity })) return 'blocked'
        attempts.set(plan.key, structuredClone(plan))
        for (const l of plan.lines) reserved.set(l.localKey, (reserved.get(l.localKey) ?? 0) + l.quantity)
        return 'claimed'
      },
      async finish(key, outcome) {
        calls.push(['finish', outcome.status]); const plan = attempts.get(key); plan.status = outcome.status
        if (outcome.status === 'uncertain') return
        for (const l of plan.lines) { reserved.set(l.localKey, reserved.get(l.localKey) - l.quantity)
          if (outcome.status === 'completed') rows.find(r => r.localKey === l.localKey).fulfilledQuantity += l.quantity }
      },
    },
  }
  return { deps, calls, rows, attempts, shipments, reserved }
}
const writes = ctx => ctx.calls.filter(c => c[0] === 'write')
for (const enabled of [undefined, 'false', 'TRUE', '1', 'enabled']) test(`flag ${enabled} makes zero calls`, async () => {
  const c = setup(); c.deps.writeEnabled = enabled; assert.equal((await runTracking(c.deps)).status, 'disabled'); assert.deepEqual(c.calls, [])
})
test('full shipment sends explicit fulfillment-order line IDs, tracking and shipping-email request', async () => {
  const c = setup(); assert.deepEqual(plain(await runTracking(c.deps)), { status: 'completed', created: 1, duplicates: 0, codes: [] })
  const request = writes(c)[0][1]
  assert.equal(request.apiVersion, '2026-07'); assert.match(request.query, /fulfillmentCreate\(fulfillment: \$fulfillment\)/)
  assert.deepEqual(request.variables.fulfillment, { notifyCustomer: true, trackingInfo: { number: 'SYNTHETIC123', company: 'Synthetic Carrier' },
    lineItemsByFulfillmentOrder: [{ fulfillmentOrderId: 'gid://shopify/FulfillmentOrder/10', fulfillmentOrderLineItems: [
      { id: 'gid://shopify/FulfillmentOrderLineItem/101', quantity: 2 }, { id: 'gid://shopify/FulfillmentOrderLineItem/102', quantity: 2 }] }] })
  assert.ok(c.calls.findIndex(c => c[0] === 'claim') < c.calls.findIndex(c => c[0] === 'write'))
  assert.deepEqual(c.rows.map(r => r.fulfilledQuantity), [2, 2])
})
test('partial shipment sends only shipped line and shipped quantity', async () => {
  const c = setup([parcel([{ sku: 'SYN-2', quantity: 1 }])]); await runTracking(c.deps)
  assert.deepEqual(writes(c)[0][1].variables.fulfillment.lineItemsByFulfillmentOrder[0].fulfillmentOrderLineItems,
    [{ id: 'gid://shopify/FulfillmentOrderLineItem/102', quantity: 1 }])
  assert.deepEqual(c.rows.map(r => r.fulfilledQuantity), [0, 1])
})
for (const partial of [false, true]) test(`${partial ? 'partial' : 'full'} shipment rerun writes once`, async () => {
  const c = setup([partial ? parcel([{ sku: 'SYN-2', quantity: 1 }]) : parcel()]); await runTracking(c.deps)
  const rerun = await runTracking(c.deps); assert.equal(rerun.duplicates, 1); assert.equal(writes(c).length, 1)
})
test('distinct later parcel fulfils remaining quantity without duplicating first parcel', async () => {
  const c = setup([parcel([{ sku: 'SYN-1', quantity: 1 }])]); await runTracking(c.deps)
  c.shipments.push(parcel([{ sku: 'SYN-1', quantity: 1 }], 'PARCEL-2')); const result = await runTracking(c.deps)
  assert.equal(result.created, 1); assert.equal(result.duplicates, 1); assert.equal(writes(c).length, 2); assert.equal(c.rows[0].fulfilledQuantity, 2)
})
test('concurrent jobs atomically deduplicate shipment', async () => {
  const c = setup(); const results = await Promise.all([runTracking(c.deps), runTracking(c.deps)])
  assert.equal(results.reduce((sum, r) => sum + r.created, 0), 1); assert.equal(writes(c).length, 1)
})
test('submitted as well as accepted rows fetch tracking; other statuses never fetch', async () => {
  const c = setup([parcel([{ sku: 'SYN-1', quantity: 1 }])]); c.rows[0].status = 'submitted'; c.rows[1].status = 'manual'
  assert.equal((await runTracking(c.deps)).created, 1)
  for (const status of ['pending', 'rejected', 'manual', 'cancelled']) { const d = setup(); d.rows.forEach(r => r.status = status); await runTracking(d.deps); assert.equal(d.calls.length, 1) }
})
test('missing supplier reference holds without fetching', async () => {
  const c = setup(); c.rows.forEach(r => r.supplierRef = null)
  assert.ok((await runTracking(c.deps)).codes.includes('SUPPLIER_REFERENCE_REQUIRED')); assert.equal(c.calls.length, 1)
})
for (const [name, change] of [
  ['tracking number alone', s => { delete s.shippedLines }], ['missing parcel ID', s => { delete s.shipmentId }],
  ['empty shipped list', s => { s.shippedLines = [] }], ['unknown SKU', s => { s.shippedLines[0].sku = 'UNKNOWN' }],
  ['over-shipment', s => { s.shippedLines[0].quantity = 3 }], ['zero quantity', s => { s.shippedLines[0].quantity = 0 }],
  ['fractional quantity', s => { s.shippedLines[0].quantity = 0.5 }], ['duplicate SKU', s => { s.shippedLines.push(s.shippedLines[0]) }],
  ['foreign reference', s => { s.supplierRef = 'FOREIGN' }], ['blank tracking', s => { s.trackingNumber = '' }],
]) test(`holds ${name}`, async () => { const c = setup(); change(c.shipments[0]); assert.equal((await runTracking(c.deps)).status, 'held'); assert.equal(writes(c).length, 0) })
for (const [name, change] of [
  ['incomplete pagination', s => { s.complete = false }], ['cancelled order', s => { s.cancelled = true }],
  ['refund', s => { s.refunded = true }], ['wrong shop', s => { s.shop = 'foreign.myshopify.com' }],
  ['wrong order', s => { s.orderId = 'gid://shopify/Order/2' }], ['API mismatch', s => { s.apiVersion = '2025-01' }],
  ['insufficient remaining units', s => { s.lines[0].remainingQuantity = 1 }], ['unsupported action', s => { s.lines[0].canFulfill = false }],
  ['wrong line ID type', s => { s.lines[0].fulfillmentOrderLineItemId = 'gid://shopify/LineItem/1' }],
  ['multiple locations', s => { s.lines[1].locationId = 'gid://shopify/Location/21' }],
  ['split fulfillment line', s => { s.lines.push({ ...s.lines[0], fulfillmentOrderLineItemId: 'gid://shopify/FulfillmentOrderLineItem/103' }) }],
]) test(`holds snapshot: ${name}`, async () => {
  const c = setup(), s = snapshot(); change(s); c.deps.shopify.readFulfillmentOrder = async () => s
  assert.equal((await runTracking(c.deps)).status, 'held'); assert.equal(writes(c).length, 0)
})
test('repeated supplier SKU across order lines is ambiguous', async () => {
  const c = setup(); c.rows[1].sku = c.rows[0].sku; assert.equal((await runTracking(c.deps)).status, 'held'); assert.equal(writes(c).length, 0)
})
test('same parcel with changed evidence cannot acquire another write', async () => {
  const c = setup(); await runTracking(c.deps); c.shipments[0].trackingNumber = 'CHANGED'
  assert.ok((await runTracking(c.deps)).codes.includes('SHIPMENT_CHANGED')); assert.equal(writes(c).length, 1)
})
for (const [name, write] of [
  ['timeout', () => new Promise(() => {})], ['exception', () => { throw new Error('secret raw error') }],
  ['GraphQL error', async () => ({ errors: [{ message: 'secret' }] })], ['malformed response', async () => ({ data: {} })],
]) test(`${name} leaves spent marker and never replays`, async () => {
  const c = setup(); c.deps.timeoutMs = 2; c.deps.shopify.fulfillmentCreate = async r => { c.calls.push(['write', r]); return write() }
  assert.ok((await runTracking(c.deps)).codes.includes('TRACKING_RECONCILIATION_REQUIRED'))
  assert.equal((await runTracking(c.deps)).duplicates, 1); assert.equal(writes(c).length, 1); assert.equal(c.rows[0].fulfilledQuantity, 0)
  c.shipments.push(parcel([{ sku: 'SYN-1', quantity: 2 }], 'OTHER-ID'))
  assert.ok((await runTracking(c.deps)).codes.includes('TRACKING_CLAIM_BLOCKED')); assert.equal(writes(c).length, 1)
})
test('Shopify rejection is held and original parcel is never retried', async () => {
  const c = setup(); c.deps.shopify.fulfillmentCreate = async r => { c.calls.push(['write', r]); return { data: { fulfillmentCreate: { fulfillment: null, userErrors: [{ message: 'private' }] } } } }
  assert.ok((await runTracking(c.deps)).codes.includes('TRACKING_REJECTED')); assert.equal((await runTracking(c.deps)).duplicates, 1); assert.equal(writes(c).length, 1)
})
test('receipt-save failure leaves committed attempt so rerun never resends', async () => {
  const c = setup(); c.deps.store.finish = async () => { throw new Error('DB failure') }
  assert.ok((await runTracking(c.deps)).codes.includes('TRACKING_RECEIPT_SAVE_FAILED')); assert.equal((await runTracking(c.deps)).duplicates, 1); assert.equal(writes(c).length, 1)
})
test('claim failure never calls writer', async () => {
  const c = setup(); c.deps.store.claim = async () => { throw new Error('DB error') }; assert.equal((await runTracking(c.deps)).status, 'held'); assert.equal(writes(c).length, 0)
})
test('foreign shop rows abort before tracking fetch', async () => {
  const c = setup(); c.rows[0].shop = 'foreign.myshopify.com'; assert.equal((await runTracking(c.deps)).status, 'held'); assert.equal(c.calls.length, 1)
})
test('multiple fulfillment orders at same location have explicit separate lists', () => {
  const s = snapshot(); s.lines[1].fulfillmentOrderId = 'gid://shopify/FulfillmentOrder/11'
  const p = buildTrackingClaim([line(1), line(2)], parcel(), s); assert.equal(p.request.variables.fulfillment.lineItemsByFulfillmentOrder.length, 2)
})
const request = auth => new Request('https://synthetic.invalid/api/harness/tracking', { headers: auth ? { authorization: auth } : {} })
test('cron authenticates, defaults OFF, does not load dependencies and remains unbound', async () => {
  let loads = 0
  const make = env => createTrackingHandler({ env: () => env, load: async () => { loads++; return setup().deps } })
  assert.equal((await make({})(request())).status, 503)
  assert.equal((await make({ CRON_SECRET: 'synthetic' })(request())).status, 401)
  assert.equal((await make({ CRON_SECRET: 'synthetic' })(request('Bearer wrong'))).status, 401)
  assert.equal((await make({ CRON_SECRET: 'synthetic' })(request('Bearer synthetic'))).status, 200); assert.equal(loads, 0)
  const unbound = createTrackingHandler({ env: () => ({ CRON_SECRET: 'synthetic', TRACKING_WRITE_ENABLED: 'true' }) })
  assert.equal((await unbound(request('Bearer synthetic'))).status, 503)
})
test('enabled mocked cron returns aggregates only', async () => {
  const c = setup(), handler = createTrackingHandler({ env: () => ({ CRON_SECRET: 'synthetic', TRACKING_WRITE_ENABLED: 'true' }), load: async () => c.deps })
  const response = await handler(request('Bearer synthetic')); assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store'); const body = await response.text()
  assert.equal(JSON.parse(body).created, 1); assert.doesNotMatch(body, /SYN-|REF-|SYNTHETIC123|localKey|myshopify/)
})
// SQL client mock verifies real store transaction/order and rollback, never opens a DB connection.
function sqlMock(mode = 'normal') {
  const queries = [], trace = [], plan = buildTrackingClaim([line(1), line(2)], parcel(), snapshot())
  const db = { async query(sql, values) {
    queries.push({ sql, values });
    if (/insert into .*tracking_attempts/s.test(sql)) return { rows: mode === 'duplicate' ? [] : [{ local_key: plan.key }] }
    if (/select fingerprint/.test(sql)) return { rows: [{ fingerprint: mode === 'conflict' ? 'different' : plan.fingerprint }] }
    if (/set tracking_reserved_quantity=tracking_reserved_quantity\+/.test(sql)) return { rows: mode === 'blocked' ? [] : [{ id: 'row-id' }] }
    if (/set status=\$2,fulfillment_id/.test(sql)) return { rows: [{ lines: plan.lines, shop, order_id: orderId }] }
    if (/set tracking_reserved_quantity=tracking_reserved_quantity-/.test(sql)) return { rows: [{ id: 'row-id', quantity: 2, fulfilled_quantity: values[4] }] }
    return { rows: [] }
  }, async transaction(fn) { trace.push('begin'); try { const r = await fn(db); trace.push('commit'); return r } catch (e) { trace.push('rollback'); throw e } } }
  return { db, queries, trace, plan, store: createTrackingStore(db) }
}
test('private SQL scan selects submitted/accepted and includes full batches', async () => {
  const c = sqlMock(); await c.store.listCandidates(shop); assert.match(c.queries[0].sql, /status in \('submitted','accepted'\)/)
  assert.match(c.queries[0].sql, /outstanding.batch_id=so.batch_id/); assert.deepEqual(plain(c.queries[0].values), [shop])
})
test('SQL claim locks order, persists marker and reserves quantities in one committed transaction', async () => {
  const c = sqlMock(); assert.equal(await c.store.claim(c.plan), 'claimed'); assert.deepEqual(c.trace, ['begin', 'commit'])
  assert.match(c.queries[0].sql, /pg_advisory_xact_lock/); assert.match(c.queries[1].sql, /on conflict \(local_key\) do nothing/)
  assert.match(c.queries[2].sql, /quantity-fulfilled_quantity-tracking_reserved_quantity >= \$4/)
})
test('SQL shortage rolls back marker and all reservations', async () => {
  const c = sqlMock('blocked'); assert.equal(await c.store.claim(c.plan), 'blocked'); assert.deepEqual(c.trace, ['begin', 'rollback'])
})
test('SQL duplicate and fingerprint conflict never reserve more units', async () => {
  const c = sqlMock('duplicate'); assert.equal(await c.store.claim(c.plan), 'duplicate'); assert.equal(c.queries.length, 3)
  const d = sqlMock('duplicate'); d.db.query = async (sql, values) => {
    d.queries.push({ sql, values }); return { rows: /select fingerprint/.test(sql) ? [{ fingerprint: 'changed' }] : [] }
  }; assert.equal(await d.store.claim(d.plan), 'conflict'); assert.equal(d.queries.length, 3)
})
test('SQL completed receipt updates quantities and releases fully shipped reservations atomically', async () => {
  const c = sqlMock(); await c.store.finish(c.plan.key, { status: 'completed', fulfillmentId: 'gid://shopify/Fulfillment/50' })
  assert.deepEqual(c.trace, ['begin', 'commit']); assert.equal(c.queries.length, 5)
  assert.match(c.queries[0].sql, /status='in_progress'/); assert.equal(c.queries[1].values[4], 2)
  assert.match(c.queries[2].sql, /order_reservations set status='released'/)
})
test('SQL uncertain receipt keeps reserved units; rejected receipt releases without fulfilment', async () => {
  const c = sqlMock(); await c.store.finish(c.plan.key, { status: 'uncertain' }); assert.equal(c.queries.length, 1)
  const d = sqlMock(); await d.store.finish(d.plan.key, { status: 'rejected' }); assert.equal(d.queries.length, 3); assert.equal(d.queries[1].values[4], 0)
})
test('SQL failed receipt rolls back all quantity changes', async () => {
  const c = sqlMock(); const original = c.db.query; c.db.query = async (sql, values) => /set tracking_reserved_quantity=tracking_reserved_quantity-/.test(sql) ? { rows: [] } : original(sql, values)
  await assert.rejects(c.store.finish(c.plan.key, { status: 'completed', fulfillmentId: 'gid://shopify/Fulfillment/50' }), /TRACKING_RESERVATION_REQUIRED/)
  assert.deepEqual(c.trace, ['begin', 'rollback'])
})
test('migration is private, quantity-bounded and default spent; exported route has no bindings', () => {
  const sql = readFileSync(new URL('../supabase/migrations/202610120020_tracking_writeback.sql', import.meta.url), 'utf8')
  assert.match(sql, /fulfilled_quantity \+ tracking_reserved_quantity <= quantity/)
  assert.match(sql, /default 'in_progress'/); assert.match(sql, /enable row level security/); assert.match(sql, /from public, anon, authenticated/)
  const route = loader({ CRON_SECRET: 'synthetic', TRACKING_WRITE_ENABLED: 'true' })('app/api/harness/tracking/route.ts')
  return route.GET(request('Bearer synthetic')).then(r => assert.equal(r.status, 503))
})
test('multiple suppliers fetch their own references and only fulfil their own lines', async () => {
  const c = setup([parcel([{ sku: 'SYN-1', quantity: 2 }])]); c.rows[1].supplier = 'bodypower'; c.rows[1].supplierRef = 'BP-REF'
  c.deps.adapters.bodypower = { id: 'bodypower', async fetchTracking(refs) {
    assert.deepEqual(plain(refs), ['BP-REF']); return [{ ...parcel([{ sku: 'SYN-2', quantity: 1 }], 'BP-PARCEL'), supplierRef: 'BP-REF' }]
  } }
  assert.equal((await runTracking(c.deps)).created, 2)
  assert.deepEqual(writes(c).map(w => w[1].variables.fulfillment.lineItemsByFulfillmentOrder[0].fulfillmentOrderLineItems.map(l => l.id)),
    [['gid://shopify/FulfillmentOrderLineItem/101'], ['gid://shopify/FulfillmentOrderLineItem/102']])
})
test('reordered parcel lines preserve fingerprint and deduplicate', async () => {
  const c = setup(); await runTracking(c.deps); c.shipments[0].shippedLines.reverse()
  assert.equal((await runTracking(c.deps)).duplicates, 1); assert.equal(writes(c).length, 1)
})
test('late write response after timeout does not record completed or re-send', async () => {
  const c = setup(); let resolveWrite
  c.deps.timeoutMs = 2; c.deps.shopify.fulfillmentCreate = async r => { c.calls.push(['write', r]); return new Promise(resolve => { resolveWrite = resolve }) }
  assert.equal((await runTracking(c.deps)).status, 'held'); resolveWrite(success); await Promise.resolve()
  assert.deepEqual(c.calls.filter(c => c[0] === 'finish').map(c => c[1]), ['uncertain'])
  assert.equal((await runTracking(c.deps)).duplicates, 1); assert.equal(writes(c).length, 1)
})
test('partial SQL receipt keeps T09 stock reservation until entire line shipped', async () => {
  const c = sqlMock(); c.plan.lines = [{ localKey: line(1).localKey, quantity: 1 }]
  await c.store.finish(c.plan.key, { status: 'completed', fulfillmentId: 'gid://shopify/Fulfillment/50' })
  assert.equal(c.queries.length, 2); assert.equal(c.queries[1].values[4], 1)
})
test('competing different parcel IDs cannot both claim the same ordered units', async () => {
  const c = setup([parcel()]), other = { ...c.deps, adapters: { tropship: { id: 'tropship', async fetchTracking() { return [parcel(undefined, 'OTHER-PARCEL')] } } } }
  const results = await Promise.all([runTracking(c.deps), runTracking(other)])
  assert.equal(writes(c).length, 1); assert.equal(results.reduce((sum, r) => sum + r.created, 0), 1)
})
for (const where of ['fetch', 'read', 'adapter']) test(`missing/failing ${where} holds with no writes`, async () => {
  const c = setup()
  if (where === 'fetch') c.deps.adapters.tropship.fetchTracking = async () => { throw new Error('secret') }
  if (where === 'read') c.deps.shopify.readFulfillmentOrder = async () => { throw new Error('secret') }
  if (where === 'adapter') delete c.deps.adapters.tropship
  const r = await runTracking(c.deps); assert.equal(r.status, 'held'); assert.equal(writes(c).length, 0); assert.doesNotMatch(JSON.stringify(r), /secret/)
})

test('SQL lookup exposes unresolved attempts so later cron runs keep operator hold visible', async () => {
  for (const status of ['in_progress', 'uncertain', 'completed', 'rejected']) {
    const c = sqlMock(); c.db.query = async () => ({ rows: [{ fingerprint: c.plan.fingerprint, status }] })
    assert.equal(await c.store.lookup(c.plan.key, c.plan.fingerprint), ['in_progress', 'uncertain'].includes(status) ? 'unresolved' : 'duplicate')
    assert.equal(await c.store.lookup(c.plan.key, 'changed'), 'conflict')
  }
})
test('uncertain repeated parcel still reports reconciliation required with zero repeat writes', async () => {
  const c = setup(); c.deps.shopify.fulfillmentCreate = async r => { c.calls.push(['write', r]); return null }
  await runTracking(c.deps); const rerun = await runTracking(c.deps)
  assert.equal(rerun.duplicates, 1); assert.ok(rerun.codes.includes('TRACKING_RECONCILIATION_REQUIRED')); assert.equal(writes(c).length, 1)
})
