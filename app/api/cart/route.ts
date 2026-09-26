import { stagingCartRoute } from '@/lib/commerce/staging-cart-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const GET = stagingCartRoute
export const POST = stagingCartRoute
export const PATCH = stagingCartRoute
export const DELETE = stagingCartRoute
