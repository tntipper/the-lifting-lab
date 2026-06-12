// Centralised affiliate link construction.
// Bulk products route through Awin deeplinks; everything else goes to Amazon.
//
// Set NEXT_PUBLIC_AMAZON_TAG in the environment (e.g. `theliftinglab-21`).
// If it is unset, links still work; they just carry no tracking tag.

const AMAZON_TAG = process.env.NEXT_PUBLIC_AMAZON_TAG?.trim() || 'theliftinglab-21'

// Awin credentials for Bulk (awinmid=4822, awinaffid=2919631)
const AWIN_AFFID = '2919631'
const BULK_MID = '4822'

export function amazonSearch(brand: string, name: string): string {
  const q = encodeURIComponent(`${brand} ${name}`.trim())
  const tag = AMAZON_TAG ? `&tag=${encodeURIComponent(AMAZON_TAG)}` : ''
  return `https://www.amazon.co.uk/s?k=${q}${tag}`
}

export function bulkSearch(name: string): string {
  const dest = `https://www.bulk.com/uk/search?q=${encodeURIComponent(name.trim())}`
  return `https://www.awin1.com/cread.php?awinmid=${BULK_MID}&awinaffid=${AWIN_AFFID}&ued=${encodeURIComponent(dest)}`
}

/** Route to the correct affiliate link based on brand. */
export function buyLink(brand: string, name: string): string {
  if (brand.toLowerCase() === 'bulk') return bulkSearch(name)
  return amazonSearch(brand, name)
}
