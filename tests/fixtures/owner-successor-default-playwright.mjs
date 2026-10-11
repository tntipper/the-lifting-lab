/** Synthetic browser protocol boundary. The actual owner journey and checkout guards execute unchanged. */
import assert from 'node:assert/strict'
import { config, trace } from './owner-successor-default-http.mjs'
const alias = 'https://the-lifting-lab-git-codex-tll-4adea2-my-lifting-lab-s-projects.vercel.app'
const checkout = 'https://tll-integration-staging.myshopify.com/cart/c/syntheticfixture'
const sessionName = 'sb-qdmvngjwkcsilzmqksme-auth-token'
const response = (url, status = 200, body = {}) => ({ url: () => url, status: () => status,
  request: () => ({ method: () => 'GET' }), headers: () => status === 409 ? { 'cache-control': 'no-store, private' } : { 'cache-control': 'private, no-store' },
  json: async () => body, dispose: async () => {} })
function locator(page, kind, name) {
  const display = String(name); trace(`browser_locator:${kind}:${display}`)
  return {
    getByRole: (role, options) => locator(page, role, options.name), getByText: text => locator(page, 'text', text),
    first() { return this }, or() { return this },
    async waitFor() { if (config.mode === 'owner-failure' && display === 'What are you training for?') throw Error('Synthetic missing account stack boundary') },
    async getAttribute(attribute) { assert.equal(attribute, 'href'); assert.equal(display, 'Open staging checkout in a new tab'); return checkout },
    async click() {
      trace(`browser_click:${display}`)
      if (display === 'My Stack') page.current = `${alias}/stack`
      if (display === 'Overview') page.current = `${alias}/account`
      if (display === 'Sign out of TLL and shop') { page.owner.session = false; page.current = `${alias}/auth` }
    },
  }
}
class Page {
  constructor(owner) { this.owner = owner; this.current = ''; this.stackWaiting = [] }
  context() { return this.owner }
  url() { return this.current }
  getByRole(role, options) { return locator(this, role, options.name) }
  getByText(text) { return locator(this, 'text', text) }
  locator(selector) { return locator(this, 'selector', selector) }
  async goto(url) {
    trace(`browser_get:${new URL(url).pathname}`)
    this.current = url
    if (url === `${alias}/account/orders` && !this.owner.session) this.current = `${alias}/auth`
    if (url.endsWith('/api/account/orders')) return response(url, 409, { status: 'held' })
    if (url === checkout) {
      const request = { url: () => url, method: () => 'GET', isNavigationRequest: () => true, headers: () => ({}) }
      for (const handler of this.owner.routes) {
        let allowed = false
        await handler({ request: () => request, fetch: async () => response(url), fulfill: async () => { allowed = true }, fallback: async () => { allowed = true }, abort: async () => {} })
        assert.equal(allowed, true, 'actual checkout route permits only its pinned GET')
      }
    }
    return response(url)
  }
  async waitForURL(url) {
    if (this.current === `${alias}/auth/customer` && url === `${alias}/account`) { this.owner.session = true; this.current = url; trace('browser_synthetic_sign_in') }
    assert.equal(this.current, url)
  }
  waitForResponse(predicate) { return new Promise(resolve => this.stackWaiting.push({ predicate, resolve })) }
  async reload() {
    assert.equal(this.current, `${alias}/stack`); trace('browser_stack_reload')
    const reply = response(`${alias}/api/stack`, 200, { userId: '10000000-0000-4000-8000-000000000001', stackId: '10000000-0000-4000-8000-000000000002', revision: 2, recoveryConflicts: 0,
      items: [{ product_id: '40000000-0000-4000-8000-000000000001', servings_per_day: 1 }] })
    for (const { predicate, resolve } of this.stackWaiting.splice(0)) { assert.equal(predicate(reply), true); resolve(reply) }
  }
}
class Context {
  constructor() { this.session = false; this.routes = [] }
  request = { get: async url => {
    trace(`browser_request_get:${new URL(url).pathname}`)
    if (url === checkout) return response(url)
    assert.equal(url, `${alias}/api/staging/readiness`)
    return { status: () => 302, headers: () => ({ location: alias }), dispose: async () => {} }
  } }
  async cookies() { return [{ name: 'synthetic-preview-cookie', value: 'synthetic', domain: new URL(alias).hostname, secure: true, httpOnly: true, path: '/' },
    ...(this.session ? [{ name: sessionName, value: 'synthetic-session' }] : [])] }
  async route(pattern, handler) { assert.equal(pattern, '**/*'); this.routes.push(handler) }
  async newPage() { return new Page(this) }
  async close() { trace('browser_context_closed') }
}
export const chromium = { async launch(options) {
  assert.deepEqual(options, { channel: 'chrome', headless: false }); trace('browser_transport_launch')
  return { newContext: async options => { assert.deepEqual(options, { serviceWorkers: 'block' }); return new Context() }, close: async () => trace('browser_transport_closed') }
} }
