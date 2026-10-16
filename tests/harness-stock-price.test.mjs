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
      }, process: { env }, Buffer, Uint8Array, TextDecoder, structuredClone, Request, Response, Date,
      fetch() { throw new Error('No network calls allowed') },
    }, { filename })
    cache.set(filename, mod.exports); return mod.exports
  }
  return load
}
const load = loader(), { syncStockPrice } = load('lib/commerce/harness/sync.ts')
const { createTropShipAdapter, parseTropShipFeed } = load('lib/commerce/harness/adapters/tropship.ts')
const { createStockPriceHandler } = load('lib/commerce/harness/stock-price-http.ts')
const fixture = name => readFileSync(new URL('./fixtures/harness/' + name, import.meta.url))
const now = Date.parse('2026-10-12T10:00:00Z')
const feed = (patch = {}) => ({ bytes: fixture('tropship.csv'), options: {
  provenance: { supplierId: 'tropship', sourceId: 'synthetic-saved-feed', receivedAt: '2026-10-12T10:00:00Z',
    supplierObservation: { observedAt: '2026-10-12T09:00:00Z', trusted: true, evidenceId: 'synthetic-observation' },
    rowGrain: { status: 'approved_unique_sellable_unit', evidenceId: 'synthetic-unit-review' } },
  evaluatedAt: '2026-10-12T10:00:00Z', maxObservationAgeMs: 6 * 3600_000,
}, ...patch })
const pack = { version: 'v1', sellingUnit: 'single', innerCount: 1, amountPerInner: 500, unit: 'g' }
const identity = { formulaId: 'synthetic', formulaVersion: 'v1', flavourId: 'Vanilla', labelVersion: 'v1', pack }
function mapping(n, priceAuto = false) {
  return { id: `00000000-0000-4000-8000-00000000000${n}`, feedSize: '500g', row: {
    comparison_product_id: `synthetic-${n}`, status: 'store', shopify_product_id: `gid://shopify/Product/${n}`,
    shopify_variant_id: `gid://shopify/ProductVariant/${n}`, handle: `synthetic-${n}`, supplier: 'tropship', supplier_sku: `SYN-${n}`,
    ean: '4006381333931', pack, flavour: 'Vanilla', cost_ex_vat: '10.00', price_auto: priceAuto, active: true,
    approval_reference: 'synthetic-review', mapping_status: 'exact', mapping_source: 'verified_labels',
    shop_identity: identity, supplier_identity: structuredClone(identity),
    review: { approved: true, version: 'v1', expectedVersion: 'v1', verifiedAtMs: now - 3600_000, expiresAtMs: now + 3600_000 },
  } }
}
const deps = (patch = {}) => ({ adapter: createTropShipAdapter(async () => feed()), mappings: [mapping(1), mapping(2, true)],
  variants: [1, 2].map(n => ({ variantId: `gid://shopify/ProductVariant/${n}`, stock: 9, pricePence: 2000 })),
  now: () => now, proposePrice: () => 2500, ...patch })
const plain = value => JSON.parse(JSON.stringify(value))

