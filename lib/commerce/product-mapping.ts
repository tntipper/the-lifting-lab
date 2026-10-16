import type { CatalogueReview, ExactMapping, FormulaIdentity, PackIdentity } from './catalogue-eligibility'

/** Private saved row, never a public product projection. Affiliate/not_sold rows may be unmapped. */
export type ProductMappingRow = {
  comparison_product_id: string
  status: 'store' | 'affiliate' | 'not_sold'
  shopify_product_id: string | null
  shopify_variant_id: string | null
  handle: string | null
  supplier: string | null
  supplier_sku: string | null
  ean: string | null
  pack: PackIdentity | null
  flavour: string | null
  cost_ex_vat: number | string | null
  price_auto: boolean
  active: boolean
  approval_reference: string | null
  review?: CatalogueReview | null
  mapping_status?: ExactMapping['status'] | null
  mapping_source?: ExactMapping['source'] | null
  shop_identity?: FormulaIdentity | null
  supplier_identity?: FormulaIdentity | null
  /** Export-only observed Shopify publication state, not a live read or approval. */
  published?: boolean
}
export type StoreMappingRow = Omit<ProductMappingRow, 'cost_ex_vat' | 'price_auto' | 'ean' | 'published'>
export type MappingIssue = { row: number; code: string; field: string }
/** Public link details only. Never pass ProductMappingRow or ExactMapping to the browser. */
export type StoreLinkMapping = Pick<ExactMapping, 'productId' | 'shopifyProductHandle' | 'shopifyVariantId' | 'review'> & {
  active: true
  approved: true
}

/** Public choice on one comparison product page; never contains supplier data. */
export type StoreVariantOption = {
  variantId: string
  handle: string
  label: string
  flavour: string | null
  packLabel: string
  mapping: StoreLinkMapping
  storePrice?: import('./store-price-products').StorePricePresentation
}

export function presentStoreVariant(row: StoreMappingRow, now = Date.now()): StoreVariantOption | null {
  const mapping = presentStoreLinkMapping(row, now)
  if (!mapping) return null
  const pack = row.pack ?? row.shop_identity!.pack
  const amount = pack.unit === 'g' && pack.amountPerInner >= 1000
    ? `${pack.amountPerInner / 1000} kg` : `${pack.amountPerInner} ${pack.unit}`
  const packLabel = pack.innerCount > 1 ? `${pack.innerCount} × ${amount}` : amount
  const flavour = row.flavour?.trim() || null
  return { variantId: mapping.shopifyVariantId.replace('gid://shopify/ProductVariant/', ''),
    handle: mapping.shopifyProductHandle, label: [flavour, packLabel].filter(Boolean).join(' · '),
    flavour, packLabel, mapping }
}

/** Public projection used by server loaders; saved review evidence is the only link authority. */
export function presentStoreLinkMapping(row: StoreMappingRow, now = Date.now()): StoreLinkMapping | null {
  if (row?.active !== true || row.status !== 'store' || !text(row.approval_reference)) return null
  let mapping: ExactMapping
  try { mapping = toReviewedExactMapping(row) } catch { return null }
  const review = mapping.review
  if (mapping.status !== 'exact' || mapping.source !== 'verified_labels' || review.approved !== true ||
      review.version !== review.expectedVersion || !Number.isSafeInteger(now) ||
      !Number.isSafeInteger(review.verifiedAtMs) || review.verifiedAtMs < 0 || review.verifiedAtMs > now ||
      !Number.isSafeInteger(review.expiresAtMs) || review.expiresAtMs <= now) return null
  const shop = mapping.shopIdentity, supplier = mapping.supplierIdentity
  if (!(['formulaId', 'formulaVersion', 'flavourId', 'labelVersion'] as const).every(key => shop[key] === supplier[key]) ||
      !(Object.keys(shop.pack) as (keyof PackIdentity)[]).every(key => shop.pack[key] === supplier.pack[key])) return null
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(mapping.shopifyProductHandle)) return null
  return { productId: mapping.productId, shopifyProductHandle: mapping.shopifyProductHandle,
    shopifyVariantId: mapping.shopifyVariantId, review: { approved: review.approved, version: review.version, expectedVersion: review.expectedVersion,
      verifiedAtMs: review.verifiedAtMs, expiresAtMs: review.expiresAtMs }, active: true, approved: true }
}
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

export function canonicalShopifyId(value: unknown, kind: 'Product' | 'ProductVariant'): string | null {
  if (typeof value !== 'string') return null
  const id = value.trim().replace(`gid://shopify/${kind}/`, '')
  return /^[1-9][0-9]*$/.test(id) ? `gid://shopify/${kind}/${id}` : null
}

