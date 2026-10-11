import { NextResponse } from 'next/server'
import { buildStagingReadinessResponse } from '../readiness/contract'
import { createStagingStorefront, STAGING_CART_SHOP, STAGING_SHOPIFY_VARIANT } from '@/lib/commerce/staging-cart-storefront'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' }

/** Protected Preview only. This makes one read-only query to the fixed staging variant. */
export async function GET(request: Request) {
  const readiness = buildStagingReadinessResponse({
    env: process.env,
    deploymentHeader: request.headers.get('x-tll-deployment-id'),
    publicEnvironmentValue: process.env.NEXT_PUBLIC_TLL_ENVIRONMENT,
    publicCustomerValue: process.env.NEXT_PUBLIC_TLL_STAGING_CUSTOMER,
    publicCartValue: process.env.NEXT_PUBLIC_TLL_STAGING_CART,
  })
  if (readiness.status !== 200 || process.env.TLL_STAGING_CART_SHOP !== STAGING_CART_SHOP) {
    return NextResponse.json({ status: 'held' }, { status: 404, headers })
  }
  try {
    const storefront = createStagingStorefront({
      enabled: true, environment: 'staging', shop: STAGING_CART_SHOP,
      privateToken: process.env.TLL_STAGING_CART_STOREFRONT_TOKEN ?? '', transport: fetch,
    })
    const pricePence = await storefront.readVariantPrice()
    return NextResponse.json({
      status: 'SHOPIFY_STAGING_VARIANT_PRICE_VERIFIED',
      deploymentId: readiness.body.deploymentId,
      immutableUrl: readiness.body.immutableUrl,
      variantId: STAGING_SHOPIFY_VARIANT,
      pricePence,
      observedAt: new Date().toISOString(),
    }, { status: 200, headers })
  } catch {
    return NextResponse.json({ status: 'unavailable' }, { status: 503, headers })
  }
}
