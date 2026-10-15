import { fetchCatalogue } from '@/lib/product-data'
import { productsFeed, noIndexDeployment } from '@/lib/seo'
import { isIsolatedEnvironment } from '@/lib/preview-mode'
import { isRedirectedProduct } from '@/lib/product-size-redirects'

export const revalidate = 900

export async function GET() {
  const products = (await fetchCatalogue()).filter(p => !isRedirectedProduct(p.id))
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=900, must-revalidate',
    ...((isIsolatedEnvironment() || noIndexDeployment()) ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}) }
  return Response.json(productsFeed(products), { headers })
}
