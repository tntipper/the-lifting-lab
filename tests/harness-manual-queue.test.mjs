import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url), root = fileURLToPath(new URL('../', import.meta.url))
function loader(env = {}, mocks = {}) {
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
        if (name in mocks) return mocks[name]
        if (!name.startsWith('.') && !name.startsWith('@/')) return require(name)
        const base = name.startsWith('@/') ? resolve(root, name.slice(2)) : resolve(dirname(filename), name)
        assert.ok(existsSync(base + '.ts'), name); return load(base + '.ts')
      }, process: { env }, Buffer, Uint8Array, TextDecoder, structuredClone, Request, Response, Date, URL, URLSearchParams, setTimeout, clearTimeout,
      fetch() { throw new Error('No network calls allowed') },
    }, { filename })
    cache.set(filename, mod.exports); return mod.exports
  }
  return load
}
const load = loader()
const { createFailureReporter, createManualQueueStore, buildDailyDigest, failureKey } = load('lib/commerce/harness/manual-queue.ts')
const { createManualAdminHandler } = load('lib/commerce/harness/manual-admin-http.ts')
const { syncStockPrice } = load('lib/commerce/harness/sync.ts')
const { runTracking } = load('lib/commerce/harness/tracking.ts')
const { routePaidOrder } = load('lib/commerce/harness/route-orders.ts')
const id = '00000000-0000-4000-8000-000000000001'
const failure = { job: 'stock-price', code: 'FEED_READ_FAILED', reference: 'synthetic-run' }
const plain = value => JSON.parse(JSON.stringify(value))
function memoryStore() {
  const items = [], alerts = []
  const store = {
    async enqueue(f) {
      const key = failureKey(f), existing = items.find(i => i.failureKey === key)
      if (existing) return { item: existing, inserted: false }
      const item = { id, failureKey: key, job: f.job, code: f.code, orderId: f.orderId ?? null, supplier: f.supplier ?? null, status: 'open', createdAt: '2026-10-12T10:00:00Z', doneAt: null, doneBy: null }
      items.push(item); return { item, inserted: true }
    },
    async listOpen() { return items.filter(i => i.status === 'open') },
    async markDone(key, actor) {
      const item = items.find(i => i.id === key && i.status === 'open')
      if (!item) return false
      item.status = 'done'; item.doneAt = '2026-10-12T10:01:00Z'; item.doneBy = actor; return true
    },
  }
  const reportFailure = createFailureReporter({ enabled: 'true', alertsEnabled: 'true', store, sender: async message => { alerts.push(message) } })
  return { store, items, alerts, reportFailure }
}
const page = (state, patch = {}) => createManualAdminHandler({ enabled: 'true', store: state.store, authenticate: async () => ({ id: 'synthetic-admin', admin: true }), ...patch })
const post = (patch = {}) => new Request('https://example.test/admin/harness', { method: 'POST', headers: { origin: 'https://example.test', 'content-type': 'application/x-www-form-urlencoded', ...patch }, body: `action=done&id=${id}` })

