import { createShopifyAdminAdapter } from '../../lib/commerce/shopify-admin.ts'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export async function fixture({ operationId = '71000000-0000-4000-8000-000000000001', target = 1, desired = 7, now = Date.now(), mutationFailure = false } = {}) {
  const domain = 'synthetic-inventory-ledger.myshopify.com', calls = []
  const id = (kind, suffix) => `gid://shopify/${kind}/${target}${suffix}`
  const ids = { shop: 'gid://shopify/Shop/1', product: id('Product', '1'), variant: id('ProductVariant', '2'), item: id('InventoryItem', '3'), location: 'gid://shopify/Location/1' }
  const review = version => ({ approved: true, version, expectedVersion: version, verifiedAtMs: now - 1000, expiresAtMs: now + 3600000 })
  const identity = { formulaId: 'synthetic-formula', formulaVersion: 'formula-1', flavourId: 'plain', labelVersion: 'label-1', pack: { version: 'pack-1', sellingUnit: 'single', innerCount: 1, amountPerInner: 500, unit: 'g' } }
  const policy = { review: review('policy-1'), shopDomain: domain, shopId: ids.shop, locationId: ids.location, sourceOfTruth: 'reconciled_supplier_stock', maxReadAgeMs: 3600000, maxStockAgeMs: 3600000, maxAvailableQuantity: 1000, maxAbsoluteChange: 100 }
  const binding = { review: review('binding-1'), shopDomain: domain, shopId: ids.shop, mappingVersion: 'mapping-1', shopifyProductId: ids.product, shopifyProductHandle: `synthetic-item-${target}`, shopifyVariantId: ids.variant, inventoryItemId: ids.item, locationId: ids.location, shopifySku: `SHOP-${target}` }
  const mapping = { review: review('mapping-1'), productId: `synthetic-${target}`, shopifyProductId: ids.product, shopifyProductHandle: binding.shopifyProductHandle, shopifyVariantId: ids.variant, supplierSku: `SUPPLIER-${target}`, status: 'exact', source: 'verified_labels', shopIdentity: structuredClone(identity), supplierIdentity: structuredClone(identity) }
  const stock = { review: review('stock-1'), observedAtMs: now - 500, shopifyVariantId: ids.variant, supplierSku: mapping.supplierSku, packVersion: 'pack-1', basis: 'reconciled_sellable_units', availableToSell: desired }
  let quantity = 4
  const adapter = createShopifyAdminAdapter({ policy, accessToken: 'synthetic-never-valid-shopify-token', mutationsEnabled: true, clock: () => Date.now(), transport: async (url, options) => {
    if (url !== `https://${domain}/admin/api/2026-07/graphql.json` || options.redirect !== 'manual') throw new Error('Unexpected synthetic target')
    const request = JSON.parse(options.body); calls.push(request.operationName)
    let data
    if (request.operationName === 'TllInventoryTarget') data = { shop: { id: ids.shop, myshopifyDomain: domain }, productVariant: { id: ids.variant, sku: binding.shopifySku, inventoryPolicy: 'DENY', requiresComponents: false,
      product: { id: ids.product, handle: binding.shopifyProductHandle, status: 'ACTIVE' }, inventoryItem: { id: ids.item, sku: binding.shopifySku, tracked: true,
        variants: { nodes: [{ id: ids.variant }], pageInfo: { hasNextPage: false } }, inventoryLevel: { isActive: true, item: { id: ids.item }, location: { id: ids.location, isActive: true }, quantities: [{ name: 'available', quantity }] } } } }
    else if (request.operationName === 'TllInventorySet') {
      const q = request.variables.input.quantities[0]; quantity = q.quantity
      if (mutationFailure) throw new Error('Synthetic lost response')
      data = { inventorySetQuantities: { userErrors: [], inventoryAdjustmentGroup: { id: 'gid://shopify/InventoryAdjustmentGroup/1', referenceDocumentUri: request.variables.input.referenceDocumentUri,
        changes: [{ name: 'available', delta: q.quantity - q.changeFromQuantity, quantityAfterChange: q.quantity, item: { id: ids.item }, location: { id: ids.location } }] } } }
    } else throw new Error('Unexpected synthetic operation')
    return new Response(JSON.stringify({ data }), { headers: { 'content-type': 'application/json', 'x-shopify-api-version': '2026-07' } })
  } })
  const observed = await adapter.readTarget(binding)
  if (observed.status !== 'observed') throw new Error('Synthetic read failed')
  const prepared = adapter.prepareChange({ binding, mapping, stock, observation: observed.observation, operationId })
  if (prepared.status !== 'prepared') throw new Error('Synthetic preparation failed')
  const described = adapter.describePreparedPlan(prepared.plan)
  if (described.status !== 'manifest') throw new Error('Synthetic manifest failed')
  return { adapter, plan: prepared.plan, manifest: described.manifest, observation: observed.observation, binding, calls, setQuantity: value => { quantity = value } }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const options = process.argv[2] ? JSON.parse(process.argv[2]) : {}
  const f = await fixture(options)
  process.stdout.write(JSON.stringify({ manifest: f.manifest, observation: f.observation }) + '\n')
}
