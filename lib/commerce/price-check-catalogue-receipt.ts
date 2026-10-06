/** Offline consistency check only. Supplied receipts are not authenticated Shopify evidence. */
export const PRICE_CHECK_CATALOGUE_READ_ONLY = true
export type CatalogueReceiptHoldCode = 'INVALID_ENVELOPE' | 'INVALID_BINDING' | 'INVALID_COUNT' | 'INVALID_PAGE' | 'INVALID_CURSOR' | 'DUPLICATE_CURSOR' | 'MISSING_TERMINAL_PAGE' | 'EMPTY_CATALOGUE' | 'INVALID_VARIANT_ID' | 'DUPLICATE_VARIANT_ID' | 'COUNT_MISMATCH' | 'VARIANT_SET_MISMATCH' | 'LIMIT_EXCEEDED'
export type CatalogueReceiptResult = { status: 'PASS' | 'HOLD'; readOnly: true; automationEnabled: false; priceChangeAuthorized: false; snapshotId: string | null; suppliedVariantCount: number; pagedVariantCount: number; holds: CatalogueReceiptHoldCode[] }

const MAX_PAGES = 1000
const MAX_PAGE_VARIANTS = 250
const MAX_VARIANTS = MAX_PAGES * MAX_PAGE_VARIANTS
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.trim().length > 0
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_VARIANTS

/** Verifies internal page/count/row agreement; it cannot verify who supplied those facts. */
export function evaluatePriceCheckCatalogueReceipt(input: unknown): CatalogueReceiptResult {
  const holds = new Set<CatalogueReceiptHoldCode>()
  const source = record(input) ? input : null
  if (!source) holds.add('INVALID_ENVELOPE')
  const shopId = source?.shopId, scopeId = source?.scopeId, snapshotId = source?.snapshotId
  if (!id(shopId) || !id(scopeId) || !id(snapshotId)) holds.add('INVALID_BINDING')
  const declaredCount = source?.declaredVariantCount
  if (!count(declaredCount)) holds.add('INVALID_COUNT')
  const variants = Array.isArray(source?.variants) ? source.variants : null
  const pages = Array.isArray(source?.pages) ? source.pages : null
  if (!variants || !pages) holds.add('INVALID_ENVELOPE')
  const suppliedVariantCount = variants?.length ?? 0
  if ((variants?.length ?? 0) > MAX_VARIANTS || (pages?.length ?? 0) > MAX_PAGES) holds.add('LIMIT_EXCEEDED')
  if (!pages?.length) holds.add('MISSING_TERMINAL_PAGE')
  if (!variants?.length) holds.add('EMPTY_CATALOGUE')
  const supplied = new Set<string>()
  if (variants && variants.length <= MAX_VARIANTS) for (let i = 0; i < variants.length; i++) {
    const row = variants[i]
    if (!record(row) || !id(row.id)) { holds.add('INVALID_VARIANT_ID'); continue }
    if (supplied.has(row.id)) holds.add('DUPLICATE_VARIANT_ID')
    supplied.add(row.id)
  }
  const paged = new Set<string>(), requestCursors = new Set<string>(), endCursors = new Set<string>()
  let pagedVariantCount = 0, expectedCursor: string | null = null, terminal = false
  if (pages && pages.length <= MAX_PAGES) for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    if (!record(page)) { holds.add('INVALID_PAGE'); continue }
    if (page.shopId !== shopId || page.scopeId !== scopeId || page.snapshotId !== snapshotId) holds.add('INVALID_BINDING')
    if (page.requestCursor !== expectedCursor || (page.requestCursor !== null && !id(page.requestCursor))) holds.add('INVALID_CURSOR')
    if (id(page.requestCursor)) {
      if (requestCursors.has(page.requestCursor)) holds.add('DUPLICATE_CURSOR')
      requestCursors.add(page.requestCursor)
    }
    if (terminal) holds.add('INVALID_PAGE')
    if (typeof page.hasNextPage !== 'boolean' || !id(page.endCursor)) holds.add('INVALID_PAGE')
    if (id(page.requestCursor) && page.endCursor === page.requestCursor) holds.add('INVALID_CURSOR')
    if (id(page.endCursor)) {
      if (endCursors.has(page.endCursor)) holds.add('DUPLICATE_CURSOR')
      endCursors.add(page.endCursor)
    }
    if (!Array.isArray(page.variantIds) || !page.variantIds.length || page.variantIds.length > MAX_PAGE_VARIANTS) { holds.add('INVALID_PAGE'); continue }
    pagedVariantCount += page.variantIds.length
    for (let j = 0; j < page.variantIds.length; j++) {
      const value = page.variantIds[j]
      if (!id(value)) { holds.add('INVALID_VARIANT_ID'); continue }
      if (paged.has(value)) holds.add('DUPLICATE_VARIANT_ID')
      paged.add(value)
    }
    if (page.hasNextPage === false) terminal = true
    else if (page.hasNextPage === true && id(page.endCursor)) expectedCursor = page.endCursor
  }
  if (!terminal) holds.add('MISSING_TERMINAL_PAGE')
  if (count(declaredCount) && (declaredCount !== suppliedVariantCount || declaredCount !== pagedVariantCount)) holds.add('COUNT_MISMATCH')
  if (supplied.size !== paged.size || [...supplied].some(value => !paged.has(value))) holds.add('VARIANT_SET_MISMATCH')
  return { status: holds.size ? 'HOLD' : 'PASS', readOnly: true, automationEnabled: false, priceChangeAuthorized: false, snapshotId: id(snapshotId) ? snapshotId : null, suppliedVariantCount, pagedVariantCount, holds: [...holds] }
}
