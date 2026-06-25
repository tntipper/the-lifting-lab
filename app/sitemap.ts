import type { MetadataRoute } from 'next'
import { GUIDE_SLUGS } from '@/lib/guides'
import { INGREDIENT_SLUGS } from '@/lib/ingredients'
import { createPublicClient } from '@/lib/supabase-public'
import { brandSlug } from '@/lib/brands'
import { PRODUCT_COLUMNS, withScore, type Product } from '@/lib/products'
import { curatedMatchups } from '@/lib/matchups'

const BASE = 'https://www.theliftinglab.co.uk'

// Refresh daily so newly added/removed products flow into the sitemap.
export const revalidate = 86400

async function productEntries(now: Date): Promise<MetadataRoute.Sitemap> {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb.from('products').select('id').eq('status', 'active')
    if (error || !data) return []
    return (data as { id: string }[]).map((p) => ({
      url: `${BASE}/products/${p.id}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }))
  } catch {
    return []
  }
}

async function brandEntries(now: Date): Promise<MetadataRoute.Sitemap> {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb.from('products').select('brand').eq('status', 'active')
    if (error || !data) return []
    const slugs = new Set<string>()
    for (const row of data as { brand: string | null }[]) {
      if (row.brand && row.brand.trim()) slugs.add(brandSlug(row.brand))
    }
    return Array.from(slugs).map((slug) => ({
      url: `${BASE}/brand/${slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }))
  } catch {
    return []
  }
}

async function matchupEntries(now: Date): Promise<MetadataRoute.Sitemap> {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb.from('products').select(PRODUCT_COLUMNS).eq('status', 'active')
    if (error || !data) return []
    const scored = (data as Product[]).map((p) => {
      const s = withScore(p)
      return { id: p.id, name: p.name, brand: p.brand, category: p.category, score: s.score }
    })
    return curatedMatchups(scored).map((m) => ({
      url: `${BASE}/vs/${m.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }))
  } catch {
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/products`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE}/best`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE}/brand`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/vs`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/wizard`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/calculators`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/compare`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE}/guide`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/ingredients`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
  ]

  const guidePages: MetadataRoute.Sitemap = GUIDE_SLUGS.map((slug) => ({
    url: `${BASE}/guide/${slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  const ingredientPages: MetadataRoute.Sitemap = INGREDIENT_SLUGS.map((slug) => ({
    url: `${BASE}/ingredients/${slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  const productPages = await productEntries(now)
  const brandPages = await brandEntries(now)
  const matchupPages = await matchupEntries(now)

  return [...staticPages, ...guidePages, ...ingredientPages, ...brandPages, ...matchupPages, ...productPages]
}
