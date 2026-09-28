/** One protected, read-only Shopify staging-variant price proof before surface activation. */
import { createStagingGeneration23ProtectedFetch } from './staging-generation-23-protected-fetch.mjs'

export const STAGING_GENERATION_23_VARIANT_READINESS_READER_ENABLED = false
export const STAGING_VARIANT_ID = 'gid://shopify/ProductVariant/57160491139412'
const unavailable = () => { throw Error('Generation 23 variant readiness unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

export function createStagingGeneration23VariantReadinessReader({ fetch: fetcher, bypass,
  deploymentId, immutableUrl, createProtected = createStagingGeneration23ProtectedFetch,
  now = Date.now } = {}) {
  if (!STAGING_GENERATION_23_VARIANT_READINESS_READER_ENABLED || typeof fetcher !== 'function'
    || !Buffer.isBuffer(bypass) || !/^dpl_[A-Za-z0-9]+$/.test(deploymentId ?? '')
    || !/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(immutableUrl ?? '')
    || typeof createProtected !== 'function' || typeof now !== 'function') unavailable()
  const protectedReader = createProtected({ fetch: fetcher, bypass, immutableUrl, maxReads: 1 })
  if (!protectedReader || typeof protectedReader.fetch !== 'function'
    || typeof protectedReader.dispose !== 'function') unavailable()
  let used = false
  return Object.freeze({
    async read({ variantId, signal } = {}) {
      if (used || variantId !== STAGING_VARIANT_ID || !signal || signal.aborted
        || typeof signal.addEventListener !== 'function') unavailable()
      used = true
      const url = `${immutableUrl}/api/staging/variant-readiness`
      try {
        const response = await protectedReader.fetch(url, { method: 'GET', redirect: 'error',
          headers: { 'x-tll-deployment-id': deploymentId }, signal })
        if (response.status !== 200 || response.redirected || response.url && response.url !== url
          || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) unavailable()
        const value = await response.json()
        const observed = Date.parse(value?.observedAt), clock = now()
        if (!exact(value, ['status', 'deploymentId', 'immutableUrl', 'variantId', 'pricePence', 'observedAt'])
          || value.status !== 'SHOPIFY_STAGING_VARIANT_PRICE_VERIFIED'
          || value.deploymentId !== deploymentId || value.immutableUrl !== immutableUrl
          || value.variantId !== variantId || !Number.isSafeInteger(value.pricePence)
          || value.pricePence < 1 || value.pricePence > 1_000_000
          || !Number.isFinite(observed) || observed > clock || clock - observed > 5 * 60_000) unavailable()
        return Object.freeze({ status: value.status, variantId, pricePence: value.pricePence,
          observedAt: value.observedAt })
      } catch { unavailable() }
    },
    dispose() { protectedReader.dispose() },
  })
}
