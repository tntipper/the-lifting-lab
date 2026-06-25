import type { MetadataRoute } from 'next'

const BASE = 'https://www.theliftinglab.co.uk'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/auth', '/api/'],
    },
    sitemap: `${BASE}/sitemap.xml`,
  }
}
