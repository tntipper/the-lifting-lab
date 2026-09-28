/** Disabled final browser step: observe staging checkout without any mutating request. */
export const STAGING_GENERATION_23_CHECKOUT_OBSERVER_ENABLED = true

const SHOP = 'tll-integration-staging.myshopify.com'
const ASSET_HOSTS = new Set(['cdn.shopify.com'])
const unavailable = () => { throw Error('Generation 23 checkout observation unavailable') }

function pinnedCheckoutUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) unavailable()
  let url
  try { url = new URL(value) } catch { unavailable() }
  const key = url.searchParams.get('key')
  if (url.protocol !== 'https:' || url.hostname !== SHOP || url.username || url.password
    || url.port || url.hash || !/^\/cart\/c\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
    || url.search && (url.searchParams.size !== 1 || key === null || !/^[A-Za-z0-9_-]{1,128}$/.test(key))) unavailable()
  return url.href
}

function safeCheckoutNavigation(url, initial) {
  return url.href === initial || url.protocol === 'https:' && url.hostname === SHOP
    && !url.username && !url.password && !url.port && !url.hash
    && /^\/checkouts?\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\/?$/.test(url.pathname)
    && (!url.search || url.searchParams.size === 1 && [...url.searchParams].every(([name, value]) =>
      name === 'key' && /^[A-Za-z0-9_-]{1,128}$/.test(value)))
}

function remainingMs(deadlineAt) {
  const remaining = Date.parse(deadlineAt) - Date.now()
  if (!Number.isFinite(remaining) || remaining < 1) unavailable()
  return Math.min(remaining, 15_000)
}

/** Resolve only GET redirects, validating each destination before sending it. */
async function finalCheckoutUrl(context, initial, signal, deadlineAt) {
  if (typeof context?.request?.get !== 'function') unavailable()
  let current = initial
  const seen = new Set()
  for (let hop = 0; hop <= 3; hop++) {
    if (signal.aborted || seen.has(current) || !safeCheckoutNavigation(new URL(current), initial)) unavailable()
    seen.add(current)
    let response
    try {
      response = await context.request.get(current, { maxRedirects: 0, maxRetries: 0,
        timeout: remainingMs(deadlineAt), failOnStatusCode: false })
      if (response.status() === 200) return current
      if (![301, 302, 303, 307, 308].includes(response.status()) || hop === 3) unavailable()
      const location = response.headers().location
      if (typeof location !== 'string' || !location) unavailable()
      const next = new URL(location, current)
      if (!safeCheckoutNavigation(next, initial)) unavailable()
      current = next.href
    } catch { unavailable() }
    finally { try { await response?.dispose() } catch {} }
  }
  unavailable()
}

/**
 * Install before navigation. The route remains in place until the caller closes
 * the browser context; a later click cannot silently turn into a purchase.
 * A trusted parent must stop this browser child at its phase deadline.
 */
export async function observeStagingCheckout({ page, checkoutUrl, signal, deadlineAt } = {}) {
  if (!STAGING_GENERATION_23_CHECKOUT_OBSERVER_ENABLED || !page
    || typeof page.context !== 'function' || typeof page.context()?.route !== 'function'
    || typeof page.goto !== 'function'
    || typeof page.url !== 'function' || !signal
    || typeof signal.addEventListener !== 'function' || signal.aborted
    || typeof deadlineAt !== 'string') unavailable()
  const destination = pinnedCheckoutUrl(checkoutUrl)
  const remaining = Date.parse(deadlineAt) - Date.now()
  if (!Number.isFinite(remaining) || remaining < 1 || remaining > 10 * 60_000) unavailable()
  const finalUrl = await finalCheckoutUrl(page.context(), destination, signal, deadlineAt)
  let rejected = 0
  const block = async route => {
    try {
      const request = route.request(), url = new URL(request.url())
      const navigation = request.isNavigationRequest()
      if (signal.aborted || !['GET', 'HEAD'].includes(request.method())
        || url.protocol !== 'https:' || url.username || url.password
        || navigation && url.href !== finalUrl
        || !navigation && url.hostname !== SHOP && !ASSET_HOSTS.has(url.hostname)
          && !url.hostname.endsWith('.shopifycdn.com')) {
        rejected++
        await route.abort('blockedbyclient')
        return
      }
      // Playwright skips route callbacks on browser HTTP redirects. This fetch
      // refuses redirects, so no browser request can silently leave the guard.
      const response = await route.fetch({ maxRedirects: 0, maxRetries: 0,
        timeout: remainingMs(deadlineAt) })
      if (response.status() < 200 || response.status() >= 300) {
        rejected++
        await route.abort('blockedbyclient')
        return
      }
      await route.fulfill({ response })
    } catch {
      rejected++
      try { await route.abort('blockedbyclient') } catch { /* browser may already have closed */ }
    }
  }
  // A context-level route also guards popups and new tabs from checkout. The
  // caller must create a fresh context with service workers blocked and close
  // that whole context after the observation; no page in it may submit payment.
  await page.context().route('**/*', block)
  if (signal.aborted || Date.now() >= Date.parse(deadlineAt)) unavailable()
  const response = await page.goto(finalUrl, { waitUntil: 'domcontentloaded', timeout: remainingMs(deadlineAt), referer: '' })
  const final = new URL(page.url())
  if (signal.aborted || Date.now() >= Date.parse(deadlineAt) || rejected
    || !response || typeof response.status !== 'function' || response.status() !== 200
    || final.protocol !== 'https:' || final.hostname !== SHOP || final.username
    || final.password || final.port || final.href !== finalUrl) unavailable()
  return Object.freeze({ status: 'STAGING_CHECKOUT_OBSERVED_NO_MUTATION', shop: SHOP })
}
