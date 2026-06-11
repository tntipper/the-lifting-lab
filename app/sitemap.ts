import type { MetadataRoute } from 'next'
import { GUIDE_SLUGS } from '@/lib/guides'

const BASE = 'https://the-lifting-lab.vercel.app'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/products`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE}/compare`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE}/guide`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
  ]

  const guidePages: MetadataRoute.Sitemap = GUIDE_SLUGS.map((slug) => ({
    url: `${BASE}/guide/${slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  return [...staticPages, ...guidePages]
}