test('forced stock adapter error enqueues and calls injected alert before job returns', async () => {
  const state = memoryStore(), start = Date.now()
  const result = await syncStockPrice({ adapter: { id: 'tropship', fetchStockPrice: async () => { throw new Error('secret customer address') } }, mappings: [], variants: [], writeEnabled: 'true', reportFailure: state.reportFailure })
  assert.equal(result.status, 'skipped'); assert.equal(state.items.length, 1); assert.equal(state.alerts.length, 1)
  assert.equal(state.items[0].code, 'FEED_READ_FAILED'); assert.ok(Date.now() - start < 300000)
  assert.ok(!JSON.stringify(state).includes('secret customer address'))
})
test('stock dry-run does not persist or alert', async () => {
  const state = memoryStore()
  await syncStockPrice({ adapter: { id: 'tropship', fetchStockPrice: async () => { throw new Error() } }, mappings: [], variants: [], reportFailure: state.reportFailure })
  assert.equal(state.items.length, 0); assert.equal(state.alerts.length, 0)
})
test('tracking adapter failure connects to queue and alert', async () => {
  const state = memoryStore()
  const result = await runTracking({ writeEnabled: 'true', shop: 'synthetic.myshopify.com', store: { listCandidates: async () => [{ shop: 'synthetic.myshopify.com', localKey: 'line', supplier: 'tropship', status: 'accepted', supplierRef: 'synthetic' }] }, adapters: { tropship: { id: 'tropship', fetchTracking: async () => { throw new Error('secret') } } }, reportFailure: state.reportFailure, shopify: {} })
  assert.equal(result.status, 'held'); assert.equal(state.items[0].code, 'TRACKING_FETCH_FAILED'); assert.equal(state.alerts.length, 1)
})
test('order hold connects to queue without retry or supplier call', async () => {
  const state = memoryStore(); let holds = 0
  const result = await routePaidOrder({ shop: 'synthetic.myshopify.com', orderId: 'gid://shopify/Order/1' }, { enabled: 'true', shop: 'synthetic.myshopify.com', shopify: { readOrder: async () => { throw new Error('secret') } }, store: { hold: async () => { holds++ } }, reportFailure: state.reportFailure })
  assert.equal(result.status, 'manual'); assert.equal(holds, 1); assert.equal(state.items[0].code, 'FRESH_ORDER_READ_FAILED'); assert.equal(state.alerts.length, 1)
})
for (const enabled of [undefined, 'false', 'TRUE', '1']) test(`queue flag ${enabled} makes no calls`, async () => {
  const report = createFailureReporter({ enabled, alertsEnabled: 'true', store: {}, sender: async () => { assert.fail() } })
  assert.equal(await report(failure), 'disabled')
})
test('alerts default OFF, queue can still save', async () => {
  const state = memoryStore()
  assert.equal(await createFailureReporter({ enabled: 'true', store: state.store, sender: async () => { assert.fail() } })(failure), 'queued')
})
test('duplicate and done incidents never auto reopen or send twice; new reference creates new incident', async () => {
  const state = memoryStore()
  assert.equal(await state.reportFailure(failure), 'queued')
  assert.equal(await state.reportFailure(failure), 'duplicate')
  await state.store.markDone(id, 'admin')
  assert.equal(await state.reportFailure(failure), 'duplicate'); assert.equal(state.alerts.length, 1)
  await state.reportFailure({ ...failure, reference: 'new-run' }); assert.equal(state.items.length, 2)
})
test('queue persistence error is explicit and never sends', async () => {
  const report = createFailureReporter({ enabled: 'true', alertsEnabled: 'true', store: { enqueue: async () => { throw new Error('secret') } }, sender: async () => { assert.fail() } })
  assert.equal(await report(failure), 'queue_failed')
})
for (const sender of [undefined, async () => { throw new Error('secret') }]) test('missing/failing sender preserves queue and reports alert failure', async () => {
  const state = memoryStore()
  const report = createFailureReporter({ enabled: 'true', alertsEnabled: 'true', store: state.store, sender })
  assert.equal(await report(failure), 'alert_failed'); assert.equal(state.items.length, 1)
})
test('job exposes failed alert delivery as safe code', async () => {
  const result = await syncStockPrice({ adapter: { id: 'tropship', fetchStockPrice: async () => { throw new Error() } }, mappings: [], variants: [], writeEnabled: 'true', reportFailure: async () => 'alert_failed' })
  assert.ok(result.alerts.some(a => a.code === 'ALERT_SEND_FAILED'))
})
for (const identity of [null, { id: 'customer', admin: false }, { id: '', admin: true }]) test('non-admin GET and POST both return 403 before queue access', async () => {
  const handler = page({ store: {} }, { authenticate: async () => identity })
  for (const request of [new Request('https://example.test/admin/harness'), post()]) assert.equal((await handler(request)).status, 403)
})
test('auth service failure denies access', async () => {
  assert.equal((await page({ store: {} }, { authenticate: async () => { throw new Error() } })(post())).status, 403)
})
test('admin sees list; mark done redirects and records actor; duplicate completion returns 409', async () => {
  const state = memoryStore(); await state.reportFailure(failure)
  const handler = page(state), response = await handler(new Request('https://example.test/admin/harness'))
  assert.equal(response.status, 200); const html = await response.text(); assert.match(html, /FEED_READ_FAILED/); assert.match(html, /Mark done/)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const done = await handler(post()); assert.equal(done.status, 303); assert.equal(done.headers.get('location'), '/admin/harness')
  assert.equal(state.items[0].doneBy, 'synthetic-admin'); assert.equal((await state.store.listOpen()).length, 0)
  assert.equal((await handler(post())).status, 409)
})
for (const origin of ['', 'https://attacker.test']) test('cross-site and absent-origin requests cannot close items', async () => {
  const state = memoryStore(); await state.reportFailure(failure)
  assert.equal((await page(state)(post({ origin }))).status, 403); assert.equal(state.items[0].status, 'open')
})
test('page escapes queue content', async () => {
  const state = memoryStore(); await state.reportFailure(failure); state.items[0].code = '<script>attack</script>'
  const html = await (await page(state)(new Request('https://example.test/admin/harness'))).text()
  assert.ok(!html.includes('<script>')); assert.match(html, /&lt;script&gt;/)
})
test('disabled/unbound admin page remains unavailable', async () => {
  assert.equal((await page({ store: {} }, { enabled: undefined })(post())).status, 503)
  assert.equal((await page({}, { store: undefined })(post())).status, 503)
})
test('invalid form and storage failures return safe statuses', async () => {
  const state = memoryStore()
  assert.equal((await page(state)(post({ 'content-type': 'application/json' }))).status, 400)
  assert.equal((await page({ store: { listOpen: async () => { throw new Error('secret') } } })(new Request('https://example.test/admin/harness'))).status, 503)
})
test('exported page defaults to 403 without touching Supabase and remains denied with unapproved admin policy', async () => {
  let calls = 0
  const mock = { '@/lib/supabase-server': { createServerSupabase: async () => { calls++; return { auth: { getUser: async () => ({ data: { user: { id: 'user', user_metadata: { admin: true } } } }) } } } } }
  const off = loader({}, mock)('app/admin/harness/route.ts')
  assert.equal((await off.GET(new Request('https://example.test/admin/harness'))).status, 403); assert.equal(calls, 0)
  const on = loader({ HARNESS_MANUAL_QUEUE_ENABLED: 'true' }, mock)('app/admin/harness/route.ts')
  assert.equal((await on.POST(post())).status, 403); assert.equal(calls, 1)
})
test('SQL store uses private parameterised writes, unique incident keys and conditional done update', async () => {
  const state = memoryStore(); await state.reportFailure(failure); const calls = [], replies = [[state.items[0]], [], [state.items[0]], [state.items[0]], [state.items[0]], []]
  const store = createManualQueueStore({ query: async (sql, values) => { calls.push({ sql, values }); return { rows: replies.shift() } } })
  assert.equal((await store.enqueue(failure)).inserted, true); assert.equal((await store.enqueue(failure)).inserted, false)
  assert.equal((await store.listOpen()).length, 1); assert.equal(await store.markDone(id, 'admin'), true); assert.equal(await store.markDone(id, 'admin'), false)
  assert.ok(calls.every(c => c.sql.includes('tll_harness_private.manual_queue')))
  assert.match(calls[0].sql, /on conflict .* do nothing/); assert.match(calls[4].sql, /status='open'/)
  assert.deepEqual(plain(calls[4].values), [id, 'admin']); assert.ok(!JSON.stringify(calls).includes('synthetic-run'))
  await assert.rejects(store.markDone('bad', 'admin'), /QUEUE_DONE_INVALID/)
})
test('safe error codes only and missing DB conflict record fails explicitly', async () => {
  assert.throws(() => failureKey({ ...failure, code: 'raw secret' }), /FAILURE_INVALID/)
  await assert.rejects(createManualQueueStore({ query: async () => ({ rows: [] }) }).enqueue(failure), /QUEUE_CONFLICT_NOT_FOUND/)
})
test('daily digest includes open counts, shipping total and evidence progress; never sends', async () => {
  const state = memoryStore(); await state.reportFailure(failure)
  const digest = buildDailyDigest({ items: [...state.items, { ...state.items[0], status: 'done' }], absorbedShippingPence: 1200, evidenceDays: 1, targetDays: 3 })
  assert.match(digest.text, /Open queue items: 1/); assert.match(digest.text, /£12.00/); assert.match(digest.text, /1\/3 days/)
  assert.ok(!digest.text.includes(state.items[0].failureKey)); assert.equal(state.alerts.length, 1)
  assert.match(buildDailyDigest({ items: [], absorbedShippingPence: 0, evidenceDays: 0, targetDays: 3 }).text, /Open queue items: 0/)
})
test('digest rejects guessed/invalid totals and raw messages', () => {
  for (const amount of [-1, NaN, 1.2]) assert.throws(() => buildDailyDigest({ items: [], absorbedShippingPence: amount, evidenceDays: 0, targetDays: 3 }), /DIGEST_TOTALS_INVALID/)
  assert.throws(() => buildDailyDigest({ items: [{ status: 'open', job: 'orders', code: 'secret message' }], absorbedShippingPence: 0, evidenceDays: 0, targetDays: 3 }), /DIGEST_ITEM_INVALID/)
})
test('migration remains private RLS-enabled and has constrained completion audit', () => {
  const sql = readFileSync(new URL('../supabase/migrations/202610120021_manual_queue.sql', import.meta.url), 'utf8')
  for (const re of [/enable row level security/, /revoke all .* from public, anon, authenticated/, /failure_key text not null unique/, /done_by/, /done_at >= created_at/, /default 'open'/]) assert.match(sql, re)
  assert.ok(!sql.includes('create policy'))
})

