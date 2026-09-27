/** Disabled, owner-assisted browser journey for one protected Gen23 staging build. */
import { chromium } from 'playwright'
import { observeStagingCheckout } from './staging-generation-23-checkout-observer.mjs'

export const STAGING_GENERATION_23_OWNER_JOURNEY_ENABLED = false
export const OWNER_EMAIL = 'toby@theliftinglab.co.uk'
export const PRODUCT_ID = '40000000-0000-4000-8000-000000000001'
const SHOP = 'tll-integration-staging.myshopify.com'
const unavailable = () => { throw Error('Generation 23 owner journey unavailable') }
const exactPreview = url => typeof url === 'string'
  && /^https:\/\/the-lifting-[a-z0-9-]+-my-lifting-lab-s-projects\.vercel\.app$/.test(url)
const validBypass = value => Buffer.isBuffer(value) && value.length >= 8 && value.length <= 1024
  && /^[\x21-\x7e]+$/.test(value.toString('utf8'))
const money = pence => `£${(pence / 100).toFixed(2)}`

/** Vercel's bypass header must never be sent to Shopify or another origin. */
export async function installProtectedPreviewRoute(context, immutableUrl, bypass) {
  if (!STAGING_GENERATION_23_OWNER_JOURNEY_ENABLED || !exactPreview(immutableUrl)
    || !validBypass(bypass) || typeof context?.route !== 'function') unavailable()
  await context.route('**/*', async route => {
    try {
      const request = route.request(), url = new URL(request.url())
      if (url.origin === immutableUrl) {
        const headers = { ...request.headers(), 'x-vercel-protection-bypass': bypass.toString('utf8') }
        delete headers.referer
        await route.fallback({ headers })
      } else if (url.hostname === 'theliftinglab.co.uk' || url.hostname === 'www.theliftinglab.co.uk'
        || url.hostname === 'shop.theliftinglab.co.uk'
        || !['GET', 'HEAD'].includes(request.method())
          && !(url.hostname === 'accounts.shopify.com'
            || url.hostname === 'shopify.com'
              && /^\/authentication\/107532616020(?:\/|$)/.test(url.pathname))) {
        await route.abort('blockedbyclient')
      } else {
        const headers = { ...request.headers() }
        delete headers['x-vercel-protection-bypass']
        await route.fallback({ headers })
      }
    } catch { try { await route.abort('blockedbyclient') } catch {} }
  })
}

