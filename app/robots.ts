import { isIsolatedEnvironment } from '@/lib/preview-mode'
import { AGENT_CRAWLERS, PRIVATE_PATHS, noIndexDeployment } from '@/lib/seo-crawlers'

const SITE_URL = 'https://theliftinglab.co.uk'
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  if (isIsolatedEnvironment() || noIndexDeployment()) return { rules: { userAgent: '*', disallow: '/' } }
  return {
    rules: ['*', ...AGENT_CRAWLERS].map(userAgent => ({ userAgent, allow: '/', disallow: PRIVATE_PATHS })),
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
