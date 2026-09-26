import { createHash } from 'node:crypto'
import type { CatalogueReview, ExactMapping, FormulaIdentity, StockProjection } from './catalogue-eligibility'

/** Server-side adapter only. No environment reads, implicit fetch, routes or scheduler. */
export const SHOPIFY_ADMIN_API_VERSION = '2026-07'
export const SHOPIFY_MUTATIONS_ENABLED_BY_DEFAULT = false
const INT_MAX = 2_147_483_647
const RESPONSE_BYTES = 1_048_576
type RecordValue = Record<string, unknown>
export type ShopifyAdapterCode = 'INVALID_INPUT' | 'REVIEW_REQUIRED' | 'EXPIRED' | 'IDENTITY_MISMATCH' |
  'NETWORK_FAILURE' | 'HTTP_STATUS' | 'REDIRECT_BLOCKED' | 'API_VERSION_MISMATCH' | 'MALFORMED_RESPONSE' |
  'RESPONSE_TOO_LARGE' | 'GRAPHQL_ERRORS' | 'USER_ERRORS' | 'CAS_CONFLICT' | 'NOT_FOUND' |
  'INVENTORY_NOT_READY' | 'STOCK_NOT_RECONCILED' | 'STALE_OBSERVATION' | 'CHANGE_LIMIT' |
  'MUTATIONS_DISABLED' | 'FOREIGN_OBSERVATION' | 'FOREIGN_PLAN' | 'OPERATION_ID_REUSED' |
  'ALREADY_ATTEMPTED' | 'RECONCILIATION_REQUIRED' | 'NOT_ATTEMPTED'
type Hold = { status: 'hold'; code: ShopifyAdapterCode; retryAllowed: false }
export type ShopifyInventoryPolicy = {
  review: CatalogueReview
  /** Trusted deployment configuration. Never populated from an HTTP request or feed. */
  shopDomain: string
  shopId: string
  locationId: string
  sourceOfTruth: 'reconciled_supplier_stock' | 'unknown'
  maxReadAgeMs: number
  maxStockAgeMs: number
  maxAvailableQuantity: number
  maxAbsoluteChange: number
}
export type ShopifyInventoryBinding = Pick<ExactMapping, 'shopifyProductId' | 'shopifyProductHandle' | 'shopifyVariantId'> & {
  review: CatalogueReview
  shopDomain: string
  shopId: string
  mappingVersion: string
  inventoryItemId: string
  locationId: string
  /** Shopify SKU need not equal the separately verified supplier SKU. */
  shopifySku: string
}
export type ShopifyInventoryObservation = {
  apiVersion: typeof SHOPIFY_ADMIN_API_VERSION
  bindingHash: string
  observedAtMs: number
  productStatus: 'ACTIVE' | 'DRAFT' | 'ARCHIVED' | 'UNLISTED'
  inventoryPolicy: 'DENY' | 'CONTINUE'
  requiresComponents: boolean
  tracked: boolean
  linkedVariantIds: string[]
  linkedVariantsTruncated: boolean
  /** An absent inventory level is unknown, never an inferred zero. */
  level: null | { active: boolean; locationActive: boolean; available: number }
}
export type ShopifyInventoryPlan = {
  apiVersion: typeof SHOPIFY_ADMIN_API_VERSION
  operationId: string
  requestHash: string
  createdAtMs: number
  expiresAtMs: number
  bindingHash: string
  mappingVersion: string
  stockVersion: string
  expectedAvailable: number
  desiredAvailable: number
  /** Reviewable request without credentials. Execution accepts only an issued plan. */
  request: { operationName: string; query: string; variables: RecordValue }
}
export type ShopifyPreparedManifest = {
  schemaVersion: 'tll-inventory-operation/v1'
  endpoint: string
  requestDocument: string
  plan: ShopifyInventoryPlan
  binding: ShopifyInventoryBinding
  provenance: {
    policyReview: CatalogueReview
    mappingReview: CatalogueReview
    stockReview: CatalogueReview
    mappingProductId: string
    supplierSku: string
    formulaIdentity: unknown[]
    stockPackVersion: string
    stockBasis: 'reconciled_sellable_units'
    stockObservedAtMs: number
    readObservedAtMs: number
  }
}
export type ShopifyMutationResult = Hold | {
  status: 'acknowledged' | 'unknown' | 'rejected'
  code: ShopifyAdapterCode | null
  operationId: string
  requestHash: string
  adjustmentGroupId: string | null
  reconciliationRequired: true
  retryAllowed: false
}
export type ShopifyReconciliationResult = Hold | {
  status: 'reconciled' | 'desired_state_observed_outcome_unknown' | 'diverged'
  operationId: string
  observedAvailable: number | null
  retryAllowed: false
  operatorReviewRequired: boolean
}
type PlanState = { binding: ShopifyInventoryBinding; plan: ShopifyInventoryPlan; manifest: ShopifyPreparedManifest; phase: 'prepared' | 'sent' | 'acknowledged' | 'unknown' | 'rejected' | 'reconciled'; startedAtMs: number | null; reconciling: boolean }
type Transport = (url: string, init: RequestInit) => Promise<Response>

