// @ts-expect-error Node's type-strip test runtime requires an explicit TypeScript extension.
import { evaluatePriceCheckCatalogueReceipt } from './price-check-catalogue-receipt.ts'

/** Read-only, injected Shopify Admin evidence collector. It has no transport or credential implementation. */
export const SHOPIFY_VARIANT_SNAPSHOT_READ_ONLY = true
export const SHOPIFY_ADMIN_API_VERSION = '2026-07'
export const SHOPIFY_VARIANT_SNAPSHOT_SCOPE_ID = 'shopify-admin-product-variants-all-v1'
export const MAX_SHOPIFY_VARIANT_PENCE = 1_000_000_000
export const SHOPIFY_VARIANT_COUNT_BEFORE_QUERY = `query TllShopifyVariantCountBefore { shop { id currencyCode } productVariantsCount(limit: null) { count precision } }`
export const SHOPIFY_VARIANT_PAGE_QUERY = `query TllShopifyVariantPage($after: String) { shop { id currencyCode } productVariants(first: 250, after: $after, sortKey: ID) { nodes { id price updatedAt product { id status } } pageInfo { hasNextPage endCursor } } }`
export const SHOPIFY_VARIANT_COUNT_AFTER_QUERY = `query TllShopifyVariantCountAfter { shop { id currencyCode } productVariantsCount(limit: null) { count precision } }`

const MAX_VARIANTS = 250_000
const MAX_PAGES = 1_000
const shopGid = (value: unknown): value is string => typeof value === 'string' && /^gid:\/\/shopify\/Shop\/[1-9][0-9]{0,19}$/.test(value)
const gid = (value: unknown, type: 'Product' | 'ProductVariant'): value is string => typeof value === 'string' && new RegExp(`^gid://shopify/${type}/[1-9][0-9]{0,19}$`).test(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_VARIANTS
const money = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)\.[0-9]{2}$/.test(value)) return false
  const [pounds, pennies] = value.split('.')
  const parsed = Number(pounds) * 100 + Number(pennies)
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= MAX_SHOPIFY_VARIANT_PENCE
}
const timestamp = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false
  const parsed = Date.parse(value), canonical = value.includes('.') ? value : value.replace('Z', '.000Z')
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === canonical
}
const productStatus = (value: unknown): value is ShopifyVariantStatus => value === 'ACTIVE' || value === 'ARCHIVED' || value === 'DRAFT' || value === 'UNLISTED'

export type ShopifyVariantStatus = 'ACTIVE' | 'ARCHIVED' | 'DRAFT' | 'UNLISTED'
export type ShopifyVariantSnapshotRequest = { operationName: 'TllShopifyVariantCountBefore' | 'TllShopifyVariantPage' | 'TllShopifyVariantCountAfter'; query: string; variables: { after?: string | null } }
export type ShopifyVariantSnapshotRequestPort = (request: ShopifyVariantSnapshotRequest) => Promise<unknown>
export type ShopifyVariantSnapshotInput = { request: ShopifyVariantSnapshotRequestPort; expectedShopId: string; snapshotId: string }
export type ShopifyVariantRow = { id: string; pricePence: number; updatedAt: string; product: { id: string; status: ShopifyVariantStatus } }
export type ShopifyVariantSnapshot = { shopId: string; currencyCode: 'GBP'; scopeId: string; snapshotId: string; declaredVariantCount: number; variants: ShopifyVariantRow[] }
export type ShopifyVariantSnapshotResult = { status: 'PASS' | 'HOLD'; readOnly: true; shadowUseAuthorized: false; automationEnabled: false; priceChangeAuthorized: false; snapshot: ShopifyVariantSnapshot | null; holdReason: 'SHOPIFY_VARIANT_SNAPSHOT_HOLD' | null }

const hold = (): ShopifyVariantSnapshotResult => ({ status: 'HOLD', readOnly: true, shadowUseAuthorized: false, automationEnabled: false, priceChangeAuthorized: false, snapshot: null, holdReason: 'SHOPIFY_VARIANT_SNAPSHOT_HOLD' })
const pass = (snapshot: ShopifyVariantSnapshot): ShopifyVariantSnapshotResult => ({ status: 'PASS', readOnly: true, shadowUseAuthorized: false, automationEnabled: false, priceChangeAuthorized: false, snapshot, holdReason: null })

function graphqlData(response: unknown): Record<string, unknown> | null {
  if (!record(response) || ('errors' in response && (!Array.isArray(response.errors) || response.errors.length !== 0)) || !record(response.data)) return null
  return response.data
}

