/** Disabled, owner-assisted browser journey for one protected Gen23 staging build. */
import { chromium } from 'playwright'
import { observeStagingCheckout } from './staging-generation-23-checkout-observer.mjs'
import { STAGING_ALIAS } from './staging-surface-activation-transport.mjs'
import { STAGING_PROJECT_REF } from './staging-provider-broker-rotation.mjs'

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
const sessionCookie = `sb-${STAGING_PROJECT_REF}-auth-token`
const hasStagingSession = cookies => Array.isArray(cookies) && cookies.some(cookie =>
  cookie.name === sessionCookie || new RegExp(`^${sessionCookie}\\.[0-9]+$`).test(cookie.name))

export function verifyStagingSessionState(cookies, expectedPresent) {
  if (hasStagingSession(cookies) !== expectedPresent) unavailable()
}

export async function verifyOrdersDeniedByApplication(response) {
  if (!response || response.status() !== 409
    || response.headers()['cache-control'] !== 'no-store, private') unavailable()
  let body
  try { body = await response.json() } catch { unavailable() }
  if (!body || Object.keys(body).length !== 1 || body.status !== 'held') unavailable()
}

/** Exchange the bypass once for a browser cookie scoped to the reviewed alias. */
export async function bootstrapProtectedPreviewCookie(context, applicationOrigin, bypass) {
  if (!STAGING_GENERATION_23_OWNER_JOURNEY_ENABLED || applicationOrigin !== STAGING_ALIAS
    || !validBypass(bypass) || typeof context?.request?.get !== 'function'
    || typeof context?.cookies !== 'function') unavailable()
  const target = `${applicationOrigin}/api/staging/readiness`
  let response
  try {
    response = await context.request.get(target, { maxRedirects: 0, timeout: 15_000,
      headers: { 'x-vercel-protection-bypass': bypass.toString('utf8'), 'x-vercel-set-bypass-cookie': 'true' } })
    const location = response.headers().location
    if (typeof location !== 'string' || !location) unavailable()
    const next = new URL(location, target)
    if (![302, 303, 307, 308].includes(response.status()) || next.origin !== applicationOrigin
      || next.searchParams.has('x-vercel-protection-bypass') || next.hash) unavailable()
    const cookies = await context.cookies(applicationOrigin), host = new URL(applicationOrigin).hostname
    if (!cookies.some(cookie => cookie.domain === host && cookie.secure === true
      && cookie.httpOnly === true && cookie.path === '/'
      && typeof cookie.name === 'string' && cookie.name.length > 0
      && typeof cookie.value === 'string' && cookie.value.length > 0)) unavailable()
  } catch { unavailable() }
  finally { try { await response?.dispose() } catch {} }
}

/** A browser cookie is domain-bound; never override request headers across redirects. */
export async function installProtectedPreviewRoute(context, applicationOrigin) {
  if (!STAGING_GENERATION_23_OWNER_JOURNEY_ENABLED || applicationOrigin !== STAGING_ALIAS
    || typeof context?.route !== 'function') unavailable()
  await context.route('**/*', async route => {
    try {
      const request = route.request(), url = new URL(request.url())
      if (request.headers()['x-vercel-protection-bypass']) {
        await route.abort('blockedbyclient'); return
      }
      if (url.origin === applicationOrigin) {
        await route.fallback()
      } else if (url.hostname === 'theliftinglab.co.uk' || url.hostname === 'www.theliftinglab.co.uk'
        || url.hostname === 'shop.theliftinglab.co.uk'
        || !['GET', 'HEAD'].includes(request.method())
          && !(url.hostname === 'accounts.shopify.com'
            || url.hostname === 'shopify.com'
              && /^\/authentication\/107532616020(?:\/|$)/.test(url.pathname))) {
        await route.abort('blockedbyclient')
      } else {
        await route.fallback()
      }
    } catch { try { await route.abort('blockedbyclient') } catch {} }
  })
}

