// Centralised affiliate link construction.
// Buy buttons point at an Amazon.co.uk search for the product, tagged with our
// Amazon Associates store ID so qualifying purchases earn commission.
//
// Set NEXT_PUBLIC_AMAZON_TAG in the environment (e.g. `theliftinglab-21`).
// If it is unset, links still work; they just carry no tracking tag.

const AMAZON_TAG = process.env.NEXT_PUBLIC_AMAZON_TAG?.trim() || 'theliftinglab-21'

export function amazonSearch(brand: string, name: string): string {
  const q = encodeURIComponent(`${brand} ${name}`.trim())
  const tag = AMAZON_TAG ? `&tag=${encodeURIComponent(AMAZON_TAG)}` : ''
  return `https://www.amazon.co.uk/s?k=${q}${tag}`
}
