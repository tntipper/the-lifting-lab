import { isIP } from 'node:net'
import { cartJson } from './staging-cart-json'

/** Fixed synthetic Storefront operations. No checkout URL, buyer identity or credentials in projections. */
export const STAGING_CART_SHOP = 'tll-integration-staging.myshopify.com'
export const STAGING_CART_PRODUCT = '40000000-0000-4000-8000-000000000001'
export const STAGING_SHOPIFY_PRODUCT = 'gid://shopify/Product/15768467472724'
export const STAGING_SHOPIFY_VARIANT = 'gid://shopify/ProductVariant/57160491139412'
export const STOREFRONT_VERSION = '2026-07'
export const MAX_CART_QUANTITY = 5

type Json = Record<string, unknown>
export type CartObservation = { id: string; lineId: string | null; quantity: number; unitPricePence: number | null; subtotalPence: number }
export type StorefrontCart = {
  read(id: string): Promise<CartObservation>
  create(quantity: number): Promise<CartObservation>
  set(previous: CartObservation, quantity: number): Promise<CartObservation>
}
export class CartProviderFailure extends Error {
  constructor() { super('Staging cart provider result unavailable or uncertain') }
}
function requireValue(value: unknown): asserts value { if (!value) throw new CartProviderFailure() }
function object(value: unknown): Json { requireValue(value && typeof value === 'object' && !Array.isArray(value)); return value as Json }
function string(value: unknown, max = 8192): string { requireValue(typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x20\x7f]/.test(value)); return value }
function quantity(value: unknown, minimum = 0): number { requireValue(Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= MAX_CART_QUANTITY); return Number(value) }
function money(value: unknown): number {
  const row = object(value); requireValue(row.currencyCode === 'GBP' && typeof row.amount === 'string' && /^(?:0|[1-9][0-9]{0,5})(?:\.[0-9]{1,2})?$/.test(row.amount))
  const [whole, part = ''] = row.amount.split('.'); return Number(whole) * 100 + Number(part.padEnd(2, '0'))
}
export function privateCartId(value: unknown): string {
  const id = string(value)
  const url = new URL(id)
  requireValue(url.protocol === 'gid:' && url.hostname === 'shopify' && url.pathname.startsWith('/Cart/') && url.pathname.length > 6)
  requireValue(!url.username && !url.password && !url.port && !url.hash && url.searchParams.size === 1 && !!url.searchParams.get('key'))
  return id
}
const FIELDS = `id totalQuantity cost { subtotalAmount { amount currencyCode } }
  lines(first: 2) { nodes { id quantity cost { totalAmount { amount currencyCode } }
    merchandise { ... on ProductVariant { id availableForSale price { amount currencyCode } product { id } } }
  } pageInfo { hasNextPage } }`
const QUERIES = {
  read: `query TllStagingCart($id: ID!) { cart(id: $id) { ${FIELDS} } }`,
  variant: `query TllStagingVariant { productVariant: node(id: "${STAGING_SHOPIFY_VARIANT}") { ... on ProductVariant { id availableForSale price { amount currencyCode } product { id } } } }`,
  create: `mutation TllStagingCartCreate($input: CartInput!) { cartCreate(input: $input) { cart { ${FIELDS} } userErrors { code } warnings { code } } }`,
  add: `mutation TllStagingCartAdd($cartId: ID!, $lines: [CartLineInput!]!) { cartLinesAdd(cartId: $cartId, lines: $lines) { cart { ${FIELDS} } userErrors { code } warnings { code } } }`,
  update: `mutation TllStagingCartUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) { cartLinesUpdate(cartId: $cartId, lines: $lines) { cart { ${FIELDS} } userErrors { code } warnings { code } } }`,
  remove: `mutation TllStagingCartRemove($cartId: ID!, $lineIds: [ID!]!) { cartLinesRemove(cartId: $cartId, lineIds: $lineIds) { cart { ${FIELDS} } userErrors { code } warnings { code } } }`,
}
function variant(value: unknown): number {
  const row = object(value)
  requireValue(row.id === STAGING_SHOPIFY_VARIANT && object(row.product).id === STAGING_SHOPIFY_PRODUCT && row.availableForSale === true)
  const price = money(row.price); requireValue(price > 0); return price
}
function observation(value: unknown): CartObservation {
  const cart = object(value), id = privateCartId(cart.id), lines = object(cart.lines)
  requireValue(object(lines.pageInfo).hasNextPage === false && Array.isArray(lines.nodes) && lines.nodes.length <= 1)
  const subtotalPence = money(object(cart.cost).subtotalAmount)
  if (lines.nodes.length === 0) {
    requireValue(cart.totalQuantity === 0 && subtotalPence === 0)
    return { id, lineId: null, quantity: 0, unitPricePence: null, subtotalPence }
  }
  const line = object(lines.nodes[0]), count = quantity(line.quantity, 1), price = variant(line.merchandise)
  const lineId = string(line.id, 2048); requireValue(lineId.startsWith('gid://shopify/CartLine/'))
  requireValue(cart.totalQuantity === count && money(object(line.cost).totalAmount) === count * price && subtotalPence === count * price)
  return { id, lineId, quantity: count, unitPricePence: price, subtotalPence }
}

