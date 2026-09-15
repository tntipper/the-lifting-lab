import test from 'node:test'
import assert from 'node:assert/strict'
import { createShopifyAdminAdapter, SHOPIFY_ADMIN_API_VERSION, SHOPIFY_MUTATIONS_ENABLED_BY_DEFAULT, shopifyGraphqlEndpoint } from '../lib/commerce/shopify-admin.ts'

const NOW = 1_800_000_000_000
const DOMAIN = 'synthetic-tll-adapter.myshopify.com'
const TOKEN = 'synthetic-token-never-a-real-credential'
const OP1 = '70000000-0000-4000-8000-000000000001', OP2 = '70000000-0000-4000-8000-000000000002'
const gid = (type, id) => `gid://shopify/${type}/${id}`
const IDs = { shop: gid('Shop', 1), product: gid('Product', 2), variant: gid('ProductVariant', 3), item: gid('InventoryItem', 4), location: gid('Location', 5) }
const clone = value => structuredClone(value)
const review = version => ({ approved: true, version, expectedVersion: version, verifiedAtMs: NOW - 2000, expiresAtMs: NOW + 100000 })
function data() {
  const identity = { formulaId: 'formula-1', formulaVersion: 'formula-v1', flavourId: 'vanilla', labelVersion: 'label-1', pack: { version: 'pack-1', sellingUnit: 'single', innerCount: 1, amountPerInner: 500, unit: 'g' } }
  return {
    policy: { review: review('policy-1'), shopDomain: DOMAIN, shopId: IDs.shop, locationId: IDs.location, sourceOfTruth: 'reconciled_supplier_stock', maxReadAgeMs: 10000, maxStockAgeMs: 60000, maxAvailableQuantity: 1000, maxAbsoluteChange: 100 },
    binding: { review: review('binding-1'), shopDomain: DOMAIN, shopId: IDs.shop, mappingVersion: 'mapping-1', shopifyProductId: IDs.product, shopifyProductHandle: 'synthetic-product', shopifyVariantId: IDs.variant, inventoryItemId: IDs.item, locationId: IDs.location, shopifySku: 'SHOP-SKU-1' },
    mapping: { review: review('mapping-1'), productId: 'synthetic-product', shopifyProductId: '2', shopifyProductHandle: 'synthetic-product', shopifyVariantId: '3', supplierSku: 'SUPPLIER-SKU-1', status: 'exact', source: 'verified_labels', shopIdentity: clone(identity), supplierIdentity: clone(identity) },
    stock: { review: review('stock-1'), observedAtMs: NOW - 1000, shopifyVariantId: '3', supplierSku: 'SUPPLIER-SKU-1', packVersion: 'pack-1', basis: 'reconciled_sellable_units', availableToSell: 7 },
  }
}
function readBody(quantity = 4) {
  return { data: { shop: { id: IDs.shop, myshopifyDomain: DOMAIN }, productVariant: { id: IDs.variant, sku: 'SHOP-SKU-1', inventoryPolicy: 'DENY', requiresComponents: false,
    product: { id: IDs.product, handle: 'synthetic-product', status: 'ACTIVE' }, inventoryItem: { id: IDs.item, sku: 'SHOP-SKU-1', tracked: true,
      variants: { nodes: [{ id: IDs.variant }], pageInfo: { hasNextPage: false } },
      inventoryLevel: { isActive: true, item: { id: IDs.item }, location: { id: IDs.location, isActive: true }, quantities: [{ name: 'available', quantity }] },
    } } } }
}
function ackBody(request) {
  const input = request.variables.input, change = input.quantities[0]
  return { data: { inventorySetQuantities: { userErrors: [], inventoryAdjustmentGroup: {
    id: gid('InventoryAdjustmentGroup', 6), referenceDocumentUri: input.referenceDocumentUri,
    changes: [{ name: 'available', item: { id: change.inventoryItemId }, location: { id: change.locationId }, delta: change.quantity - change.changeFromQuantity, quantityAfterChange: change.quantity }],
  } } } }
}
function response(body, { status = 200, version = SHOPIFY_ADMIN_API_VERSION, contentType = 'application/json', headers = {} } = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'x-shopify-api-version': version, 'content-type': contentType, ...headers } })
}
function fixture({ enabled, policy, read, mutation, timeoutMs } = {}) {
  const f = data(), calls = []; let time = NOW, quantity = 4
  if (policy) policy(f.policy)
  const transport = async (url, init) => {
    assert.equal(url, shopifyGraphqlEndpoint(DOMAIN)); assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'manual'); assert.equal(init.credentials, 'omit'); assert.equal(init.cache, 'no-store')
    assert.ok(init.signal instanceof AbortSignal)
    assert.equal(new Headers(init.headers).get('x-shopify-access-token'), TOKEN)
    const body = JSON.parse(init.body); calls.push(body)
    if (body.operationName === 'TllInventoryTarget') return read ? read(readBody(quantity), body) : response(readBody(quantity))
    assert.equal(body.operationName, 'TllInventorySet')
    quantity = body.variables.input.quantities[0].quantity
    return mutation ? mutation(ackBody(body), body) : response(ackBody(body))
  }
  const adapter = createShopifyAdminAdapter({ policy: f.policy, accessToken: TOKEN, transport, clock: () => time, mutationsEnabled: enabled, timeoutMs })
  return { ...f, adapter, calls, tick: ms => { time += ms }, setQuantity: value => { quantity = value },
    async prepare(overrides = {}) {
      const result = await adapter.readTarget(f.binding)
      assert.equal(result.status, 'observed', JSON.stringify(result))
      return adapter.prepareChange({ binding: f.binding, mapping: f.mapping, stock: f.stock, observation: result.observation, operationId: OP1, ...overrides })
    },
  }
}
function held(result, code) { assert.equal(result.status, 'hold', JSON.stringify(result)); if (code) assert.equal(result.code, code); assert.equal(result.retryAllowed, false) }

