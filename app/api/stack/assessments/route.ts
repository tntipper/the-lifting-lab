import { parseShareProductIds } from '@/lib/share-products'
import { getShareProducts } from '@/lib/share-products-server'

// Read-only public catalogue projection. Like the image route, accepts only
// bounded IDs and resolves active identity and score on the server.
export async function GET(request: Request) {
  const ids = parseShareProductIds(new URL(request.url).searchParams)
  const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }
  if (ids === null) return Response.json({ error: 'Invalid product IDs' }, { status: 400, headers })
  const result = await getShareProducts(ids)
  return result.ok
    ? Response.json({ products: result.products }, { headers })
    : Response.json({ error: result.error }, { status: result.status, headers })
}
