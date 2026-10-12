import { createStockPriceHandler } from '@/lib/commerce/harness/stock-price-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const GET = createStockPriceHandler({ env: () => process.env })
