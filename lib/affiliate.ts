// Centralised affiliate link construction.
// Bulk products route through Awin deeplinks; everything else goes to Amazon.
//
// NEXT_PUBLIC_AMAZON_TAG is an OPTIONAL override. It is NOT required for
// commission: the approved store ID `theliftinglab-21` is hardcoded as the
// fallback below, so Amazon links carry a tracking tag whether or not the env
// var is set. Only set it if the store ID itself ever changes.

const AMAZON_TAG = process.env.NEXT_PUBLIC_AMAZON_TAG?.trim() || 'theliftinglab-21'

// Awin credentials for Bulk (awinmid=4822, awinaffid=2919631)
const AWIN_AFFID = '2919631'
const BULK_MID = '4822'

// MyProtein refer-a-friend code. Applied via THG's standard `applyCode` query
// param so the product deep-link is preserved and the referral still tracks.
const MYPROTEIN_REF = 'TOBIAS-R1I5'

// Exposed for the /deals page, which surfaces the real code to copy directly.
export const MYPROTEIN_REF_CODE = MYPROTEIN_REF

function isMyProtein(brand: string): boolean {
  return brand.toLowerCase().replace(/\s+/g, '') === 'myprotein'
}

function withApplyCode(url: string): string {
  if (url.includes('applyCode=')) return url
  return `${url}${url.includes('?') ? '&' : '?'}applyCode=${MYPROTEIN_REF}`
}

/**
 * MyProtein buy link: keeps the verified product-page deep link when present and
 * appends the referral code; otherwise sends to the referral landing page.
 */
export function myproteinLink(directUrl?: string | null): string {
  const base = directUrl && directUrl.trim()
    ? directUrl.trim()
    : 'https://www.myprotein.com/referrals.list'
  return withApplyCode(base)
}

export function amazonSearch(brand: string, name: string): string {
  const q = encodeURIComponent(`${brand} ${name}`.trim())
  const tag = AMAZON_TAG ? `&tag=${encodeURIComponent(AMAZON_TAG)}` : ''
  return `https://www.amazon.co.uk/s?k=${q}${tag}`
}

export function bulkSearch(name: string): string {
  const dest = `https://www.bulk.com/uk/search?q=${encodeURIComponent(name.trim())}`
  return `https://www.awin1.com/cread.php?awinmid=${BULK_MID}&awinaffid=${AWIN_AFFID}&ued=${encodeURIComponent(dest)}`
}

/**
 * Awin-tracked deep link to Bulk's live offers page. Used by the /deals hub so
 * "shop current Bulk deals" carries the real affiliate credential — no fabricated
 * code, just the retailer's own current promotions.
 */
export function bulkDealsLink(): string {
  const dest = 'https://www.bulk.com/uk/offers.list'
  return `https://www.awin1.com/cread.php?awinmid=${BULK_MID}&awinaffid=${AWIN_AFFID}&ued=${encodeURIComponent(dest)}`
}

/**
 * Resolve the buy link for a product, or null when the catalogue holds no
 * verified direct product-page URL (TLL-P0-2). Callers must hide the buy CTA
 * when this returns null — we no longer fall back to a retailer search, a
 * referral landing page or any other guessed destination. `brand`/`name` are
 * retained so call sites and tracking events stay unchanged; MyProtein links
 * still carry the referral code.
 */
export function buyLink(brand: string, _name: string, directUrl?: string | null): string | null {
  const direct = directUrl?.trim()
  if (!direct) return null
  if (isMyProtein(brand)) return myproteinLink(direct)
  return direct
}