const READ_QUERY = `query TllInventoryTarget($variantId: ID!, $locationId: ID!) {
  shop { id myshopifyDomain }
  productVariant(id: $variantId) {
    id sku inventoryPolicy requiresComponents
    product { id handle status }
    inventoryItem {
      id sku tracked
      variants(first: 2) { nodes { id } pageInfo { hasNextPage } }
      inventoryLevel(locationId: $locationId) {
        isActive item { id } location { id isActive }
        quantities(names: ["available"]) { name quantity }
      }
    }
  }
}`
const SET_QUERY = `mutation TllInventorySet($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
  inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
    inventoryAdjustmentGroup {
      id referenceDocumentUri
      changes(quantityNames: ["available"]) { name delta quantityAfterChange item { id } location { id } }
    }
    userErrors { code field message }
  }
}`

class AdapterFailure extends Error {
  code: ShopifyAdapterCode
  constructor(code: ShopifyAdapterCode) { super(code); this.code = code }
}
function requireValue(value: unknown, code: ShopifyAdapterCode = 'INVALID_INPUT'): asserts value { if (!value) throw new AdapterFailure(code) }
function object(value: unknown, code: ShopifyAdapterCode = 'INVALID_INPUT'): RecordValue {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), code)
  return value as RecordValue
}
function text(value: unknown, max = 256): value is string { return typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value && !/[\x00-\x1f\x7f]/.test(value) }
function integer(value: unknown, min = 0, max = INT_MAX): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max }
function gid(value: unknown, type: string): string {
  requireValue(typeof value === 'string' && new RegExp(`^(?:gid://shopify/${type}/)?[1-9][0-9]{0,19}$`).test(value))
  return value.startsWith('gid:') ? value : `gid://shopify/${type}/${value}`
}
const same = (a: unknown, b: unknown, code: ShopifyAdapterCode = 'IDENTITY_MISMATCH') => requireValue(a === b, code)
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { for (const nested of Object.values(value)) freeze(nested); Object.freeze(value) }
  return value
}
const hold = (error: unknown): Hold => ({ status: 'hold', code: error instanceof AdapterFailure ? error.code : 'INVALID_INPUT', retryAllowed: false })
const copyReview = (value: CatalogueReview): CatalogueReview => ({ approved: value.approved, version: value.version, expectedVersion: value.expectedVersion, verifiedAtMs: value.verifiedAtMs, expiresAtMs: value.expiresAtMs })
function review(value: CatalogueReview, now: number): void {
  requireValue(integer(now, 0, Number.MAX_SAFE_INTEGER))
  requireValue(value?.approved === true && text(value.version) && value.version === value.expectedVersion, 'REVIEW_REQUIRED')
  requireValue(integer(value.verifiedAtMs, 0, Number.MAX_SAFE_INTEGER) && integer(value.expiresAtMs, 1, Number.MAX_SAFE_INTEGER) && value.verifiedAtMs <= now && value.expiresAtMs > now && value.expiresAtMs > value.verifiedAtMs, 'EXPIRED')
}
export function shopifyGraphqlEndpoint(shopDomain: string): string {
  // Exactly one Shopify-controlled DNS label. No custom hosts, ports, schemes,
  // credentials, path, encoded delimiters, localhost, suffix lookalikes or redirects.
  requireValue(typeof shopDomain === 'string' && /^(?:[a-z0-9]|[a-z0-9][a-z0-9-]{0,61}[a-z0-9])\.myshopify\.com$/.test(shopDomain))
  return `https://${shopDomain}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`
}
function policyValid(policy: ShopifyInventoryPolicy, now: number): void {
  review(policy?.review, now); shopifyGraphqlEndpoint(policy.shopDomain)
  gid(policy.shopId, 'Shop'); gid(policy.locationId, 'Location')
  requireValue(['reconciled_supplier_stock', 'unknown'].includes(policy.sourceOfTruth))
  requireValue(integer(policy.maxReadAgeMs, 1, 3_600_000) && integer(policy.maxStockAgeMs, 1, 86_400_000))
  requireValue(integer(policy.maxAvailableQuantity, 0) && integer(policy.maxAbsoluteChange, 1))
}
function bindingValid(binding: ShopifyInventoryBinding, policy: ShopifyInventoryPolicy, now: number): ShopifyInventoryBinding {
  review(binding?.review, now)
  same(binding.shopDomain, policy.shopDomain); same(gid(binding.shopId, 'Shop'), gid(policy.shopId, 'Shop'))
  same(gid(binding.locationId, 'Location'), gid(policy.locationId, 'Location'))
  requireValue(text(binding.mappingVersion) && text(binding.shopifySku) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(binding.shopifyProductHandle))
  return { review: copyReview(binding.review), shopDomain: binding.shopDomain, shopId: gid(binding.shopId, 'Shop'), mappingVersion: binding.mappingVersion,
    shopifyProductId: gid(binding.shopifyProductId, 'Product'), shopifyProductHandle: binding.shopifyProductHandle,
    shopifyVariantId: gid(binding.shopifyVariantId, 'ProductVariant'), inventoryItemId: gid(binding.inventoryItemId, 'InventoryItem'),
    locationId: gid(binding.locationId, 'Location'), shopifySku: binding.shopifySku }
}
function identity(value: FormulaIdentity): unknown[] {
  requireValue(value && ['formulaId', 'formulaVersion', 'flavourId', 'labelVersion'].every(key => text(value[key as keyof FormulaIdentity])))
  const pack = value.pack
  requireValue(pack && text(pack.version) && ['single', 'multipack', 'case'].includes(pack.sellingUnit) && integer(pack.innerCount, 1, 10000))
  requireValue(typeof pack.amountPerInner === 'number' && Number.isFinite(pack.amountPerInner) && pack.amountPerInner > 0 && pack.amountPerInner <= 1_000_000_000)
  requireValue(['g', 'ml', 'tablet', 'capsule', 'bar', 'bottle', 'sachet'].includes(pack.unit))
  if (pack.sellingUnit === 'single') same(pack.innerCount, 1)
  if (!['g', 'ml'].includes(pack.unit)) requireValue(integer(pack.amountPerInner, 1))
  return [value.formulaId, value.formulaVersion, value.flavourId, value.labelVersion, pack.version, pack.sellingUnit, pack.innerCount, pack.amountPerInner, pack.unit]
}
function readReady(observation: ShopifyInventoryObservation, binding: ShopifyInventoryBinding): boolean {
  return observation.productStatus === 'ACTIVE' && observation.inventoryPolicy === 'DENY' && !observation.requiresComponents && observation.tracked &&
    observation.level?.active === true && observation.level.locationActive && !observation.linkedVariantsTruncated &&
    observation.linkedVariantIds.length === 1 && observation.linkedVariantIds[0] === binding.shopifyVariantId
}
function fresh(observed: number, now: number, maxAge: number): void {
  requireValue(integer(observed, 0, Number.MAX_SAFE_INTEGER) && observed <= now && now - observed < maxAge, 'STALE_OBSERVATION')
}

