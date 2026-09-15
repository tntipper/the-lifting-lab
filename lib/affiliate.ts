import { isSyntheticPreview } from './preview-mode'

// Product listings are not verified offers. Legacy URLs lack exact-pack,
// availability and cost approval; they must never become purchase promises.
const AMAZON_TAG = process.env.NEXT_PUBLIC_AMAZON_TAG?.trim() || 'theliftinglab-21'
const AWIN_AFFID = '2919631'
const BULK_MID = '4822'
export const MYPROTEIN_REF_CODE = 'TOBIAS-R1I5'

export type ProductListing = {
  state: 'listing' | 'search_only' | 'unavailable'
  url: string | null
  retailer: string | null
  relationship: 'affiliate' | 'external' | 'own_shop' | 'none'
  reason: 'preview' | 'missing_url' | 'invalid_url' | 'unreviewed_retailer' | 'own_shop_approval_required' | 'unverified_listing' | 'search_destination' | 'unreviewed_path'
}
const hosts = {
  Amazon: ['amazon.co.uk', 'www.amazon.co.uk'],
  Bulk: ['bulk.com', 'www.bulk.com'],
  Myprotein: ['myprotein.com', 'www.myprotein.com', 'myprotein.co.uk', 'www.myprotein.co.uk'],
}
function parseReference(raw: unknown): URL | null {
  if (typeof raw !== 'string' || raw.length > 4096) return null
  const value = raw.trim()
  if (!value || /[\x00-\x20\x7f\\]/.test(value)) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    return url
  } catch { return null }
}
function awinBulk(url: URL): string {
  const result = new URL('https://www.awin1.com/cread.php')
  result.searchParams.set('awinmid', BULK_MID)
  result.searchParams.set('awinaffid', AWIN_AFFID)
  result.searchParams.set('ued', url.href)
  return result.href
}
const unavailable = (reason: ProductListing['reason'], own = false): ProductListing => ({
  state: 'unavailable', url: null, retailer: own ? 'The Lifting Lab' : null,
  relationship: own ? 'own_shop' : 'none', reason,
})

/** Classify only an explicitly supplied reference; never infer a listing from a name. */
export function resolveProductListing(directUrl?: string | null): ProductListing {
  if (isSyntheticPreview()) return unavailable('preview')
  if (directUrl == null || (typeof directUrl === 'string' && !directUrl.trim())) return unavailable('missing_url')
  let url = parseReference(directUrl)
  if (!url) return unavailable('invalid_url')
  // Awin is a redirector. Inspect and rewrap only a single explicit Bulk target.
  if (['awin1.com', 'www.awin1.com'].includes(url.hostname)) {
    const targets = url.searchParams.getAll('ued')
    if (url.pathname !== '/cread.php' || targets.length !== 1) return unavailable('invalid_url')
    url = parseReference(targets[0])
    if (!url || !hosts.Bulk.includes(url.hostname)) return unavailable('unreviewed_retailer')
  }
  if (url.hostname === 'theliftinglab.co.uk' || url.hostname.endsWith('.theliftinglab.co.uk') || url.hostname === 'bcuy6z-kp.myshopify.com') {
    return unavailable('own_shop_approval_required', true)
  }
  const retailer = (Object.keys(hosts) as Array<keyof typeof hosts>).find(name => hosts[name].includes(url!.hostname))
  if (!retailer) return unavailable('unreviewed_retailer')
  const decodedPath = (() => { try { return decodeURIComponent(url!.pathname) } catch { return '' } })()
  if (!decodedPath || /[\x00-\x20\x7f\\]/.test(decodedPath)) return unavailable('invalid_url')
  // Positive path patterns: an allowed hostname alone does not approve cart,
  // account or redirect endpoints. Unknown routes await destination review.
  const productPath = retailer === 'Amazon'
    ? /^\/(?:[A-Za-z0-9_-]+\/)?dp\/[A-Z0-9]{10}(?:\/ref=[A-Za-z0-9_=-]+)?\/?$/.test(decodedPath)
      || /^\/gp\/(?:product|aw\/d)\/[A-Z0-9]{10}\/?$/.test(decodedPath)
    : retailer === 'Bulk'
      ? /^\/uk\/products\/[a-z0-9-]+\/[a-z0-9-]+\/?$/.test(decodedPath)
      : /^\/(?:p\/)?(?:sports-nutrition|nutrition|vitamins|protein)\/[a-z0-9-]+\/[0-9]{5,12}(?:\.html)?\/?$/.test(decodedPath)
  const searchPath = retailer === 'Amazon'
    ? /^\/(?:s|b|gp\/bestsellers)\/?$/.test(decodedPath)
    : retailer === 'Bulk'
      ? /^\/uk\/(?:search|offers\.list|protein(?:\/[a-z0-9-]+)?)\/?$/.test(decodedPath)
      : /^\/(?:search(?:\.list)?|referrals\.list|(?:sport|sports)-nutrition\/search\.list|c\/(?:[a-z0-9-]+\/)*[a-z0-9-]+)\/?$/.test(decodedPath)
  const searchOnly = decodedPath === '/' || searchPath
  if (!productPath && !searchOnly) return unavailable('unreviewed_path')
  // Do not preserve a second navigation destination even on an approved path.
  if ([...url.searchParams.keys()].some(key => /^(?:url|uri|location|redirect|redirect_?url|return_?url|return_?to|destination|next|continue)$/i.test(key))) return unavailable('unreviewed_path')
  if (retailer !== 'Myprotein') url.searchParams.delete('applyCode')
  if (retailer !== 'Amazon') url.searchParams.delete('tag')
  if (retailer === 'Amazon') url.searchParams.set('tag', AMAZON_TAG)
  if (retailer === 'Myprotein') url.searchParams.set('applyCode', MYPROTEIN_REF_CODE)
  const target = retailer === 'Bulk' ? awinBulk(url) : url.href
  return { state: searchOnly ? 'search_only' : 'listing', url: target, retailer, relationship: 'affiliate',
    reason: searchOnly ? 'search_destination' : 'unverified_listing' }
}

// Explicit retailer navigation for editorial promotion pages. These functions
// are never product purchase fallbacks and are inert in synthetic previews.
export function myproteinLink(): string {
  if (isSyntheticPreview()) return '/preview'
  const url = new URL('https://www.myprotein.com/referrals.list')
  url.searchParams.set('applyCode', MYPROTEIN_REF_CODE)
  return url.href
}
export function amazonSearch(brand: string, name: string): string {
  if (isSyntheticPreview()) return '/preview'
  const url = new URL('https://www.amazon.co.uk/s')
  url.searchParams.set('k', `${brand} ${name}`.trim())
  url.searchParams.set('tag', AMAZON_TAG)
  return url.href
}
export function bulkSearch(name: string): string {
  if (isSyntheticPreview()) return '/preview'
  const url = new URL('https://www.bulk.com/uk/search')
  url.searchParams.set('q', name.trim())
  return awinBulk(url)
}
export function bulkDealsLink(): string {
  return isSyntheticPreview() ? '/preview' : awinBulk(new URL('https://www.bulk.com/uk/offers.list'))
}
