// Brand helpers for the /brand hub pages.
// Brands are not a fixed list — they come from the Supabase `brand` column — so
// we derive a URL-safe slug from the brand name and resolve it back by matching
// slugs over the live product set (no reverse lookup table to drift).

/**
 * Turn a brand name into a stable, URL-safe slug.
 * "Optimum Nutrition" -> "optimum-nutrition", "PhD & Co" -> "phd-and-co".
 */
export function brandSlug(brand: string): string {
  return brand
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export type BrandSummary = {
  brand: string
  slug: string
  count: number
  categories: string[]
  avgScore: number | null
  bestScore: number | null
}