/** Pure export validation: issues contain row numbers and codes, never costs or raw data. */
export function validateProductMappings(rows: readonly unknown[]): MappingIssue[] {
  const issues: MappingIssue[] = [], seen = new Set<string>()
  rows.forEach((row, index) => {
    const flag = (code: string, field: string) => issues.push({ row: index + 1, code, field })
    if (!object(row)) { flag('INVALID_ROW', 'row'); return }
    if (!text(row.comparison_product_id)) flag('MISSING_PRODUCT', 'comparison_product_id')
    if (!['store', 'affiliate', 'not_sold'].includes(String(row.status))) flag('INVALID_STATUS', 'status')
    for (const field of ['active', 'price_auto', 'published']) {
      if ((field !== 'published' || row[field] !== undefined) && typeof row[field] !== 'boolean') flag('INVALID_BOOLEAN', field)
    }
    for (const [field, kind] of [['shopify_product_id', 'Product'], ['shopify_variant_id', 'ProductVariant']] as const) {
      const value = row[field]
      if ((value !== null && value !== undefined && value !== '') || row.status === 'store') {
        const canonical = canonicalShopifyId(value, kind)
        if (!canonical) flag('INVALID_SHOPIFY_ID', field)
        else if (kind === 'ProductVariant') {
          if (seen.has(canonical)) flag('DUPLICATE_VARIANT', field)
          seen.add(canonical)
        }
      }
    }
    if (row.status === 'store') {
      for (const field of ['handle', 'supplier', 'supplier_sku']) if (!text(row[field])) flag(field === 'supplier_sku' ? 'MISSING_SKU' : 'MISSING_STORE_IDENTITY', field)
      const cost = row.cost_ex_vat
      if (cost === null || cost === undefined || cost === '') flag('MISSING_COST', 'cost_ex_vat')
    }
    const cost = row.cost_ex_vat
    if (cost !== null && cost !== undefined && cost !== '') {
      if (!((typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 && cost < 1e10) ||
        (typeof cost === 'string' && /^\d{1,10}(\.\d{1,4})?$/.test(cost) && Number(cost) < 1e10))) flag('INVALID_COST', 'cost_ex_vat')
    }
    if (row.active === true && !text(row.approval_reference)) flag('ACTIVE_WITHOUT_APPROVAL', 'approval_reference')
    if (row.active === false && row.published === true) flag('INACTIVE_PUBLISHED', 'published')
    if (row.price_auto === true && (row.active !== true || row.status !== 'store')) flag('INVALID_PRICE_AUTO', 'price_auto')
  })
  return issues
}

function validPack(value: unknown): value is PackIdentity {
  return object(value) && text(value.version) && ['single', 'multipack', 'case'].includes(String(value.sellingUnit)) &&
    Number.isSafeInteger(value.innerCount) && Number(value.innerCount) > 0 && typeof value.amountPerInner === 'number' &&
    Number.isFinite(value.amountPerInner) && value.amountPerInner > 0 &&
    ['g', 'ml', 'tablet', 'capsule', 'bar', 'bottle', 'sachet'].includes(String(value.unit))
}
function validIdentity(value: unknown): value is FormulaIdentity {
  return object(value) && ['formulaId', 'formulaVersion', 'flavourId', 'labelVersion'].every(key => text(value[key])) && validPack(value.pack)
}
function validReview(value: unknown): value is CatalogueReview {
  return object(value) && typeof value.approved === 'boolean' && text(value.version) && text(value.expectedVersion) &&
    typeof value.verifiedAtMs === 'number' && Number.isFinite(value.verifiedAtMs) &&
    typeof value.expiresAtMs === 'number' && Number.isFinite(value.expiresAtMs) && value.expiresAtMs > value.verifiedAtMs
}

/** Preserve supplied evidence; the existing eligibility evaluator still decides approval/expiry/exactness. */
export function toExactMapping(row: ProductMappingRow): ExactMapping {
  if (validateProductMappings([row]).length) throw new Error('Invalid saved mapping row.')
  return toReviewedExactMapping(row)
}

function toReviewedExactMapping(row: StoreMappingRow): ExactMapping {
  if (!text(row.comparison_product_id) || !text(row.handle) || !text(row.supplier) || !text(row.supplier_sku) ||
      !canonicalShopifyId(row.shopify_product_id, 'Product') || !canonicalShopifyId(row.shopify_variant_id, 'ProductVariant') ||
      row.status !== 'store' || !validReview(row.review) ||
      !validIdentity(row.shop_identity) || !validIdentity(row.supplier_identity) ||
      !['exact', 'ambiguous', 'unknown'].includes(String(row.mapping_status)) ||
      !['verified_labels', 'name_match', 'feed_estimate', 'unknown'].includes(String(row.mapping_source))) {
    throw new Error('Mapping row requires valid store identity and explicit reviewed ExactMapping evidence.')
  }
  if ((row.flavour !== null && row.flavour !== row.shop_identity.flavourId) ||
      (row.pack !== null && (!validPack(row.pack) ||
        (Object.keys(row.pack) as (keyof PackIdentity)[]).some(key => row.pack![key] !== row.shop_identity!.pack[key])))) {
    throw new Error('Saved pack or flavour conflicts with the supplied shop identity.')
  }
  return structuredClone({ review: row.review, productId: row.comparison_product_id,
    shopifyProductId: canonicalShopifyId(row.shopify_product_id, 'Product')!,
    shopifyVariantId: canonicalShopifyId(row.shopify_variant_id, 'ProductVariant')!,
    shopifyProductHandle: row.handle!, supplierSku: row.supplier_sku!,
    status: row.mapping_status!, source: row.mapping_source!, shopIdentity: row.shop_identity, supplierIdentity: row.supplier_identity })
}