function sameShop(data: Record<string, unknown>, expectedShopId: string): boolean {
  const shop = record(data.shop) ? data.shop : null
  return !!shop && shop.id === expectedShopId && shop.currencyCode === 'GBP'
}

function parseCount(response: unknown, expectedShopId: string): number | null {
  const data = graphqlData(response), result = data && record(data.productVariantsCount) ? data.productVariantsCount : null
  if (!data || !sameShop(data, expectedShopId) || !result || result.precision !== 'EXACT' || !count(result.count)) return null
  return result.count
}

function parsePage(response: unknown, expectedShopId: string, requestCursor: string | null): { rows: ShopifyVariantRow[]; endCursor: string; hasNextPage: boolean } | null {
  const data = graphqlData(response), connection = data && record(data.productVariants) ? data.productVariants : null
  const pageInfo = connection && record(connection.pageInfo) ? connection.pageInfo : null
  if (!data || !sameShop(data, expectedShopId) || !connection || !pageInfo || !Array.isArray(connection.nodes) || connection.nodes.length > 250 || typeof pageInfo.hasNextPage !== 'boolean' || !text(pageInfo.endCursor)) return null
  if (requestCursor !== null && pageInfo.endCursor === requestCursor) return null
  const rows: ShopifyVariantRow[] = []
  for (const node of connection.nodes) {
    const product = record(node) && record(node.product) ? node.product : null
    if (!record(node) || !gid(node.id, 'ProductVariant') || !money(node.price) || !timestamp(node.updatedAt) || !product || !gid(product.id, 'Product') || !productStatus(product.status)) return null
    rows.push({ id: node.id, pricePence: Number(node.price.split('.')[0]) * 100 + Number(node.price.slice(-2)), updatedAt: node.updatedAt, product: { id: product.id, status: product.status } })
  }
  return { rows, endCursor: pageInfo.endCursor, hasNextPage: pageInfo.hasNextPage }
}

/** Reads all unfiltered variants through the caller-owned request port, then verifies the evidence receipt. */
export async function readShopifyVariantSnapshot(input: unknown): Promise<ShopifyVariantSnapshotResult> {
  if (!record(input) || 'scopeId' in input || typeof input.request !== 'function' || !shopGid(input.expectedShopId) || !text(input.snapshotId)) return hold()
  const request = input.request as ShopifyVariantSnapshotRequestPort, expectedShopId = input.expectedShopId, scopeId = SHOPIFY_VARIANT_SNAPSHOT_SCOPE_ID, snapshotId = input.snapshotId
  try {
    const before = parseCount(await request({ operationName: 'TllShopifyVariantCountBefore', query: SHOPIFY_VARIANT_COUNT_BEFORE_QUERY, variables: {} }), expectedShopId)
    if (before === null) return hold()
    const rows: ShopifyVariantRow[] = [], pages: Array<{ shopId: string; scopeId: string; snapshotId: string; requestCursor: string | null; endCursor: string; hasNextPage: boolean; variantIds: string[] }> = []
    let cursor: string | null = null
    for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
      const page = parsePage(await request({ operationName: 'TllShopifyVariantPage', query: SHOPIFY_VARIANT_PAGE_QUERY, variables: { after: cursor } }), expectedShopId, cursor)
      if (!page || rows.length + page.rows.length > MAX_VARIANTS) return hold()
      rows.push(...page.rows)
      pages.push({ shopId: expectedShopId, scopeId, snapshotId, requestCursor: cursor, endCursor: page.endCursor, hasNextPage: page.hasNextPage, variantIds: page.rows.map(row => row.id) })
      if (!page.hasNextPage) break
      cursor = page.endCursor
      if (pageNumber === MAX_PAGES - 1) return hold()
    }
    const after = parseCount(await request({ operationName: 'TllShopifyVariantCountAfter', query: SHOPIFY_VARIANT_COUNT_AFTER_QUERY, variables: {} }), expectedShopId)
    if (after === null || before !== after) return hold()
    const receipt = evaluatePriceCheckCatalogueReceipt({ shopId: expectedShopId, scopeId, snapshotId, declaredVariantCount: before, variants: rows, pages })
    if (receipt.status !== 'PASS') return hold()
    return pass({ shopId: expectedShopId, currencyCode: 'GBP', scopeId, snapshotId, declaredVariantCount: before, variants: rows })
  } catch {
    return hold()
  }
}
