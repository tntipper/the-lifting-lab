import { createStagingPostgresRuntime, STAGING_POSTGRES_PROJECT_REF } from '@/lib/server/staging-postgres'
import { createAesGcmEnvelopeVault } from '@/lib/identity/customer-token-vault'
import { createServerSupabase } from '@/lib/supabase-server'
import { vercelClientIdentity } from '@/lib/submissions/gateway'
import { createCartHandler } from './staging-cart-http'
import { createCartRepository } from './staging-cart-repository'
import { createCartService, emptyCart } from './staging-cart-service'
import { createStagingStorefront, STAGING_CART_SHOP } from './staging-cart-storefront'

const unavailable = () => Response.json({ ...emptyCart(), productId: null, subtotalPence: null, state: 'unavailable', message: 'Test cart unavailable.' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
/** All configuration is server-owned. No request can supply a provider URL/key or enable transport. */
export async function stagingCartRoute(request: Request): Promise<Response> {
  if (process.env.NEXT_PUBLIC_TLL_ENVIRONMENT !== 'staging' || process.env.NEXT_PUBLIC_TLL_STAGING_CART !== 'enabled'
    || process.env.TLL_STAGING_CART_ENABLED !== 'true' || process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL !== '1') return unavailable()
  const origin = process.env.TLL_STAGING_CART_ORIGIN ?? '', projectRef = process.env.TLL_STAGING_SUPABASE_PROJECT_REF ?? ''
  const caPem = process.env.TLL_STAGING_POSTGRES_CA_PEM ?? '', caSha = process.env.TLL_STAGING_POSTGRES_CA_SHA256 ?? ''
  const keyHex = process.env.TLL_STAGING_CART_VAULT_KEY_HEX ?? '', hmacKeyHex = process.env.TLL_STAGING_CART_HMAC_KEY_HEX ?? ''
  if (!/^https:\/\/the-lifting-[a-z0-9-]+-my-lifting-lab-s-projects\.vercel\.app$/.test(origin)
    || projectRef !== STAGING_POSTGRES_PROJECT_REF || process.env.NEXT_PUBLIC_SUPABASE_URL !== `https://${projectRef}.supabase.co`
    || !caPem || !/^[a-f0-9]{64}$/.test(caSha)
    || process.env.TLL_STAGING_CART_SHOP !== STAGING_CART_SHOP || !/^[a-f0-9]{64}$/.test(keyHex)
    || !/^[a-f0-9]{64}$/.test(hmacKeyHex) || keyHex === hmacKeyHex || !process.env.TLL_STAGING_CART_VAULT_KEY_ID) return unavailable()
  let database: ReturnType<typeof createStagingPostgresRuntime> | undefined
  let vault: ReturnType<typeof createAesGcmEnvelopeVault> | undefined
  try {
    vault = createAesGcmEnvelopeVault({ activeKeyId: process.env.TLL_STAGING_CART_VAULT_KEY_ID,
      keys: new Map([[process.env.TLL_STAGING_CART_VAULT_KEY_ID, Buffer.from(keyHex, 'hex')]]) })
    database = createStagingPostgresRuntime({ purpose: 'cart', enabled: true, password: process.env.TLL_STAGING_CART_DATABASE_PASSWORD, tlsCa: { pem: caPem, sha256: caSha } })
    if (!database.enabled) return unavailable()
    const repository = createCartRepository({ enabled: true, pool: database.pool })
    const buyerIp = vercelClientIdentity(request, { vercel: process.env.VERCEL, vercelEnvironment: process.env.VERCEL_ENV })?.replace(/^\[|\]$/g, '')
    const storefront = createStagingStorefront({ enabled: true, environment: 'staging', shop: STAGING_CART_SHOP,
      privateToken: process.env.TLL_STAGING_CART_STOREFRONT_TOKEN ?? '', transport: fetch, buyerIp })
    const handler = createCartHandler({ enabled: true, origin, hmacKeyHex,
      service: createCartService({ repository, storefront, vault, context: [projectRef, STAGING_CART_SHOP, origin] }),
      currentActor: async () => {
        const client = await createServerSupabase(), { data, error } = await client.auth.getUser()
        if (error && error.name !== 'AuthSessionMissingError') throw new Error('Account context unavailable')
        return data.user?.id ?? null
      },
    })
    return await handler(request)
  } catch { return Response.json({ ...emptyCart(), productId: null, subtotalPence: null, state: 'unavailable', message: 'Test cart unavailable.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } }) }
  finally { vault?.destroy(); await database?.close().catch(() => {}) }
}