test('saved fixture produces the complete expected dry-run diff without any writes', async () => {
  let writes = 0
  const result = await syncStockPrice(deps({ apply: async () => { writes++; return 'applied' }, record: async () => { writes++ } }))
  assert.equal(result.status, 'dry_run'); assert.equal(writes, 0)
  assert.deepEqual(plain(result.diffs), JSON.parse(fixture('expected-diffs.json')))
})
for (const flag of [undefined, 'false', 'TRUE', '1', ' true ', 'enabled']) test(`write flag ${String(flag)} never calls writer or persistence`, async () => {
  const result = await syncStockPrice(deps({ writeEnabled: flag, apply: () => assert.fail('write'), record: () => assert.fail('persist') }))
  assert.equal(result.status, 'dry_run'); assert.ok(result.diffs.every(d => !d.applied))
})
test('exact true flag writes absolute inventory and unlocked customer price only', async () => {
  const writes = [], records = []
  const result = await syncStockPrice(deps({ writeEnabled: 'true', apply: async diff => { writes.push(diff); return 'applied' }, record: async run => records.push(run) }))
  assert.equal(result.status, 'completed'); assert.equal(writes.length, 3); assert.equal(records.length, 1)
  assert.deepEqual(writes.filter(d => d.field === 'inventory').map(d => d.new), [5, 0])
  assert.ok(writes.filter(d => d.field === 'price').every(d => d.mappingId.endsWith('2')))
  assert.ok(result.diffs.filter(d => d.field === 'cost_ex_vat').every(d => !d.applied))
})
test('missing approved price policy cannot use supplier cost as selling price', async () => {
  const result = await syncStockPrice(deps({ proposePrice: undefined }))
  assert.ok(result.alerts.some(a => a.code === 'PRICE_POLICY_REQUIRED')); assert.equal(result.diffs.filter(d => d.field === 'price').length, 0)
})
for (const [name, input] of [
  ['unterminated CSV', () => feed({ bytes: fixture('malformed.csv') })],
  ['invalid unmapped row', () => feed({ bytes: Buffer.from(fixture('tropship.csv').toString().replace('15.00', 'PRIVATE-ERROR')) })],
  ['duplicate SKU', () => feed({ bytes: Buffer.from(fixture('tropship.csv').toString().replace('SYN-3', 'SYN-1')) })],
  ['over 30 percent row drop', () => feed({ previousGoodRowCount: 5 })],
  ['untrusted observation', () => { const f = feed(); f.options.provenance.supplierObservation.trusted = false; return f }],
  ['stale observation', () => { const f = feed(); f.options.provenance.supplierObservation.observedAt = '2026-10-12T04:00:00Z'; return f }],
]) test(`${name} alerts and skips entire run with no partial writes`, async () => {
  const result = await syncStockPrice(deps({ adapter: createTropShipAdapter(async () => input()), writeEnabled: 'true', apply: () => assert.fail('write') }))
  assert.equal(result.status, 'skipped'); assert.equal(result.diffs.length, 0); assert.equal(result.alerts[0].code, 'FEED_REJECTED')
  assert.ok(!JSON.stringify(result).includes('PRIVATE-ERROR'))
})
test('exact 30 percent drop allowed and filtering follows whole-file validation', async () => {
  const f = feed(), lines = f.bytes.toString().trim().split('\n')
  f.bytes = Buffer.from(lines[0] + '\n' + Array.from({ length: 7 }, (_, i) => lines[1].replace('SYN-1', `SYN-${i + 1}`)).join('\n') + '\n')
  f.previousGoodRowCount = 10
  assert.equal(parseTropShipFeed(f).length, 7)
  const adapter = createTropShipAdapter(async () => feed())
  assert.equal((await adapter.fetchStockPrice(['SYN-2'])).length, 1)
  assert.equal((await adapter.fetchCatalogue()).length, 3)
  assert.equal((await adapter.placeOrder({})).status, 'rejected')
  await assert.rejects(adapter.fetchTracking([]), /TODO\(T10\)/)
})
for (const [name, patch] of [
  ['inactive', { active: false }], ['unapproved', { review: { approved: false } }],
  ['wrong barcode', { ean: '0000000000000' }], ['wrong flavour', { flavour: 'Chocolate' }],
  ['ambiguous', { mapping_status: 'ambiguous' }],
]) test(`${name} mapping produces no writes for that mapping`, async () => {
  const m = mapping(1); m.row = { ...m.row, ...patch, ...(patch.review ? { review: { ...m.row.review, ...patch.review } } : {}) }
  const result = await syncStockPrice(deps({ mappings: [m], writeEnabled: 'true', apply: () => assert.fail('write') }))
  assert.equal(result.diffs.length, 0)
})
test('wrong reviewed feed size or missing variant is held', async () => {
  for (const patch of [{ mappings: [{ ...mapping(1), feedSize: '1kg' }] }, { variants: [] }]) {
    const result = await syncStockPrice(deps({ ...patch, writeEnabled: 'true', apply: () => assert.fail('write') }))
    assert.equal(result.diffs.length, 0); assert.ok(result.alerts.length)
  }
})
for (const outcome of ['uncertain', 'rejected', 'throw']) test(`${outcome} write stops run without retry`, async () => {
  let calls = 0
  const result = await syncStockPrice(deps({ writeEnabled: 'true', apply: async () => { calls++; if (outcome === 'throw') throw new Error('PRIVATE'); return outcome } }))
  assert.equal(calls, 1); assert.equal(result.status, outcome === 'rejected' ? 'failed' : 'uncertain'); assert.ok(!JSON.stringify(result).includes('PRIVATE'))
})
test('missing writer and failed persistence are reported', async () => {
  assert.equal((await syncStockPrice(deps({ writeEnabled: 'true' }))).status, 'skipped')
  const result = await syncStockPrice(deps({ writeEnabled: 'true', apply: async () => 'applied', record: async () => { throw new Error('PRIVATE') } }))
  assert.equal(result.status, 'failed'); assert.equal(result.alerts.at(-1).code, 'RUN_RECORD_FAILED')
})
const request = token => new Request('https://synthetic.invalid/api/harness/stock-price', { headers: token ? { authorization: token } : {} })
test('actual exported cron route denies missing auth config and is off by default', async () => {
  assert.equal((await loader()('app/api/harness/stock-price/route.ts').GET(request())).status, 503)
  const route = loader({ CRON_SECRET: 'synthetic' })('app/api/harness/stock-price/route.ts')
  assert.equal((await route.GET(request())).status, 401)
  assert.equal((await route.GET(request('Bearer wrong'))).status, 401)
  assert.deepEqual(await (await route.GET(request('Bearer synthetic'))).json(), { status: 'disabled' })
})
test('cron authorised run uses exact flags, protects private diff data and returns no-store', async () => {
  const env = { CRON_SECRET: 'synthetic', HARNESS_ENABLED: 'true', HARNESS_WRITE_ENABLED: 'false' }
  const handler = createStockPriceHandler({ env: () => env, load: async () => deps({ writeEnabled: 'true', apply: () => assert.fail('write') }) })
  const response = await handler(request('Bearer synthetic')), body = await response.json()
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(body.status, 'dry_run')
  assert.ok(!JSON.stringify(body).includes('SYN-')); assert.ok(!JSON.stringify(body).includes('cost_ex_vat'))
  const unconfigured = createStockPriceHandler({ env: () => env })
  assert.equal((await unconfigured(request('Bearer synthetic'))).status, 503)
})
test('migration is private, default-off and related to saved mapping (static check only)', () => {
  const sql = readFileSync(new URL('../supabase/migrations/202610120018_harness_stock_price.sql', import.meta.url), 'utf8')
  for (const table of ['harness_runs', 'sync_diffs']) {
    assert.match(sql, new RegExp(`create table tll_harness_private\\.${table}`))
    assert.match(sql, new RegExp(`alter table tll_harness_private\\.${table} enable row level security`))
  }
  assert.match(sql, /write_enabled boolean not null default false/)
  assert.match(sql, /applied boolean not null default false/)
  assert.match(sql, /references tll_mapping_private.product_mapping\(id\)/)
  assert.match(sql, /from public, anon, authenticated/); assert.doesNotMatch(sql, /create policy|grant .* to (anon|authenticated)/i)
})

