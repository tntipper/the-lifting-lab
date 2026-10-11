import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import { createClient } from '@supabase/supabase-js'
import * as preview from '../lib/preview-mode.ts'

const require = createRequire(import.meta.url)
function loadSource(path, customRequire = require, extra = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = { exports: {} }
  vm.runInNewContext(js, { require: customRequire, module: loaded, exports: loaded.exports, process, URL, Response, ...extra })
  return loaded.exports
}
const resolve = name => ['@/lib/preview-mode', './preview-mode', './lib/preview-mode'].includes(name) ? preview : require(name)
function loadAnalytics() {
  const storage = new Map(), calls = []
  const browser = {
    window: { location: new URL('https://fixture.invalid/products?ref=private#private'), gtag(...args) { calls.push(args) } },
    document: { cookie: '', referrer: 'https://fixture.invalid/auth?token=private' },
    localStorage: { getItem(key) { return storage.get(key) ?? null }, setItem(key, value) { storage.set(key, value) } },
  }
  const modules = new Map()
  const analyticsResolve = name => {
    if (['./analytics-data', './analytics-consent'].includes(name)) {
      if (!modules.has(name)) modules.set(name, loadSource(`../lib/${name.slice(2)}.ts`, analyticsResolve, browser))
      return modules.get(name)
    }
    return resolve(name)
  }
  return { gtag: loadSource('../lib/gtag.ts', analyticsResolve, browser), consent: analyticsResolve('./analytics-consent'), calls }
}

async function withMode(mode, callback) {
  const saved = process.env.NEXT_PUBLIC_TLL_ENVIRONMENT
  process.env.NEXT_PUBLIC_TLL_ENVIRONMENT = mode
  try { await callback() } finally { if (saved === undefined) delete process.env.NEXT_PUBLIC_TLL_ENVIRONMENT; else process.env.NEXT_PUBLIC_TLL_ENVIRONMENT = saved }
}

test('synthetic Supabase reads, auth and uploads make zero network calls', () => withMode('synthetic-preview', async () => {
  const originalFetch = globalThis.fetch
  let networkCalls = 0
  globalThis.fetch = async () => { networkCalls++; throw new Error('Unexpected network') }
  try {
    const client = createClient('https://tll-preview.invalid', 'synthetic-public-key', {
      global: { fetch: preview.guardedSupabaseFetch }, auth: { persistSession: false, autoRefreshToken: false },
    })
    const read = await client.from('products').select('id')
    assert.equal(read.status, 403); assert.ok(read.error)
    const auth = await client.auth.signInWithOtp({ email: 'fixture@example.invalid' })
    assert.ok(auth.error)
    const write = await client.storage.from('avatars').upload('fixture/image.png', new Uint8Array([0]))
    assert.ok(write.error)
    assert.equal(networkCalls, 0)
  } finally { globalThis.fetch = originalFetch }
}))

test('production transport forwards its original request', () => withMode('production', async () => {
  const originalFetch = globalThis.fetch
  let forwarded
  globalThis.fetch = async (...args) => { forwarded = args; return new Response('fixture') }
  try {
    const init = { method: 'POST', body: 'fixture' }
    await preview.guardedSupabaseFetch('https://fixture.invalid/', init)
    assert.equal(forwarded[0], 'https://fixture.invalid/'); assert.equal(forwarded[1], init)
  } finally { globalThis.fetch = originalFetch }
}))

test('middleware rejects preview APIs and every unsafe method before handlers', () => withMode('synthetic-preview', async () => {
  const { middleware } = loadSource('../middleware.ts', resolve)
  for (const path of ['/api/contact', '/api/profile', '/api/products', '/auth/signout', '/', '/products']) {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const result = middleware({ url: `https://preview.invalid${path}`, nextUrl: new URL(`https://preview.invalid${path}`), method })
      assert.equal(result.status, 503); assert.equal((await result.json()).code, 'synthetic_preview_unavailable')
    }
  }
  assert.equal(middleware({ url: 'https://preview.invalid/api/products', nextUrl: new URL('https://preview.invalid/api/products'), method: 'GET' }).status, 503)
  for (const path of ['/api/products/batch', '/api/products/search', '/api/stack/assessments']) {
    const response = middleware({ url: `https://preview.invalid${path}`, nextUrl: new URL(`https://preview.invalid${path}`), method: 'GET' })
    assert.equal(response.headers.get('x-middleware-next'), '1')
    assert.equal(middleware({ url: `https://preview.invalid${path}`, nextUrl: new URL(`https://preview.invalid${path}`), method: 'POST' }).status, 503)
  }
}))

test('preview account/form routes rewrite to an explicit inert page and browsing remains available', () => withMode('synthetic-preview', async () => {
  const { middleware } = loadSource('../middleware.ts', resolve)
  for (const path of ['/auth', '/auth/callback', '/account/settings', '/dashboard', '/favourites', '/rewards', '/contact', '/submit']) {
    const response = middleware({ url: `https://preview.invalid${path}`, nextUrl: new URL(`https://preview.invalid${path}`), method: 'GET' })
    assert.equal(response.headers.get('x-middleware-rewrite'), 'https://preview.invalid/preview')
  }
  const stack = middleware({ url: 'https://preview.invalid/stack', nextUrl: new URL('https://preview.invalid/stack'), method: 'GET' })
  assert.equal(stack.headers.get('x-middleware-next'), '1')
  const response = middleware({ url: 'https://preview.invalid/guide/protein', nextUrl: new URL('https://preview.invalid/guide/protein'), method: 'GET' })
  assert.equal(response.headers.get('x-middleware-next'), '1')
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow')
  assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/)
}))

