import { stagingCustomerRoute } from '@/lib/server/staging-customer-route'

export const dynamic = 'force-dynamic'
export const POST = (request: Request) => stagingCustomerRoute(request, 'prepare')