test('stalled sender times out with queue preserved; late transport is never retried', async () => {
  const state = memoryStore(); let sends = 0
  const reporter = createFailureReporter({ enabled: 'true', alertsEnabled: 'true', store: state.store, timeoutMs: 5, sender: async () => { sends++; await new Promise(() => {}) } })
  assert.equal(await reporter(failure), 'alert_failed'); assert.equal(state.items.length, 1)
  assert.equal(await reporter(failure), 'duplicate'); assert.equal(sends, 1)
})
test('tracking and order OFF skip failure reporting and all service calls', async () => {
  const reportFailure = async () => { assert.fail('disabled job reported failure') }
  assert.equal((await runTracking({ reportFailure })).status, 'disabled')
  assert.equal((await routePaidOrder({}, { reportFailure })).status, 'disabled')
})

test('private queue includes validated order context for operator reconciliation; alert omits it', async () => {
  const state = memoryStore(), orderId = 'gid://shopify/Order/123'
  await state.reportFailure({ ...failure, orderId, supplier: 'tropship' })
  const html = await (await page(state)(new Request('https://example.test/admin/harness'))).text()
  assert.ok(html.includes(orderId)); assert.ok(html.includes('tropship')); assert.ok(!state.alerts[0].text.includes(orderId))
  assert.throws(() => failureKey({ ...failure, orderId: 'customer-address' }), /FAILURE_CONTEXT_INVALID/)
})