test('2026-07 endpoint pin and mutations disabled default are explicit', () => {
  assert.equal(SHOPIFY_ADMIN_API_VERSION, '2026-07'); assert.equal(SHOPIFY_MUTATIONS_ENABLED_BY_DEFAULT, false)
  assert.equal(shopifyGraphqlEndpoint(DOMAIN), `https://${DOMAIN}/admin/api/2026-07/graphql.json`)
})
for (const domain of ['localhost', '127.0.0.1', 'shop.myshopify.com.example.invalid', 'a.b.myshopify.com', 'a.myshopify.com:443', 'https://a.myshopify.com', 'a.myshopify.com/', 'a.myshopify.com@localhost', 'a%2emyshopify.com', 'A.myshopify.com', '-a.myshopify.com', 'a-.myshopify.com', 'a.myshopify.com\n', `${'a'.repeat(64)}.myshopify.com`]) {
  test(`reject caller-host SSRF form ${JSON.stringify(domain)}`, () => assert.throws(() => shopifyGraphqlEndpoint(domain)))
}
test('configuration rejects expired policy, implicit/invalid transport, header injection and ambiguous mutation switch', () => {
  for (const change of [o => { o.policy.review.approved = false }, o => { o.policy.review.expiresAtMs = NOW }, o => { o.accessToken = 'secret\r\nX-Bad: value' }, o => { delete o.transport }, o => { o.mutationsEnabled = 'true' }, o => { o.timeoutMs = 0 }, o => { o.policy.maxReadAgeMs = Infinity }, o => { o.policy.shopId = 'gid://shopify/Product/1' }]) {
    const options = { policy: data().policy, accessToken: TOKEN, transport: async () => { throw new Error('Never reached') }, clock: () => NOW }
    change(options); assert.throws(() => createShopifyAdminAdapter(options))
  }
})
test('fixed read resolves exact product, variant, item and location without broad product enumeration', async () => {
  const f = fixture(), result = await f.adapter.readTarget(f.binding)
  assert.equal(result.status, 'observed'); assert.equal(result.observation.level.available, 4)
  assert.deepEqual(f.calls[0].variables, { variantId: IDs.variant, locationId: IDs.location })
  assert.match(f.calls[0].query, /inventoryLevel\(locationId: \$locationId\)/)
  assert.doesNotMatch(f.calls[0].query, /unitCost|price|customers|orders|productSet|products\(/)
  assert.equal(Object.isFrozen(result.observation.level), true)
})
for (const [name, change] of [
  ['wrong shop', p => { p.data.shop.id = gid('Shop', 999) }], ['wrong domain', p => { p.data.shop.myshopifyDomain = 'another.myshopify.com' }],
  ['wrong parent product', p => { p.data.productVariant.product.id = gid('Product', 999) }], ['wrong handle', p => { p.data.productVariant.product.handle = 'other' }],
  ['wrong variant', p => { p.data.productVariant.id = gid('ProductVariant', 999) }], ['wrong inventory item', p => { p.data.productVariant.inventoryItem.id = gid('InventoryItem', 999) }],
  ['wrong location', p => { p.data.productVariant.inventoryItem.inventoryLevel.location.id = gid('Location', 999) }], ['wrong level item', p => { p.data.productVariant.inventoryItem.inventoryLevel.item.id = gid('InventoryItem', 999) }],
  ['wrong variant SKU', p => { p.data.productVariant.sku = 'wrong' }], ['wrong item SKU', p => { p.data.productVariant.inventoryItem.sku = null }],
]) test(`read refuses ${name}`, async () => {
  const f = fixture({ read: body => { change(body); return response(body) } }); held(await f.adapter.readTarget(f.binding), 'IDENTITY_MISMATCH')
})
for (const [name, change] of [
  ['missing quantity', p => { delete p.data.productVariant.inventoryItem.inventoryLevel.quantities[0].quantity }], ['null quantity', p => { p.data.productVariant.inventoryItem.inventoryLevel.quantities[0].quantity = null }],
  ['string quantity', p => { p.data.productVariant.inventoryItem.inventoryLevel.quantities[0].quantity = '4' }], ['fractional quantity', p => { p.data.productVariant.inventoryItem.inventoryLevel.quantities[0].quantity = 1.5 }],
  ['GraphQL integer overflow', p => { p.data.productVariant.inventoryItem.inventoryLevel.quantities[0].quantity = 2147483648 }],
  ['missing level field', p => { delete p.data.productVariant.inventoryItem.inventoryLevel }], ['wrong quantity name', p => { p.data.productVariant.inventoryItem.inventoryLevel.quantities[0].name = 'on_hand' }],
  ['duplicate quantity', p => { p.data.productVariant.inventoryItem.inventoryLevel.quantities.push({ name: 'available', quantity: 4 }) }], ['missing tracking', p => { delete p.data.productVariant.inventoryItem.tracked }],
  ['missing pagination', p => { delete p.data.productVariant.inventoryItem.variants.pageInfo.hasNextPage }],
]) test(`incomplete read rejects ${name}`, async () => {
  const f = fixture({ read: body => { change(body); return response(body) } }); held(await f.adapter.readTarget(f.binding), 'MALFORMED_RESPONSE')
})
test('not-found variant and absent inventory level never invent zero stock', async () => {
  let f = fixture({ read: body => { body.data.productVariant = null; return response(body) } }); held(await f.adapter.readTarget(f.binding), 'NOT_FOUND')
  f = fixture({ read: body => { body.data.productVariant.inventoryItem.inventoryLevel = null; return response(body) } })
  const result = await f.adapter.readTarget(f.binding); assert.equal(result.observation.level, null)
  held(await f.prepare(), 'INVENTORY_NOT_READY')
})
for (const [name, factory, code] of [
  ['top-level GraphQL errors despite data', body => response({ ...body, errors: [{ message: TOKEN }] }), 'GRAPHQL_ERRORS'],
  ['malformed error field', body => response({ ...body, errors: null }), 'GRAPHQL_ERRORS'],
  ['incremental envelope', body => response({ ...body, hasNext: true }), 'MALFORMED_RESPONSE'],
  ['truncated JSON', () => response('{"data":'), 'MALFORMED_RESPONSE'], ['HTML error page', () => response('<html>error</html>', { contentType: 'text/html' }), 'MALFORMED_RESPONSE'],
  ['wrong API fallback', body => response(body, { version: '2026-10' }), 'API_VERSION_MISMATCH'], ['absent API header', body => response(body, { version: '' }), 'API_VERSION_MISMATCH'],
  ['HTTP 429', body => response(body, { status: 429 }), 'HTTP_STATUS'], ['HTTP 503', body => response(body, { status: 503 }), 'HTTP_STATUS'],
  ['redirect', body => response(body, { status: 302, headers: { location: 'https://example.invalid' } }), 'REDIRECT_BLOCKED'],
  ['oversized JSON', () => response(JSON.stringify({ data: 'x'.repeat(1_048_577) })), 'RESPONSE_TOO_LARGE'],
  ['network error', () => { throw new Error(`Do not expose ${TOKEN}`) }, 'NETWORK_FAILURE'],
]) test(`transport fails closed on ${name}`, async () => {
  const f = fixture({ read: factory }); const result = await f.adapter.readTarget(f.binding); held(result, code)
  assert.equal(JSON.stringify(result).includes(TOKEN), false); assert.equal(f.calls.length, 1)
})
test('read-only default constructs current CAS/idempotency request but cannot dispatch it', async () => {
  const f = fixture(), result = await f.prepare(); assert.equal(result.status, 'prepared')
  const { plan } = result, input = plan.request.variables.input
  assert.match(plan.request.query, /@idempotent\(key: \$idempotencyKey\)/)
  assert.deepEqual(input.quantities, [{ inventoryItemId: IDs.item, locationId: IDs.location, quantity: 7, changeFromQuantity: 4 }])
  assert.equal(plan.request.variables.idempotencyKey, OP1); assert.equal(input.name, 'available')
  assert.doesNotMatch(JSON.stringify(plan.request), /compareQuantity|ignoreCompareQuantity|productSet|inventoryAdjustQuantities/)
  assert.match(plan.requestHash, /^[a-f0-9]{64}$/); assert.equal(JSON.stringify(plan).includes(TOKEN), false)
  held(await f.adapter.executeChange(plan), 'MUTATIONS_DISABLED'); assert.equal(f.calls.length, 1)
})
test('zero is known stock, negatives are preserved only as CAS observations and no-op emits no request', async () => {
  const f = fixture(); f.setQuantity(-3); let result = await f.prepare()
  assert.equal(result.plan.expectedAvailable, -3); assert.equal(result.plan.request.variables.input.quantities[0].changeFromQuantity, -3)
  f.stock.availableToSell = 0; result = await f.prepare({ operationId: OP2 }); assert.equal(result.plan.desiredAvailable, 0)
  const zero = fixture(); zero.setQuantity(0); zero.stock.availableToSell = 0
  assert.deepEqual(await zero.prepare(), { status: 'no_change' }); assert.equal(zero.calls.length, 1)
})
for (const [name, change, code] of [
  ['unapproved mapping', f => { f.mapping.review.approved = false }, 'REVIEW_REQUIRED'], ['old mapping version', f => { f.mapping.review.expectedVersion = 'mapping-new' }, 'REVIEW_REQUIRED'],
  ['unapproved binding', f => { f.binding.review.approved = false }, 'REVIEW_REQUIRED'], ['wrong mapping parent', f => { f.mapping.shopifyProductId = '999' }, 'IDENTITY_MISMATCH'],
  ['wrong mapping variant', f => { f.mapping.shopifyVariantId = '999' }, 'IDENTITY_MISMATCH'], ['wrong mapping handle', f => { f.mapping.shopifyProductHandle = 'another' }, 'IDENTITY_MISMATCH'],
  ['binding mapping version', f => { f.binding.mappingVersion = 'mapping-other' }, 'IDENTITY_MISMATCH'], ['name-only mapping', f => { f.mapping.source = 'name_match' }, 'REVIEW_REQUIRED'],
  ['different flavour', f => { f.mapping.supplierIdentity.flavourId = 'chocolate' }, 'IDENTITY_MISMATCH'], ['different pack amount', f => { f.mapping.supplierIdentity.pack.amountPerInner = 1000 }, 'IDENTITY_MISMATCH'],
  ['missing identity', f => { delete f.mapping.supplierIdentity.flavourId }, 'INVALID_INPUT'], ['fractional counted pack', f => { for (const id of [f.mapping.shopIdentity, f.mapping.supplierIdentity]) { id.pack.unit = 'capsule'; id.pack.amountPerInner = 1.5 } }, 'INVALID_INPUT'],
  ['raw supplier stock', f => { f.stock.basis = 'supplier_raw' }, 'STOCK_NOT_RECONCILED'], ['stock SKU mismatch', f => { f.stock.supplierSku = 'OTHER-SKU' }, 'IDENTITY_MISMATCH'],
  ['stock variant mismatch', f => { f.stock.shopifyVariantId = '999' }, 'IDENTITY_MISMATCH'], ['pack version mismatch', f => { f.stock.packVersion = 'other' }, 'IDENTITY_MISMATCH'],
  ['stale supplier observation', f => { f.stock.observedAtMs = NOW - 60000 }, 'STALE_OBSERVATION'], ['future observation', f => { f.stock.observedAtMs = NOW + 1 }, 'STALE_OBSERVATION'],
  ['missing stock', f => { f.stock.availableToSell = null }, 'CHANGE_LIMIT'], ['negative desired stock', f => { f.stock.availableToSell = -1 }, 'CHANGE_LIMIT'],
  ['fractional stock', f => { f.stock.availableToSell = 2.5 }, 'CHANGE_LIMIT'], ['excessive change', f => { f.stock.availableToSell = 200 }, 'CHANGE_LIMIT'],
]) test(`planning holds ${name}`, async () => {
  const f = fixture(), read = await f.adapter.readTarget(f.binding); change(f)
  held(f.adapter.prepareChange({ binding: f.binding, mapping: f.mapping, stock: f.stock, observation: read.observation, operationId: OP1 }), code)
})
for (const [name, change] of [
  ['draft product', p => { p.data.productVariant.product.status = 'DRAFT' }], ['backorders', p => { p.data.productVariant.inventoryPolicy = 'CONTINUE' }],
  ['unlisted product', p => { p.data.productVariant.product.status = 'UNLISTED' }],
  ['bundle', p => { p.data.productVariant.requiresComponents = true }], ['untracked stock', p => { p.data.productVariant.inventoryItem.tracked = false }],
  ['inactive inventory level', p => { p.data.productVariant.inventoryItem.inventoryLevel.isActive = false }], ['inactive location', p => { p.data.productVariant.inventoryItem.inventoryLevel.location.isActive = false }],
  ['shared inventory item', p => { p.data.productVariant.inventoryItem.variants.nodes.push({ id: gid('ProductVariant', 999) }) }],
  ['truncated linked variants', p => { p.data.productVariant.inventoryItem.variants.nodes.push({ id: gid('ProductVariant', 999) }); p.data.productVariant.inventoryItem.variants.pageInfo.hasNextPage = true }],
]) test(`planning holds ${name}`, async () => {
  const f = fixture({ read: p => { change(p); return response(p) } }); held(await f.prepare(), 'INVENTORY_NOT_READY')
})
test('source-of-truth permission, not commercial pricing or research scores, gates stock writes', async () => {
  const f = fixture({ policy: p => { p.sourceOfTruth = 'unknown' } }); held(await f.prepare(), 'STOCK_NOT_RECONCILED')
  const good = fixture(), result = await good.prepare(); assert.equal(result.status, 'prepared')
  assert.equal('price' in result.plan, false); assert.equal('score' in result.plan, false)
})
test('forged/copied observations and changed bindings are not execution evidence', async () => {
  const f = fixture(), observed = await f.adapter.readTarget(f.binding)
  held(f.adapter.prepareChange({ ...f, observation: clone(observed.observation), operationId: OP1 }), 'FOREIGN_OBSERVATION')
  const second = fixture(); held(second.adapter.prepareChange({ ...f, observation: observed.observation, operationId: OP1 }), 'FOREIGN_OBSERVATION')
  f.binding.review.version = 'binding-2'; f.binding.review.expectedVersion = 'binding-2'
  held(f.adapter.prepareChange({ ...f, observation: observed.observation, operationId: OP1 }), 'IDENTITY_MISMATCH')
})
test('review/receipt time cannot extend stock or read freshness and frozen plans cannot be tampered', async () => {
  const f = fixture({ enabled: true }), { plan } = await f.prepare()
  assert.throws(() => { plan.request.variables.input.quantities[0].changeFromQuantity = null })
  held(await f.adapter.executeChange(clone(plan)), 'FOREIGN_PLAN')
  f.tick(10000); held(await f.adapter.executeChange(plan), 'EXPIRED'); assert.equal(f.calls.length, 1)
})
test('only complete acknowledgement plus a new exact read can report reconciled', async () => {
  const f = fixture({ enabled: true }), { plan } = await f.prepare()
  held(await f.adapter.reconcileChange(plan), 'NOT_ATTEMPTED')
  const sent = await f.adapter.executeChange(plan); assert.equal(sent.status, 'acknowledged'); assert.equal(sent.reconciliationRequired, true)
  held(await f.adapter.executeChange(plan), 'RECONCILIATION_REQUIRED')
  const result = await f.adapter.reconcileChange(plan); assert.equal(result.status, 'reconciled'); assert.equal(result.retryAllowed, false)
  assert.equal(f.calls.length, 3); held(await f.adapter.executeChange(plan), 'ALREADY_ATTEMPTED')
  const observed = await f.adapter.readTarget(f.binding); f.stock.availableToSell = 8
  held(f.adapter.prepareChange({ ...f, observation: observed.observation, operationId: OP1 }), 'OPERATION_ID_REUSED')
  assert.equal(f.adapter.prepareChange({ ...f, observation: observed.observation, operationId: OP2 }).status, 'prepared')
})
for (const [name, mutate, code] of [
  ['network outcome', () => { throw new Error(TOKEN) }, 'NETWORK_FAILURE'],
  ['top-level errors', p => response({ ...p, errors: [{ message: TOKEN }] }), 'GRAPHQL_ERRORS'],
  ['business user errors', p => { p.data.inventorySetQuantities.userErrors = [{ code: 'IDEMPOTENCY_CONCURRENT_REQUEST', message: TOKEN }]; return response(p) }, 'USER_ERRORS'],
  ['missing userErrors', p => { delete p.data.inventorySetQuantities.userErrors; return response(p) }, 'MALFORMED_RESPONSE'],
  ['null adjustment', p => { p.data.inventorySetQuantities.inventoryAdjustmentGroup = null; return response(p) }, 'MALFORMED_RESPONSE'],
  ['wrong adjustment item', p => { p.data.inventorySetQuantities.inventoryAdjustmentGroup.changes[0].item.id = gid('InventoryItem', 999); return response(p) }, 'IDENTITY_MISMATCH'],
  ['wrong adjustment location', p => { p.data.inventorySetQuantities.inventoryAdjustmentGroup.changes[0].location.id = gid('Location', 999); return response(p) }, 'IDENTITY_MISMATCH'],
  ['wrong resulting quantity', p => { p.data.inventorySetQuantities.inventoryAdjustmentGroup.changes[0].quantityAfterChange = null; return response(p) }, 'IDENTITY_MISMATCH'],
  ['wrong delta', p => { p.data.inventorySetQuantities.inventoryAdjustmentGroup.changes[0].delta = 99; return response(p) }, 'IDENTITY_MISMATCH'],
  ['truncated changes', p => { p.data.inventorySetQuantities.inventoryAdjustmentGroup.changes = []; return response(p) }, 'MALFORMED_RESPONSE'],
  ['wrong reference', p => { p.data.inventorySetQuantities.inventoryAdjustmentGroup.referenceDocumentUri = 'gid://other/event/1'; return response(p) }, 'IDENTITY_MISMATCH'],
  ['version fallback', p => response(p, { version: '2026-10' }), 'API_VERSION_MISMATCH'],
  ['redirect on mutation', p => response(p, { status: 307 }), 'REDIRECT_BLOCKED'],
]) test(`mutation ${name} cannot be counted successful or blindly retried`, async () => {
  const f = fixture({ enabled: true, mutation: mutate }), { plan } = await f.prepare()
  const sent = await f.adapter.executeChange(plan); assert.equal(sent.status, 'unknown'); assert.equal(sent.code, code); assert.equal(sent.retryAllowed, false)
  assert.equal(JSON.stringify(sent).includes(TOKEN), false)
  held(await f.adapter.executeChange(plan), 'RECONCILIATION_REQUIRED'); assert.equal(f.calls.length, 2)
  const reconciled = await f.adapter.reconcileChange(plan)
  assert.equal(reconciled.status, 'desired_state_observed_outcome_unknown'); assert.equal(reconciled.operatorReviewRequired, true)
  held(await f.prepare({ operationId: OP2 }), 'RECONCILIATION_REQUIRED')
  assert.equal(f.calls.filter(c => c.operationName === 'TllInventorySet').length, 1)
})
test('CAS mismatch rejects stale expectation and requires a new read/operator decision', async () => {
  const f = fixture({ enabled: true, mutation: p => { p.data.inventorySetQuantities = { inventoryAdjustmentGroup: null, userErrors: [{ code: 'CHANGE_FROM_QUANTITY_STALE', field: ['input', 'quantities', '0'], message: 'synthetic conflict' }] }; return response(p) } })
  const { plan } = await f.prepare(), result = await f.adapter.executeChange(plan)
  assert.equal(result.status, 'rejected'); assert.equal(result.code, 'CAS_CONFLICT'); assert.equal(result.retryAllowed, false)
  f.setQuantity(5); const reread = await f.adapter.reconcileChange(plan); assert.equal(reread.status, 'diverged')
  held(await f.adapter.executeChange(plan), 'RECONCILIATION_REQUIRED')
})
test('concurrent changes after acknowledgement do not count as reconciled', async () => {
  const f = fixture({ enabled: true }), { plan } = await f.prepare(); await f.adapter.executeChange(plan); f.setQuantity(6)
  const result = await f.adapter.reconcileChange(plan); assert.equal(result.status, 'diverged'); assert.equal(result.observedAvailable, 6)
  held(await f.prepare({ operationId: OP2 }), 'RECONCILIATION_REQUIRED')
})
test('in-flight duplicate calls cannot dispatch twice or corrupt the original acknowledgement', async () => {
  let finish
  const f = fixture({ enabled: true, mutation: p => new Promise(resolve => { finish = () => resolve(response(p)) }) }), { plan } = await f.prepare()
  const first = f.adapter.executeChange(plan)
  held(await f.adapter.executeChange(plan), 'RECONCILIATION_REQUIRED')
  held(await f.prepare({ operationId: OP2 }), 'RECONCILIATION_REQUIRED')
  finish(); assert.equal((await first).status, 'acknowledged'); assert.equal((await f.adapter.reconcileChange(plan)).status, 'reconciled')
  assert.equal(f.calls.filter(c => c.operationName === 'TllInventorySet').length, 1)
})
test('two already-prepared plans cannot race a target or reuse a key with changed payload', async () => {
  const f = fixture({ enabled: true }), { plan: first } = await f.prepare()
  const { plan: second } = await f.prepare({ operationId: OP2, stock: { ...f.stock, availableToSell: 8 } })
  await f.adapter.executeChange(first); held(await f.adapter.executeChange(second), 'RECONCILIATION_REQUIRED')
  held(await f.prepare({ operationId: OP1 }), 'RECONCILIATION_REQUIRED')
})
test('concurrent reconciliation cannot clear the barrier for a newer write', async () => {
  let pendingRead, delay = false
  const f = fixture({ enabled: true, read: body => delay ? new Promise(resolve => { pendingRead = () => resolve(response(body)) }) : response(body) })
  const { plan } = await f.prepare(); await f.adapter.executeChange(plan); delay = true
  const first = f.adapter.reconcileChange(plan)
  held(await f.adapter.reconcileChange(plan), 'RECONCILIATION_REQUIRED')
  delay = false; pendingRead(); assert.equal((await first).status, 'reconciled')
  f.stock.availableToSell = 8
  const { plan: next } = await f.prepare({ operationId: OP2 }); await f.adapter.executeChange(next)
  held(await f.adapter.reconcileChange(plan), 'RECONCILIATION_REQUIRED')
  assert.equal((await f.adapter.reconcileChange(next)).status, 'reconciled')
})
test('a failed reconciliation read preserves the hold until a valid new read succeeds', async () => {
  let broken = false
  const f = fixture({ enabled: true, read: body => broken ? response('{"data":') : response(body) })
  const { plan } = await f.prepare(); await f.adapter.executeChange(plan); broken = true
  held(await f.adapter.reconcileChange(plan), 'MALFORMED_RESPONSE')
  held(await f.adapter.executeChange(plan), 'RECONCILIATION_REQUIRED')
  broken = false; assert.equal((await f.adapter.reconcileChange(plan)).status, 'reconciled')
  assert.equal(f.calls.filter(call => call.operationName === 'TllInventorySet').length, 1)
})
test('slow read completion cannot refresh the observation timestamp', async () => {
  let finish
  const f = fixture({ read: body => new Promise(resolve => { finish = () => resolve(response(body)) }) })
  const pending = f.adapter.readTarget(f.binding); f.tick(10000); finish()
  held(await pending, 'STALE_OBSERVATION')
})
