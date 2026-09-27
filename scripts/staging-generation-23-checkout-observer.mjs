/** Disabled final browser step: observe staging checkout without any mutating request. */
export const STAGING_GENERATION_23_CHECKOUT_OBSERVER_ENABLED = false

const SHOP = 'tll-integration-staging.myshopify.com'
const ASSET_HOSTS = new Set(['cdn.shopify.com'])
const unavailable = () => { throw Error('Generation 23 checkout observation unavailable') }

function pinnedCheckoutUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) unavailable()
  let url
  try { url = new URL(value) } catch { unavailable() }
  if (url.protocol !== 'https:' || url.hostname !== SHOP || url.username || url.password
    || url.port || url.search || url.hash || !/^\/cart\/c\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) unavailable()
  return url.href
}

/**
 * Install before navigation. The route remains in place until the caller closes
 * the browser context; a later click cannot silently turn into a purchase.
 * A trusted parent must stop this browser child at its phase deadline.
 */
export async function observeStagingCheckout({ page, checkoutUrl, signal, deadlineAt } = {}) {
  if (!STAGING_GENERATION_23_CHECKOUT_OBSERVER_ENABLED || !page
    || typeof page.route !== 'function' || typeof page.goto !== 'function'
    || typeof page.url !== 'function' || !signal
    || typeof signal.addEventListener !== 'function' || signal.aborted
    || typeof deadlineAt !== 'string') unavailable()
  const destination = pinnedCheckoutUrl(checkoutUrl)
  const remaining = Date.parse(deadlineAt) - Date.now()
  if (!Number.isFinite(remaining) || remaining < 1 || remaining > 10 * 60_000) unavailable()
  let rejected = 0
  const block = async route => {
    try {
      const request = route.request(), url = new URL(request.url())
      const navigation = request.isNavigationRequest()
      if (signal.aborted || !['GET', 'HEAD'].includes(request.method())
        || url.protocol !== 'https:' || url.username || url.password
        || navigation && url.href !== destination
        || !navigation && url.hostname !== SHOP && !ASSET_HOSTS.has(url.hostname)
          && !url.hostname.endsWith('.shopifycdn.com')) {
        rejected++
        await route.abort('blockedbyclient')
        return
      }
      const headers = { ...request.headers() }
      delete headers.referer
      await route.fallback({ headers })
    } catch {
      rejected++
      try { await route.abort('blockedbyclient') } catch { /* browser may already have closed */ }
    }
  }
  // The guard is deliberately not removed after page load. The owner must not
  // submit an order; even an accidental click cannot issue POST/PATCH/DELETE.
  await page.route('**/*', block)
  if (signal.aborted || Date.now() >= Date.parse(deadlineAt)) unavailable()
  const response = await page.goto(destination, { waitUntil: 'domcontentloaded', timeout: Math.min(remaining, 30_000), referer: '' })
  const final = new URL(page.url())
  if (signal.aborted || Date.now() >= Date.parse(deadlineAt) || rejected
    || !response || typeof response.status !== 'function' || response.status() !== 200
    || final.protocol !== 'https:' || final.hostname !== SHOP || final.username
    || final.password || final.port || !/^\/cart\/c\/[A-Za-z0-9_-]+\/?$/.test(final.pathname)) unavailable()
  return Object.freeze({ status: 'STAGING_CHECKOUT_OBSERVED_NO_MUTATION', shop: SHOP })
}