/** The owner enters any Shopify email code in the visible browser; the worker never receives it. */
export async function runStagingGeneration23OwnerJourney({ immutableUrl, bypass,
  expectedUnitPricePence, signal, deadlineAt, launch = options => chromium.launch(options),
  checkoutObserver = observeStagingCheckout } = {}) {
  const remaining = Date.parse(deadlineAt) - Date.now()
  if (!STAGING_GENERATION_23_OWNER_JOURNEY_ENABLED || !exactPreview(immutableUrl)
    || !validBypass(bypass) || !Number.isSafeInteger(expectedUnitPricePence)
    || expectedUnitPricePence < 1 || expectedUnitPricePence > 1_000_000
    || !signal || signal.aborted || typeof signal.addEventListener !== 'function'
    || !Number.isFinite(remaining) || remaining < 1 || remaining > 10 * 60_000
    || typeof launch !== 'function' || typeof checkoutObserver !== 'function') unavailable()
  let browser, accountContext, signedOutContext, checkoutContext, step = 'launch'
  const timeout = Math.min(remaining, 9 * 60_000)
  const closed = () => { try { void Promise.resolve(browser?.close()).catch(() => {}) } catch {} }
  signal.addEventListener('abort', closed, { once: true })
  const deadlineTimer = setTimeout(closed, remaining)
  try {
    browser = await launch({ channel: 'chrome', headless: false })
    if (signal.aborted) unavailable()
    step = 'guest_cart'
    accountContext = await browser.newContext({ serviceWorkers: 'block' })
    await installProtectedPreviewRoute(accountContext, immutableUrl, bypass)
    const page = await accountContext.newPage()
    await page.goto(`${immutableUrl}/products/${PRODUCT_ID}`,
      { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.getByRole('button', { name: 'Add to test cart' }).click({ timeout: 15_000 })
    const guestCart = page.getByRole('dialog', { name: 'Test cart', exact: true })
    await guestCart.getByText('Quantity: 1', { exact: true }).waitFor({ timeout: 15_000 })
    await guestCart.getByText(`Listed test price per item: ${money(expectedUnitPricePence)}`,
      { exact: true }).waitFor({ timeout: 15_000 })
    step = 'owner_sign_in'
    await page.goto(`${immutableUrl}/auth/customer`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForURL(`${immutableUrl}/dashboard`, { timeout })
    if (signal.aborted || Date.now() >= Date.parse(deadlineAt)) unavailable()
    await page.getByText(OWNER_EMAIL, { exact: true }).waitFor({ timeout: 15_000 })
    await page.goto(`${immutableUrl}/account/orders`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.getByRole('heading', { name: 'My orders' }).waitFor({ timeout: 15_000 })
    await page.getByText('No shop orders yet.').or(page.locator('main article'))
      .first().waitFor({ timeout: 15_000 })

    step = 'signed_out_order_isolation'
    signedOutContext = await browser.newContext({ serviceWorkers: 'block' })
    await installProtectedPreviewRoute(signedOutContext, immutableUrl, bypass)
    const signedOutPage = await signedOutContext.newPage()
    const denied = await signedOutPage.goto(`${immutableUrl}/api/account/orders`,
      { waitUntil: 'domcontentloaded', timeout: 30_000 })
    if (!denied || ![401, 403, 409].includes(denied.status())) unavailable()
    await signedOutContext.close(); signedOutContext = undefined

    step = 'explicit_guest_cart_transfer'
    await page.goto(`${immutableUrl}/products/${PRODUCT_ID}`,
      { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.getByRole('button', { name: /^Test cart, / }).click({ timeout: 15_000 })
    const cart = page.getByRole('dialog', { name: 'Test cart', exact: true })
    await cart.waitFor({ timeout: 15_000 })
    await cart.getByRole('button', { name: 'Connect guest cart' }).click({ timeout: 15_000 })
    await cart.getByRole('button', { name: 'Prepare staging checkout' }).waitFor({ timeout: 15_000 })
    await cart.getByText('Quantity: 1', { exact: true }).waitFor({ timeout: 15_000 })
    await cart.getByText(`Listed test price per item: ${money(expectedUnitPricePence)}`,
      { exact: true }).waitFor({ timeout: 15_000 })
    await cart.getByText(money(expectedUnitPricePence), { exact: true }).waitFor({ timeout: 15_000 })
    step = 'checkout_handoff'
    await cart.getByRole('button', { name: 'Prepare staging checkout' }).click({ timeout: 15_000 })
    const link = cart.getByRole('link', { name: 'Open staging checkout in a new tab' })
    await link.waitFor({ timeout: 15_000 })
    const checkoutUrl = await link.getAttribute('href')
    if (!checkoutUrl || signal.aborted || Date.now() >= Date.parse(deadlineAt)) unavailable()

    step = 'guarded_checkout_observation'
    checkoutContext = await browser.newContext({ serviceWorkers: 'block' })
    const checkoutPage = await checkoutContext.newPage()
    const observed = await checkoutObserver({ page: checkoutPage, checkoutUrl, signal, deadlineAt })
    if (observed?.status !== 'STAGING_CHECKOUT_OBSERVED_NO_MUTATION'
      || observed.shop !== SHOP) unavailable()
    await checkoutPage.getByText(money(expectedUnitPricePence), { exact: true })
      .first().waitFor({ timeout: 15_000 })
    if (signal.aborted || Date.now() >= Date.parse(deadlineAt)) unavailable()
    return Object.freeze({ status: 'OWNER_JOURNEY_VERIFIED_NO_PURCHASE',
      account: 'owner_identity_and_orders', cart: 'explicit_guest_transfer_mapped_product_and_price',
      checkout: 'staging_get_only' })
  } catch { throw Error(`Generation 23 owner journey unavailable at ${step}`) }
  finally {
    clearTimeout(deadlineTimer)
    signal.removeEventListener('abort', closed)
    for (const context of [checkoutContext, signedOutContext, accountContext]) {
      try { await context?.close() } catch {}
    }
    try { await browser?.close() } catch {}
  }
}
