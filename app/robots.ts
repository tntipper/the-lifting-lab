import { isSyntheticPreview } from '@/lib/preview-mode'
import type { MetadataRoute } from 'next'

const BASE = 'https://www.theliftinglab.co.uk'

export default function robots(): MetadataRoute.Robots {
  if (isSyntheticPreview()) return { rules: { userAgent: '*', disallow: '/' } }
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/auth', '/api/'],
    },
    sitemap: `${BASE}/sitemap.xml`,
  }
}
