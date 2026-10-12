import { createTrackingHandler } from '@/lib/commerce/harness/tracking-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const GET = createTrackingHandler({ env: () => process.env })
