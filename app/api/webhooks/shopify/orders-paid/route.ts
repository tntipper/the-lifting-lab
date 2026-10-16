import { createOrdersPaidHandler } from '@/lib/commerce/harness/orders-paid-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Deliberately unbound: enabling the flag alone cannot construct a live client.
export const POST = createOrdersPaidHandler({ env: () => process.env })
