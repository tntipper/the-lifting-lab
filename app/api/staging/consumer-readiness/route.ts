import { NextResponse } from 'next/server'
import { buildStagingReadinessResponse } from '../readiness/contract'
import { checkStagingWebsiteConsumers } from '@/lib/server/staging-consumer-readiness'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' }

/** One fixed, read-only identity query per website role while customer controls are OFF. */
export async function GET(request: Request) {
  const readiness = buildStagingReadinessResponse({ env: process.env,
    deploymentHeader: request.headers.get('x-tll-deployment-id'),
    publicEnvironmentValue: process.env.NEXT_PUBLIC_TLL_ENVIRONMENT,
    publicCustomerValue: process.env.NEXT_PUBLIC_TLL_STAGING_CUSTOMER,
    publicCartValue: process.env.NEXT_PUBLIC_TLL_STAGING_CART })
  if (readiness.status !== 200 || readiness.body.privateCustomer || readiness.body.privateCart
    || readiness.body.publicCustomer || readiness.body.publicCart)
    return NextResponse.json({ status: 'held' }, { status: 404, headers })
  const result = await checkStagingWebsiteConsumers(process.env)
  if (!result) return NextResponse.json({ status: 'held' }, { status: 404, headers })
  return NextResponse.json({ ...result, deploymentId: readiness.body.deploymentId },
    { status: result.status === 'PASS' ? 200 : 503, headers })
}