export function createStagingStorefront(options: {
  enabled: boolean; environment: string; shop: string; privateToken: string
  transport: typeof fetch; buyerIp?: string
}): StorefrontCart {
  requireValue(options.enabled === true && options.environment === 'staging' && options.shop === STAGING_CART_SHOP)
  requireValue(typeof options.privateToken === 'string' && options.privateToken.length >= 16 && options.privateToken.length <= 512 && !/[\s\x00-\x1f]/.test(options.privateToken))
  requireValue(options.buyerIp === undefined || isIP(options.buyerIp) > 0)
  const endpoint = `https://${STAGING_CART_SHOP}/api/${STOREFRONT_VERSION}/graphql.json`
  async function send(kind: keyof typeof QUERIES, variables: Json = {}): Promise<Json> {
    try {
      const response = await options.transport(endpoint, { method: 'POST', redirect: 'manual', cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json', 'Shopify-Storefront-Private-Token': options.privateToken,
          ...(options.buyerIp ? { 'Shopify-Storefront-Buyer-IP': options.buyerIp } : {}) },
        body: JSON.stringify({ query: QUERIES[kind], variables }) })
      requireValue(response.status === 200 && response.headers.get('x-shopify-api-version') === STOREFRONT_VERSION)
      const result = object(await cartJson(response)); requireValue(!result.errors)
      return object(result.data)
    } catch { throw new CartProviderFailure() }
  }
  async function changed(kind: 'create' | 'add' | 'update' | 'remove', variables: Json, target: number): Promise<CartObservation> {
    const data = await send(kind, variables), key = { create: 'cartCreate', add: 'cartLinesAdd', update: 'cartLinesUpdate', remove: 'cartLinesRemove' }[kind]
    const result = object(data[key])
    requireValue(Array.isArray(result.userErrors) && result.userErrors.length === 0 && Array.isArray(result.warnings) && result.warnings.length === 0)
    const cart = observation(result.cart); requireValue(cart.quantity === target); return cart
  }
  return {
    async read(id) { const cart = observation((await send('read', { id: privateCartId(id) })).cart); requireValue(cart.id === id); return cart },
    async create(count) {
      quantity(count, 1); variant((await send('variant')).productVariant)
      return changed('create', { input: { lines: [{ merchandiseId: STAGING_SHOPIFY_VARIANT, quantity: count }], buyerIdentity: { countryCode: 'GB' } } }, count)
    },
    async set(previous, count) {
      privateCartId(previous.id); quantity(count)
      if (count > 0) variant((await send('variant')).productVariant)
      if (count === 0) {
        if (!previous.lineId) return previous
        const cart = await changed('remove', { cartId: previous.id, lineIds: [previous.lineId] }, 0)
        requireValue(cart.id === previous.id); return cart
      }
      const cart = previous.lineId
        ? await changed('update', { cartId: previous.id, lines: [{ id: previous.lineId, quantity: count }] }, count)
        : await changed('add', { cartId: previous.id, lines: [{ merchandiseId: STAGING_SHOPIFY_VARIANT, quantity: count }] }, count)
      requireValue(cart.id === previous.id); return cart
    },
  }
}