/** The owner enters any Shopify email code in the visible browser; the worker never receives it. */
export async function runStagingGeneration23OwnerJourney({ immutableUrl, applicationOrigin, verifyAlias, bypass,
  expectedUnitPricePence, signal, deadlineAt, launch = options => chromium.launch(options),
  checkoutObserver = observeStagingCheckout } = {}) {
  const remaining = Date.parse(deadlineAt) - Date.now()
  if (!STAGING_GENERATION_23_OWNER_JOURNEY_ENABLED || !exactPreview(immutableUrl)
    || applicationOrigin !== STAGING_ALIAS || typeof verifyAlias !== 'function'
    || !validBypass(bypass) || !Number.isSafeInteger(expectedUnitPricePence)
    || expectedUnitPricePence < 1 || expectedUnitPricePence > 1_000_000
    || !signal || signal.aborted || typeof signal.addEventListener !== 'function'
    || !Number.isFinite(remaining) || remaining < 1 || remaining > 10 * 60_000
    || typeof launch !== 'function' || typeof checkoutObserver !== 'function') unavailable()
  let browser, accountContext, signedOutContext, checkoutContext, step = 'launch'
  let outcome, failed = false, closeFailed = false, logoutStarted = false
  const timeout = Math.min(remaining, 9 * 60_000)
  const closed = () => { try { void Promise.resolve(browser?.close()).catch(() => {}) } catch {} }
  signal.addEventListener('abort', closed, { once: true })
  const deadlineTimer = setTimeout(closed, remaining)
  try {
    browser = await launch({ channel: 'chrome', headless: false })
    if (signal.aborted) unavailable()
    step = 'guest_cart'
    accountContext = await browser.newContext({ serviceWorkers: 'block' })
    await bootstrapProtectedPreviewCookie(accountContext, applicationOrigin, bypass)
    await installProtectedPreviewRoute(accountContext, applicationOrigin)
    const page = await accountContext.newPage()
    await verifyAlias({ signal })
    await page.goto(`${applicationOrigin}/products/${PRODUCT_ID}`,
      { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.getByRole('button', { name: 'Add to test cart' }).click({ timeout: 15_000 })
    const guestCart = page.getByRole('dialog', { name: 'Test cart', exact: true })
    await guestCart.getByText('Quantity: 1', { exact: true }).waitFor({ timeout: 15_000 })
    await guestCart.getByText(`Listed test price per item: ${money(expectedUnitPricePence)}`,
      { exact: true }).waitFor({ timeout: 15_000 })
    step = 'owner_sign_in'
    await verifyAlias({ signal })
    await page.goto(`${applicationOrigin}/auth/customer`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForURL(`${applicationOrigin}/dashboard`, { timeout })
    if (signal.aborted || Date.now() >= Date.parse(deadlineAt)) unavailable()
    await verifyAlias({ signal })
    await page.getByText(OWNER_EMAIL, { exact: true }).waitFor({ timeout: 15_000 })
    await page.goto(`${applicationOrigin}/account/orders`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.getByRole('heading', { name: 'My orders' }).waitFor({ timeout: 15_000 })
    await page.getByText('No shop orders yet.').or(page.locator('main article'))
      .first().waitFor({ timeout: 15_000 })

    step = 'signed_out_order_isolation'
    signedOutContext = await browser.newContext({ serviceWorkers: 'block' })
    await bootstrapProtectedPreviewCookie(signedOutContext, applicationOrigin, bypass)
    await installProtectedPreviewRoute(signedOutContext, applicationOrigin)
    const signedOutPage = await signedOutContext.newPage()
    const denied = await signedOutPage.goto(`${applicationOrigin}/api/account/orders`,
      { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await verifyOrdersDeniedByApplication(denied)
    await signedOutContext.close(); signedOutContext = undefined

    step = 'explicit_guest_cart_transfer'
    await verifyAlias({ signal })
    await page.goto(`${applicationOrigin}/products/${PRODUCT_ID}`,
      { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.getByRole('button', { name: /^Basket, / }).click({ timeout: 15_000 })
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
    await verifyAlias({ signal })
    step = 'unified_logout'
    await page.goto(`${applicationOrigin}/account/orders`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    verifyStagingSessionState(await accountContext.cookies(applicationOrigin), true)
    // From this point a lost browser reply cannot prove whether logout took
    // effect. The parent must reconcile rather than call it a known failure.
    logoutStarted = true
    await page.getByRole('button', { name: 'Sign out of TLL and shop' }).click({ timeout: 15_000 })
    const logoutRemaining = Date.parse(deadlineAt) - Date.now()
    if (signal.aborted || logoutRemaining < 1) unavailable()
    await page.waitForURL(`${applicationOrigin}/auth`, { timeout: Math.min(30_000, logoutRemaining) })
    verifyStagingSessionState(await accountContext.cookies(applicationOrigin), false)
    const afterLogout = await page.goto(`${applicationOrigin}/api/account/orders`,
      { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await verifyOrdersDeniedByApplication(afterLogout)
    await page.goto(`${applicationOrigin}/account/orders`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForURL(`${applicationOrigin}/auth`, { timeout: 15_000 })
    await verifyAlias({ signal })
    outcome = Object.freeze({ status: 'OWNER_JOURNEY_VERIFIED_NO_PURCHASE',
      account: 'owner_identity_orders_and_logout', cart: 'explicit_guest_transfer_mapped_product_and_price',
      checkout: 'staging_get_only' })
  } catch { failed = true }
  finally {
    clearTimeout(deadlineTimer)
    signal.removeEventListener('abort', closed)
    for (const context of [checkoutContext, signedOutContext, accountContext]) {
      try { await context?.close() } catch { closeFailed = true }
    }
    try { await browser?.close() } catch { closeFailed = true }
  }
  if (closeFailed || signal.aborted) throw Error(`Generation 23 owner journey unavailable at ${step}`)
  if (failed && logoutStarted) throw Error('Generation 23 owner logout outcome uncertain')
  if (failed) return Object.freeze({ status: 'OWNER_JOURNEY_FAILED_VERIFIED' })
  return outcome
}
