import type { Product } from '@/lib/products'

type PriceProduct = Pick<Product, 'retail_price' | 'storePrice' | 'storeLinkMapping' | 'storeVariants'>

export function isUsablePrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export function isStoreOffer(product: PriceProduct): boolean {
  return Boolean(product.storePrice || product.storeLinkMapping || product.storeVariants?.length)
}

/** Store offers must never display a historical retail price as their pack price. */
export function displayPrice(product: PriceProduct): number | null {
  const price = isStoreOffer(product) ? product.storePrice?.price : product.retail_price
  return isUsablePrice(price) ? price : null
}
