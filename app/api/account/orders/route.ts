import { stagingCustomerRoute } from '@/lib/server/staging-customer-route'

export const dynamic = 'force-dynamic'
export const GET = (request: Request) => stagingCustomerRoute(request, 'orders')
