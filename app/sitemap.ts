import type { MetadataRoute } from 'next'
import { GUIDE_SLUGS } from '@/lib/guides'
import { createPublicClient } from '@/lib/supabase-public'

const BASE = 'https://theliftinglab.co.uk'

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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/products`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE}/best`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE}/wizard`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/compare`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE}/guide`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
  ]

  const guidePages: MetadataRoute.Sitemap = GUIDE_SLUGS.map((slug) => ({
    url: `${BASE}/guide/${slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  const productPages = await productEntries(now)

  return [...staticPages, ...guidePages, ...productPages]
}
