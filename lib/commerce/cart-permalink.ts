import { withStoreAttribution, type StoreAttributionCampaign } from './store-attribution'

/** Accept only a literal public shop cart and fixed, unique referral parameters. */
export function liveCheckoutHref(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4096 ||
    !/^https:\/\/shop\.theliftinglab\.co\.uk\/cart\/[1-9][0-9]*:[1-9][0-9]*(?:,[1-9][0-9]*:[1-9][0-9]*)*(?:\?[^#\s\\]*)?$/.test(value)) {
    throw new Error('Checkout destination unavailable')
  }
  const url = new URL(value)
  const allowed: Record<string, readonly string[]> = {
    utm_source: ['theliftinglab'], utm_medium: ['referral'], utm_campaign: ['stack', 'product', 'compare'], ref: ['theliftinglab'],
  }
  for (const [key, val] of url.searchParams) {
    if (!allowed[key]?.includes(val) || url.searchParams.getAll(key).length !== 1) throw new Error('Checkout destination unavailable')
  }
  return value
}

export function buildCartPermalink(lines: readonly { merchandiseId: string; quantity: number }[], campaign: StoreAttributionCampaign): string | null {
  if (!lines.length) return null
  const path = lines.map(line => {
    const variant = /^(?:gid:\/\/shopify\/ProductVariant\/)?([1-9][0-9]*)$/.exec(line.merchandiseId)?.[1]
    if (!variant || !Number.isSafeInteger(line.quantity) || line.quantity < 1) throw new Error('Invalid cart line')
    return `${variant}:${line.quantity}`
  }).join(',')
  return liveCheckoutHref(withStoreAttribution(`https://shop.theliftinglab.co.uk/cart/${path}`, campaign))
}