test('locked price never invokes customer-price calculation even when supplier cost changes', async () => {
  const result = await syncStockPrice(deps({ mappings: [mapping(1)], proposePrice: () => assert.fail('locked price') }))
  assert.equal(result.diffs.filter(d => d.field === 'price').length, 0)
  assert.equal(result.diffs.find(d => d.field === 'cost_ex_vat').reason, 'price_locked')
})
test('duplicate variant states and mapping IDs skip before writing', async () => {
  for (const patch of [{ variants: [deps().variants[0], deps().variants[0]] },
    { mappings: [mapping(1), { ...mapping(2, true), id: mapping(1).id }] }]) {
    const result = await syncStockPrice(deps({ ...patch, writeEnabled: 'true', apply: () => assert.fail('write') }))
    assert.equal(result.status, 'skipped'); assert.equal(result.diffs.length, 0)
  }
})
test('feed read failure and invalid policy prices produce redacted alerts', async () => {
  const adapter = { ...deps().adapter, async fetchStockPrice() { throw new Error('PRIVATE-CREDENTIAL') } }
  const failed = await syncStockPrice(deps({ adapter }))
  assert.equal(failed.status, 'skipped'); assert.equal(failed.alerts[0].code, 'FEED_READ_FAILED')
  assert.ok(!JSON.stringify(failed).includes('PRIVATE-CREDENTIAL'))
  for (const value of [0, -1, NaN, 1.5, 1_000_000_001]) {
    const result = await syncStockPrice(deps({ proposePrice: () => value }))
    assert.equal(result.diffs.filter(d => d.field === 'price').length, 0)
    assert.ok(result.alerts.some(a => a.code === 'PRICE_POLICY_REQUIRED'))
  }
})
test('malformed feed through authenticated cron returns alert and zero diff count', async () => {
  const handler = createStockPriceHandler({ env: () => ({ CRON_SECRET: 'synthetic', HARNESS_ENABLED: 'true' }),
    load: async () => deps({ adapter: createTropShipAdapter(async () => feed({ bytes: fixture('malformed.csv') })) }) })
  const body = await (await handler(request('Bearer synthetic'))).json()
  assert.equal(body.status, 'skipped'); assert.equal(body.diffs, 0); assert.equal(body.alerts[0].code, 'FEED_REJECTED')
})
