import { NextResponse } from 'next/server'
import { buildStagingCheckoutReadinessResponse } from './contract'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const response = buildStagingCheckoutReadinessResponse({
    env: process.env,
    deploymentHeader: request.headers.get('x-tll-deployment-id'),
    publicEnvironmentValue: process.env.NEXT_PUBLIC_TLL_ENVIRONMENT,
    publicCustomerValue: process.env.NEXT_PUBLIC_TLL_STAGING_CUSTOMER,
    publicCartValue: process.env.NEXT_PUBLIC_TLL_STAGING_CART,
  })
  return NextResponse.json(response.body, { status: response.status, headers: response.headers })
}