/** Only fixed operations are executable. This is not a general GraphQL proxy. */
export function createShopifyAdminAdapter(options: {
  policy: ShopifyInventoryPolicy
  accessToken: string
  transport: Transport
  clock?: () => number
  timeoutMs?: number
  mutationsEnabled?: boolean
}) {
  const clock = options.clock ?? Date.now
  requireValue(typeof clock === 'function' && typeof options.transport === 'function')
  const policy = freeze(structuredClone(options.policy)), endpoint = shopifyGraphqlEndpoint(policy.shopDomain)
  policyValid(policy, clock())
  requireValue(text(options.accessToken, 4096) && /^[\x21-\x7e]{16,4096}$/.test(options.accessToken))
  requireValue(options.mutationsEnabled === undefined || typeof options.mutationsEnabled === 'boolean')
  const token = options.accessToken, transport = options.transport, mutationsEnabled = options.mutationsEnabled ?? SHOPIFY_MUTATIONS_ENABLED_BY_DEFAULT
  const timeoutMs = options.timeoutMs ?? 10_000
  requireValue(integer(timeoutMs, 1, 30_000))
  const observations = new WeakSet<ShopifyInventoryObservation>(), plans = new WeakMap<ShopifyInventoryPlan, PlanState>()
  const operationIds = new Set<string>(), pendingTargets = new Map<string, string>()
  const targetKey = (binding: ShopifyInventoryBinding) => `${binding.inventoryItemId}:${binding.locationId}`

  async function request(body: { operationName: string; query: string; variables: RecordValue }): Promise<RecordValue> {
    let response: Response
    try {
      response = await transport(endpoint, { method: 'POST', redirect: 'manual', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs),
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Shopify-Access-Token': token }, body: JSON.stringify(body) })
    } catch { throw new AdapterFailure('NETWORK_FAILURE') }
    requireValue(response instanceof Response, 'MALFORMED_RESPONSE')
    try {
      requireValue(!response.redirected && (!response.url || response.url === endpoint) && !(response.status >= 300 && response.status < 400), 'REDIRECT_BLOCKED')
      requireValue(response.headers.get('x-shopify-api-version') === SHOPIFY_ADMIN_API_VERSION, 'API_VERSION_MISMATCH')
      requireValue(response.status === 200, 'HTTP_STATUS')
      requireValue(/^application\/json(?:\s*;.*)?$/i.test(response.headers.get('content-type') ?? ''), 'MALFORMED_RESPONSE')
    } catch (error) { await response.body?.cancel().catch(() => {}); throw error }
    const reader = response.body?.getReader(); requireValue(reader, 'MALFORMED_RESPONSE')
    const chunks: Uint8Array[] = []; let bytes = 0
    try {
      while (true) {
        const next = await reader.read(); if (next.done) break
        bytes += next.value.byteLength
        if (bytes > RESPONSE_BYTES) { await reader.cancel(); throw new AdapterFailure('RESPONSE_TOO_LARGE') }
        chunks.push(next.value)
      }
    } catch (error) { throw error instanceof AdapterFailure ? error : new AdapterFailure('NETWORK_FAILURE') }
    let decoded: unknown
    try { decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) }
    catch { throw new AdapterFailure('MALFORMED_RESPONSE') }
    const envelope = object(decoded, 'MALFORMED_RESPONSE')
    // GraphQL can return HTTP 200 and partial data alongside errors. Neither
    // top-level errors nor a truncated/incremental envelope establishes success.
    if ('errors' in envelope) requireValue(Array.isArray(envelope.errors) && envelope.errors.length === 0, 'GRAPHQL_ERRORS')
    requireValue(!('hasNext' in envelope) && !('incremental' in envelope), 'MALFORMED_RESPONSE')
    return object(envelope.data, 'MALFORMED_RESPONSE')
  }

  async function readTarget(input: ShopifyInventoryBinding): Promise<Hold | { status: 'observed'; observation: ShopifyInventoryObservation }> {
    try {
      const started = clock(); policyValid(policy, started)
      const binding = bindingValid(input, policy, started)
      const data = await request({ operationName: 'TllInventoryTarget', query: READ_QUERY, variables: { variantId: binding.shopifyVariantId, locationId: binding.locationId } })
      const shop = object(data.shop, 'MALFORMED_RESPONSE')
      same(shop.id, binding.shopId); same(shop.myshopifyDomain, binding.shopDomain)
      requireValue(data.productVariant !== null, 'NOT_FOUND')
      const variant = object(data.productVariant, 'MALFORMED_RESPONSE'), product = object(variant.product, 'MALFORMED_RESPONSE'), item = object(variant.inventoryItem, 'MALFORMED_RESPONSE')
      same(variant.id, binding.shopifyVariantId); same(variant.sku, binding.shopifySku); same(product.id, binding.shopifyProductId); same(product.handle, binding.shopifyProductHandle)
      same(item.id, binding.inventoryItemId); same(item.sku, binding.shopifySku)
      requireValue(['ACTIVE', 'DRAFT', 'ARCHIVED', 'UNLISTED'].includes(String(product.status)) && ['DENY', 'CONTINUE'].includes(String(variant.inventoryPolicy)), 'MALFORMED_RESPONSE')
      requireValue(typeof item.tracked === 'boolean' && typeof variant.requiresComponents === 'boolean', 'MALFORMED_RESPONSE')
      const links = object(item.variants, 'MALFORMED_RESPONSE'), page = object(links.pageInfo, 'MALFORMED_RESPONSE')
      requireValue(Array.isArray(links.nodes) && links.nodes.length <= 2 && typeof page.hasNextPage === 'boolean', 'MALFORMED_RESPONSE')
      const linkedVariantIds = links.nodes.map(node => gid(object(node, 'MALFORMED_RESPONSE').id, 'ProductVariant'))
      requireValue(new Set(linkedVariantIds).size === linkedVariantIds.length && (!page.hasNextPage || linkedVariantIds.length === 2), 'MALFORMED_RESPONSE')
      let level: ShopifyInventoryObservation['level'] = null
      if (item.inventoryLevel !== null) {
        const current = object(item.inventoryLevel, 'MALFORMED_RESPONSE'), location = object(current.location, 'MALFORMED_RESPONSE')
        same(object(current.item, 'MALFORMED_RESPONSE').id, binding.inventoryItemId); same(location.id, binding.locationId)
        requireValue(typeof current.isActive === 'boolean' && typeof location.isActive === 'boolean', 'MALFORMED_RESPONSE')
        requireValue(Array.isArray(current.quantities) && current.quantities.length === 1, 'MALFORMED_RESPONSE')
        const quantity = object(current.quantities[0], 'MALFORMED_RESPONSE')
        requireValue(quantity.name === 'available' && integer(quantity.quantity, -INT_MAX - 1), 'MALFORMED_RESPONSE')
        level = { active: current.isActive, locationActive: location.isActive, available: quantity.quantity }
      }
      const observation: ShopifyInventoryObservation = freeze({ apiVersion: SHOPIFY_ADMIN_API_VERSION, bindingHash: hash(binding), observedAtMs: started,
        productStatus: product.status as ShopifyInventoryObservation['productStatus'], inventoryPolicy: variant.inventoryPolicy as ShopifyInventoryObservation['inventoryPolicy'],
        requiresComponents: variant.requiresComponents, tracked: item.tracked, linkedVariantIds, linkedVariantsTruncated: page.hasNextPage, level })
      // Request start is conservative: parsing/review time never refreshes evidence.
      fresh(started, clock(), policy.maxReadAgeMs); observations.add(observation)
      return { status: 'observed', observation }
    } catch (error) { return hold(error) }
  }

  function prepareChange(input: { binding: ShopifyInventoryBinding; mapping: ExactMapping; stock: StockProjection; observation: ShopifyInventoryObservation; operationId: string }): Hold | { status: 'no_change' } | { status: 'prepared'; plan: ShopifyInventoryPlan } {
    try {
      const now = clock(); policyValid(policy, now)
      requireValue(policy.sourceOfTruth === 'reconciled_supplier_stock', 'STOCK_NOT_RECONCILED')
      const binding = bindingValid(input.binding, policy, now), { mapping, stock, observation } = input
      requireValue(observations.has(observation), 'FOREIGN_OBSERVATION'); same(observation.bindingHash, hash(binding))
      fresh(observation.observedAtMs, now, policy.maxReadAgeMs)
      requireValue(readReady(observation, binding), 'INVENTORY_NOT_READY')
      review(mapping?.review, now); review(stock?.review, now)
      requireValue(mapping.status === 'exact' && mapping.source === 'verified_labels' && text(mapping.productId) && text(mapping.supplierSku), 'REVIEW_REQUIRED')
      same(mapping.review.version, binding.mappingVersion); same(gid(mapping.shopifyProductId, 'Product'), binding.shopifyProductId)
      same(gid(mapping.shopifyVariantId, 'ProductVariant'), binding.shopifyVariantId); same(mapping.shopifyProductHandle, binding.shopifyProductHandle)
      same(hash(identity(mapping.shopIdentity)), hash(identity(mapping.supplierIdentity)))
      same(gid(stock.shopifyVariantId, 'ProductVariant'), binding.shopifyVariantId); same(stock.supplierSku, mapping.supplierSku); same(stock.packVersion, mapping.shopIdentity.pack.version)
      requireValue(stock.basis === 'reconciled_sellable_units', 'STOCK_NOT_RECONCILED'); fresh(stock.observedAtMs, now, policy.maxStockAgeMs)
      requireValue(integer(stock.availableToSell, 0, policy.maxAvailableQuantity), 'CHANGE_LIMIT')
      const expected = observation.level!.available
      requireValue(Math.abs(stock.availableToSell - expected) <= policy.maxAbsoluteChange, 'CHANGE_LIMIT')
      requireValue(typeof input.operationId === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[47][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.operationId))
      requireValue(!pendingTargets.has(targetKey(binding)), 'RECONCILIATION_REQUIRED')
      requireValue(!operationIds.has(input.operationId), 'OPERATION_ID_REUSED')
      if (expected === stock.availableToSell) return { status: 'no_change' }
      const body = { operationName: 'TllInventorySet', query: SET_QUERY, variables: {
        input: { name: 'available', reason: 'correction', referenceDocumentUri: `gid://tll/InventorySync/${input.operationId}`,
          quantities: [{ inventoryItemId: binding.inventoryItemId, locationId: binding.locationId, quantity: stock.availableToSell, changeFromQuantity: expected }] },
        idempotencyKey: input.operationId,
      } }
      const plan: ShopifyInventoryPlan = freeze({ apiVersion: SHOPIFY_ADMIN_API_VERSION, operationId: input.operationId,
        requestHash: hash({ endpoint, body }), createdAtMs: now, expiresAtMs: Math.min(policy.review.expiresAtMs, binding.review.expiresAtMs, mapping.review.expiresAtMs, stock.review.expiresAtMs,
          observation.observedAtMs + policy.maxReadAgeMs, stock.observedAtMs + policy.maxStockAgeMs),
        bindingHash: observation.bindingHash, mappingVersion: mapping.review.version, stockVersion: stock.review.version, expectedAvailable: expected, desiredAvailable: stock.availableToSell, request: body })
      const manifest: ShopifyPreparedManifest = freeze({ schemaVersion: 'tll-inventory-operation/v1', endpoint, requestDocument: JSON.stringify({ endpoint, body }), plan, binding,
        provenance: { policyReview: copyReview(policy.review), mappingReview: copyReview(mapping.review), stockReview: copyReview(stock.review),
          mappingProductId: mapping.productId, supplierSku: mapping.supplierSku, formulaIdentity: identity(mapping.shopIdentity), stockPackVersion: stock.packVersion,
          stockBasis: 'reconciled_sellable_units', stockObservedAtMs: stock.observedAtMs, readObservedAtMs: observation.observedAtMs } })
      plans.set(plan, { binding, plan, manifest, phase: 'prepared', startedAtMs: null, reconciling: false }); operationIds.add(plan.operationId)
      return { status: 'prepared', plan }
    } catch (error) { return hold(error) }
  }
  function describePreparedPlan(plan: ShopifyInventoryPlan): Hold | { status: 'manifest'; manifest: ShopifyPreparedManifest } {
    const state = plans.get(plan)
    if (!state) return hold(new AdapterFailure('FOREIGN_PLAN'))
    if (state.phase !== 'prepared') return hold(new AdapterFailure('ALREADY_ATTEMPTED'))
    return { status: 'manifest', manifest: state.manifest }
  }

  async function executeChange(plan: ShopifyInventoryPlan): Promise<ShopifyMutationResult> {
    let state: PlanState | undefined
    let attempted = false
    try {
      requireValue(mutationsEnabled, 'MUTATIONS_DISABLED')
      state = plans.get(plan); requireValue(state, 'FOREIGN_PLAN')
      requireValue(state.phase === 'prepared', state.phase === 'reconciled' ? 'ALREADY_ATTEMPTED' : 'RECONCILIATION_REQUIRED')
      requireValue(!pendingTargets.has(targetKey(state.binding)), 'RECONCILIATION_REQUIRED')
      const now = clock(); policyValid(policy, now)
      requireValue(now >= plan.createdAtMs && now < plan.expiresAtMs, 'EXPIRED')
      same(plan.requestHash, hash({ endpoint, body: plan.request }))
      // Claim synchronously before awaiting transport. No automatic retries or
      // second write to a pending item/location, even with a different operation ID.
      state.phase = 'sent'; state.startedAtMs = now; pendingTargets.set(targetKey(state.binding), plan.operationId); attempted = true
      const data = await request(plan.request)
      const payload = object(data.inventorySetQuantities, 'MALFORMED_RESPONSE')
      requireValue(Array.isArray(payload.userErrors), 'MALFORMED_RESPONSE')
      if (payload.userErrors.length > 0) {
        const errors = payload.userErrors.map(error => object(error, 'MALFORMED_RESPONSE'))
        const cas = errors.every(error => error.code === 'CHANGE_FROM_QUANTITY_STALE') && payload.inventoryAdjustmentGroup === null
        if (cas) state.phase = 'rejected'
        throw new AdapterFailure(cas ? 'CAS_CONFLICT' : 'USER_ERRORS')
      }
      const group = object(payload.inventoryAdjustmentGroup, 'MALFORMED_RESPONSE')
      requireValue(typeof group.id === 'string' && /^gid:\/\/shopify\/InventoryAdjustmentGroup\/[A-Za-z0-9_-]{1,128}$/.test(group.id), 'MALFORMED_RESPONSE')
      same(group.referenceDocumentUri, `gid://tll/InventorySync/${plan.operationId}`)
      requireValue(Array.isArray(group.changes) && group.changes.length === 1, 'MALFORMED_RESPONSE')
      const change = object(group.changes[0], 'MALFORMED_RESPONSE')
      same(change.name, 'available'); same(object(change.item, 'MALFORMED_RESPONSE').id, state.binding.inventoryItemId)
      same(object(change.location, 'MALFORMED_RESPONSE').id, state.binding.locationId)
      same(change.delta, plan.desiredAvailable - plan.expectedAvailable); same(change.quantityAfterChange, plan.desiredAvailable)
      state.phase = 'acknowledged'
      return { status: 'acknowledged', code: null, operationId: plan.operationId, requestHash: plan.requestHash, adjustmentGroupId: group.id, reconciliationRequired: true, retryAllowed: false }
    } catch (error) {
      if (attempted && state && ['sent', 'rejected'].includes(state.phase)) {
        if (state.phase !== 'rejected') state.phase = 'unknown'
        return { status: state.phase as 'unknown' | 'rejected', code: error instanceof AdapterFailure ? error.code : 'MALFORMED_RESPONSE',
          operationId: state.plan.operationId, requestHash: state.plan.requestHash, adjustmentGroupId: null, reconciliationRequired: true, retryAllowed: false }
      }
      return hold(error)
    }
  }

  async function reconcileChange(plan: ShopifyInventoryPlan): Promise<ShopifyReconciliationResult> {
    let locked: PlanState | undefined
    try {
      const state = plans.get(plan); requireValue(state, 'FOREIGN_PLAN')
      requireValue(['acknowledged', 'unknown', 'rejected'].includes(state.phase), state.phase === 'prepared' ? 'NOT_ATTEMPTED' : 'RECONCILIATION_REQUIRED')
      requireValue(!state.reconciling, 'RECONCILIATION_REQUIRED'); state.reconciling = true; locked = state
      // Perform a new read here; accepting a caller-supplied old observation could
      // wrongly clear an uncertain mutation. This never retries the mutation.
      const reread = await readTarget(state.binding)
      if (reread.status === 'hold') return reread
      requireValue(state.startedAtMs !== null && reread.observation.observedAtMs >= state.startedAtMs, 'STALE_OBSERVATION')
      const observed = reread.observation.level?.available ?? null
      const desired = readReady(reread.observation, state.binding) && observed === plan.desiredAvailable
      if (desired && state.phase === 'acknowledged') {
        state.phase = 'reconciled'; pendingTargets.delete(targetKey(state.binding))
        return { status: 'reconciled', operationId: plan.operationId, observedAvailable: observed, retryAllowed: false, operatorReviewRequired: false }
      }
      // Equal quantities alone cannot prove who wrote them. Keep the target held
      // after an uncertain/rejected request or a concurrent change; no reset API.
      return { status: desired ? 'desired_state_observed_outcome_unknown' : 'diverged', operationId: plan.operationId,
        observedAvailable: observed, retryAllowed: false, operatorReviewRequired: true }
    } catch (error) { return hold(error) }
    finally { if (locked) locked.reconciling = false }
  }
  return Object.freeze({ readTarget, prepareChange, describePreparedPlan, executeChange, reconcileChange })
}