test('production middleware permits normal API and account flows', () => withMode('production', async () => {
  const { middleware } = loadSource('../middleware.ts', resolve)
  for (const method of ['GET', 'POST', 'DELETE']) {
    const response = middleware({ url: 'https://fixture.invalid/api/profile', nextUrl: new URL('https://fixture.invalid/api/profile'), method })
    assert.equal(response.headers.get('x-middleware-next'), '1')
    assert.equal(response.headers.get('x-tll-preview'), null)
  }
}))

test('synthetic retailer links stay local and analytics cannot fire', () => withMode('synthetic-preview', async () => {
  const affiliate = loadSource('../lib/affiliate.ts', resolve)
  assert.equal(affiliate.myproteinLink(), '/preview')
  assert.equal(affiliate.amazonSearch('fixture', 'fixture'), '/preview')
  assert.equal(affiliate.bulkSearch('fixture'), '/preview')
  assert.equal(affiliate.bulkDealsLink(), '/preview')
  assert.equal(affiliate.resolveProductListing('https://www.amazon.co.uk/dp/B000000001').url, null)
  const { gtag, consent, calls } = loadAnalytics()
  assert.equal(consent.saveAnalyticsChoice('accepted'), true)
  gtag.track('fixture', {})
  assert.equal(calls.length, 0)
}))

test('production listing navigation stays available and analytics requires persisted acceptance', () => withMode('production', async () => {
  const affiliate = loadSource('../lib/affiliate.ts', resolve)
  assert.equal(affiliate.resolveProductListing('https://www.amazon.co.uk/dp/B000000001').state, 'listing')
  const { gtag, consent, calls } = loadAnalytics()
  gtag.track('fixture', {})
  assert.equal(calls.length, 0)
  assert.equal(consent.saveAnalyticsChoice('accepted'), true)
  gtag.track('fixture', {})
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'event'); assert.equal(calls[0][1], 'fixture')
  assert.equal(calls[0][2].page_location, 'https://fixture.invalid/products')
  assert.equal(calls[0][2].page_referrer, 'https://fixture.invalid/auth')
  assert.equal(consent.saveAnalyticsChoice('rejected'), true)
  gtag.track('fixture', {})
  assert.equal(calls.length, 1)
}))

test('hosted staging permits its account routes but blocks indexing and unrelated browser connections', () => withMode('staging', async () => {
  const saved = process.env.NEXT_PUBLIC_SUPABASE_URL
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abcdefghijklmnopqrst.supabase.co'
  try {
    const { middleware } = loadSource('../middleware.ts', resolve)
    for (const [path, method] of [['/auth', 'GET'], ['/api/favourites', 'POST'], ['/api/stack', 'DELETE'], ['/products', 'GET']]) {
      const url = `https://preview.invalid${path}`
      const response = middleware({ url, nextUrl: new URL(url), method })
      assert.equal(response.headers.get('x-middleware-next'), '1')
      assert.equal(response.headers.get('x-middleware-rewrite'), null)
      assert.equal(response.headers.get('x-tll-preview'), 'staging')
      assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow')
      assert.equal(response.headers.get('content-security-policy'), "connect-src 'self' https://abcdefghijklmnopqrst.supabase.co; form-action 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'")
    }
    const robots = loadSource('../app/robots.ts', resolve).default()
    assert.equal(robots.rules.disallow, '/')
    assert.equal(robots.sitemap, undefined)
  } finally { if (saved === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = saved }
}))

test('malformed or production staging endpoint cannot expand the connection policy', () => withMode('staging', async () => {
  const saved = process.env.NEXT_PUBLIC_SUPABASE_URL
  try {
    for (const url of [undefined, 'invalid', 'https://wrhgscovsgsudtedbljr.supabase.co',
      'https://abcdefghijklmnopqrst.supabase.co.evil.invalid', 'https://user@abcdefghijklmnopqrst.supabase.co',
      'https://abcdefghijklmnopqrst.supabase.co:444', 'https://abcdefghijklmnopqrst.supabase.co/path',
      'https://abcdefghijklmnopqrst.supabase.co?x=1', 'https://abcdefghijklmnopqrst.supabase.co#x',
      "https://abcdefghijklmnopqrst.supabase.co; connect-src *", 'http://abcdefghijklmnopqrst.supabase.co']) {
      if (url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = url
      assert.equal(preview.stagingConnectionPolicy(), "connect-src 'self'; form-action 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'")
    }
  } finally { if (saved === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = saved }
}))

test('hosted staging never fires analytics or emits affiliate purchase destinations', () => withMode('staging', async () => {
  const { gtag, consent, calls } = loadAnalytics()
  assert.equal(consent.saveAnalyticsChoice('accepted'), true)
  gtag.track('fixture')
  assert.equal(calls.length, 0)
  const affiliate = loadSource('../lib/affiliate.ts', resolve)
  assert.equal(affiliate.myproteinLink(), '/preview')
  assert.equal(affiliate.amazonSearch('fixture', 'fixture'), '/preview')
  assert.equal(affiliate.bulkSearch('fixture'), '/preview')
  assert.equal(affiliate.bulkDealsLink(), '/preview')
  assert.equal(affiliate.resolveProductListing('https://www.amazon.co.uk/dp/B000000001').url, null)
}))
