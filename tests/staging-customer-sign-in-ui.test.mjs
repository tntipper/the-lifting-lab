import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const ORIGIN = 'https://the-lifting-fixture-my-lifting-lab-s-projects.vercel.app'

function loadModule(relative, env = {}, overrides = {}) {
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText
  const loaded = { exports: {} }
  vm.runInNewContext(js, {
    require: (name) => overrides[name] ?? require(name),
    module: loaded,
    exports: loaded.exports,
    process: { env },
    URL,
    URLSearchParams,
    Buffer,
    TextDecoder,
    TextEncoder,
    AbortSignal,
    DOMException: globalThis.DOMException,
    Response: globalThis.Response,
    fetch: globalThis.fetch,
  })
  return loaded.exports
}

function opaqueCsrf() {
  return 'A'.repeat(42) + 'A'
}

test('staging customer UI flag and Sign In href: enabled → /auth/customer; disabled → /auth', () => {
  const enabled = loadModule('../lib/identity/staging-customer-ui.ts', {
    NEXT_PUBLIC_TLL_ENVIRONMENT: 'staging',
    NEXT_PUBLIC_TLL_STAGING_CUSTOMER: 'enabled',
  })
  assert.equal(enabled.stagingCustomerUiEnabled(), true)
  assert.equal(enabled.accountSignInHref(), '/auth/customer')
  assert.equal(enabled.STAGING_CUSTOMER_SIGN_IN_PATH, '/auth/customer')

  const disabled = loadModule('../lib/identity/staging-customer-ui.ts', {
    NEXT_PUBLIC_TLL_ENVIRONMENT: 'staging',
    NEXT_PUBLIC_TLL_STAGING_CUSTOMER: 'disabled',
  })
  assert.equal(disabled.stagingCustomerUiEnabled(), false)
  assert.equal(disabled.accountSignInHref(), '/auth')

  const production = loadModule('../lib/identity/staging-customer-ui.ts', {
    NEXT_PUBLIC_TLL_ENVIRONMENT: 'production',
    NEXT_PUBLIC_TLL_STAGING_CUSTOMER: 'enabled',
  })
  assert.equal(production.stagingCustomerUiEnabled(), false)
  assert.equal(production.accountSignInHref(), '/auth')

  const absent = loadModule('../lib/identity/staging-customer-ui.ts', {})
  assert.equal(absent.stagingCustomerUiEnabled(), false)
  assert.equal(absent.accountSignInHref(), '/auth')
})

test('startStagingCustomerSignIn prepares then returns a fixed document POST contract', async () => {
  const { startStagingCustomerSignIn } = loadModule('../lib/identity/staging-customer-sign-in.ts')
  const csrf = opaqueCsrf()
  const calls = []
  const fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url
    calls.push({ url, method: init.method, body: String(init.body ?? ''), credentials: init.credentials, redirect: init.redirect })
    if (url.endsWith('/auth/customer/prepare')) {
      return new Response(JSON.stringify({ csrf }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    throw new Error(`unexpected fetch ${url}`)
  }
  const result = await startStagingCustomerSignIn({ fetch, origin: ORIGIN })
  assert.equal(result.status, 'submit')
  assert.equal(result.status === 'submit' ? result.action : null, `${ORIGIN}/auth/customer/start`)
  assert.deepEqual(result.status === 'submit' ? { ...result.fields } : null, { mode: 'sign_in', csrf })
  assert.equal(calls.length, 1)
  assert.match(calls[0].url, /\/auth\/customer\/prepare$/)
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].body, 'mode=sign_in')
  assert.equal(calls[0].credentials, 'same-origin')
  assert.equal(calls[0].redirect, 'manual')
})

test('startStagingCustomerSignIn stays held on prepare failure and never fetches the redirecting start route', async () => {
  const { startStagingCustomerSignIn, STAGING_CUSTOMER_SIGN_IN_HELD_MESSAGE } = loadModule(
    '../lib/identity/staging-customer-sign-in.ts',
  )
  const heldPrepare = await startStagingCustomerSignIn({
    origin: ORIGIN,
    fetch: async () => new Response(JSON.stringify({ status: 'held' }), { status: 409 }),
  })
  assert.equal(heldPrepare.status, 'held')
  assert.equal(heldPrepare.message, STAGING_CUSTOMER_SIGN_IN_HELD_MESSAGE)

  let step = 0
  const prepared = await startStagingCustomerSignIn({
    origin: ORIGIN,
    fetch: async () => {
      step += 1
      return new Response(JSON.stringify({ csrf: opaqueCsrf() }), { status: 200 })
    },
  })
  assert.equal(prepared.status, 'submit')
  assert.equal(step, 1, 'the helper must not fetch the redirecting start endpoint')
})

test('TopNav Sign In uses accountSignInHref; auth page fails closed to customer entry when staging enabled', () => {
  const topNav = readFileSync(new URL('../components/TopNav.tsx', import.meta.url), 'utf8')
  assert.match(topNav, /accountSignInHref/)
  assert.match(topNav, /signedIn === false \? accountSignInHref\(\) : '\/dashboard'/)
  assert.doesNotMatch(topNav, /signedIn === false \? '\/auth' : '\/dashboard'/)

  const authPage = readFileSync(new URL('../app/auth/page.tsx', import.meta.url), 'utf8')
  assert.match(authPage, /stagingCustomerUiEnabled/)
  assert.match(authPage, /StagingCustomerSignInEntry/)
  assert.match(authPage, /stagingCustomerUiEnabled\(\)\) return <StagingCustomerSignInEntry autoStart=\{false\}/)

  const customerPage = readFileSync(new URL('../app/auth/customer/page.tsx', import.meta.url), 'utf8')
  assert.match(customerPage, /stagingCustomerUiEnabled/)
  assert.match(customerPage, /StagingCustomerSignInEntry/)
  assert.match(customerPage, /redirect\('\/auth'\)/)

  const entry = readFileSync(new URL('../components/StagingCustomerSignInEntry.tsx', import.meta.url), 'utf8')
  assert.match(entry, /startStagingCustomerSignIn/)
  assert.match(entry, /document\.createElement\('form'\)/)
  assert.match(entry, /form\.submit\(\)/)
  assert.doesNotMatch(entry, /window\.location\.assign/)
  assert.doesNotMatch(readFileSync(new URL('../lib/identity/staging-customer-sign-in.ts', import.meta.url), 'utf8'), /redirect:\s*'manual'[\s\S]*\/auth\/customer\/start/)
  assert.match(entry, /\/auth\/customer\/prepare|startStagingCustomerSignIn/)
  assert.doesNotMatch(entry, /signInWithOAuth|Continue with Google|signInWithOtp/)
  assert.match(entry, /Google and magic-link are not offered/)
})

test('equivalent Sign In CTAs reuse accountSignInHref', () => {
  for (const relative of [
    '../components/FavouriteButton.tsx',
    '../components/ReviewSection.tsx',
    '../app/rewards/page.tsx',
  ]) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8')
    assert.match(source, /accountSignInHref/, relative)
  }
})
