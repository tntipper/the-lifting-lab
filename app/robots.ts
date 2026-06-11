import type { MetadataRoute } from 'next'

const BASE = 'https://the-lifting-lab.vercel.app'

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
