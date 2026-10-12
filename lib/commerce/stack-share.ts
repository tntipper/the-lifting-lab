import { buildStackCartLines, splitStackCartItems, type StackCartItem } from './stack-cart'
import { buildStoreProductLink } from '../affiliate'

export const MAX_SHARED_STACK_ITEMS = 50
export const MAX_SHARED_PACK_QUANTITY = 99
export type SharedStackLine = { variantId: string; quantity: number }

/** Reject the whole input; never silently trim, truncate or buy a partial URL. */
export function parseSharedStackItems(value: unknown): SharedStackLine[] | null {
  if (typeof value !== 'string' || !value || value.length > 4096) return null
  const parts = value.split(',')
  if (parts.length > MAX_SHARED_STACK_ITEMS) return null
  const seen = new Set<string>(), lines: SharedStackLine[] = []
  for (const part of parts) {
    const match = /^([1-9][0-9]{0,31}):([1-9][0-9]?)$/.exec(part)
    if (!match || seen.has(match[1])) return null
    seen.add(match[1]); lines.push({ variantId: match[1], quantity: Number(match[2]) })
  }
  return lines
}
export function readSharedStackQuery(params: URLSearchParams): SharedStackLine[] | null {
  const values = params.getAll('items')
  return values.length === 1 ? parseSharedStackItems(values[0]) : null
}
export function sharedStackPath(lines: readonly SharedStackLine[]): string | null {
  const value = lines.map(line => `${line.variantId}:${line.quantity}`).join(',')
  return parseSharedStackItems(value) ? `/stack?${new URLSearchParams({ items: value })}` : null
}
export function shareStackPath(items: readonly StackCartItem[], now = Date.now()): string | null {
  try {
    const lines = buildStackCartLines(items, now)
    // A variant-only URL cannot represent affiliate/unmapped products. Don't
    // describe a partial selection as the user's whole stack.
    if (!items.length || splitStackCartItems(items, now).storeItems.length !== items.length) return null
    return sharedStackPath(lines.map(line => ({ variantId: line.merchandiseId.replace('gid://shopify/ProductVariant/', ''), quantity: line.quantity })))
  } catch { return null }
}
/** Only reviewed public projections resolve identities. URL IDs grant no approval. */
export function rebuildSharedStack<T extends StackCartItem>(lines: readonly SharedStackLine[], products: readonly T[], now = Date.now()): (T & { quantity: number })[] | null {
  if (!sharedStackPath(lines)) return null
  const rebuilt: (T & { quantity: number })[] = []
  for (const line of lines) {
    const matches = products.filter(product => buildStoreProductLink(product.id, product.storeLinkMapping, now) &&
      product.storeLinkMapping!.shopifyVariantId.replace('gid://shopify/ProductVariant/', '') === line.variantId)
    if (matches.length !== 1) return null
    rebuilt.push({ ...matches[0], quantity: line.quantity })
  }
  return rebuilt
}

export function createSharedStackHandler(readProducts?: (variantIds: string[]) => Promise<StackCartItem[]>) {
  return async (request: Request): Promise<Response> => {
    const lines = readSharedStackQuery(new URL(request.url).searchParams)
    const respond = (body: object, status: number) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
    if (!lines) return respond({ error: 'Invalid shared stack. Use up to 50 distinct variant IDs with pack quantities from 1 to 99.' }, 400)
    if (!readProducts) return respond({ error: 'Shared stack product lookup is awaiting approved catalogue setup.' }, 503)
    try {
      const items = rebuildSharedStack(lines, await readProducts(lines.map(line => line.variantId)))
      return items ? respond({ items }, 200) : respond({ error: 'Some shared products could not be confirmed. No partial stack was loaded.' }, 422)
    } catch { return respond({ error: 'Shared products could not be loaded. Please retry.' }, 503) }
  }
}
