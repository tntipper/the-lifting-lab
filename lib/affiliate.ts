// Centralised affiliate link construction.
// Bulk products route through Awin deeplinks; everything else goes to Amazon.
//
// Set NEXT_PUBLIC_AMAZON_TAG in the environment (e.g. `theliftinglab-21`).
// If it is unset, links still work; they just carry no tracking tag.

const AMAZON_TAG = process.env.NEXT_PUBLIC_AMAZON_TAG?.trim() || 'theliftinglab-21'

// Awin credentials for Bulk (awinmid=4822, awinaffid=2919631)
const AWIN_AFFID = '2919631'
const BULK_MID = '4822'

// MyProtein refer-a-friend code. Applied via THG's standard `applyCode` query
// param so the product deep-link is preserved and the referral still tracks.
const MYPROTEIN_REF = 'TOBIAS-R1I5'

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
 * Resolve the best buy link for a product.
 * Prefers a verified direct product-page URL when present; otherwise falls back
 * to a retailer search (Awin/Bulk for Bulk products, Amazon for everything else).
 */
export function buyLink(brand: string, name: string, directUrl?: string | null): string {
  if (isMyProtein(brand)) return myproteinLink(directUrl)
  if (directUrl && directUrl.trim()) return directUrl.trim()
  if (brand.toLowerCase() === 'bulk') return bulkSearch(name)
  return amazonSearch(brand, name)
}
