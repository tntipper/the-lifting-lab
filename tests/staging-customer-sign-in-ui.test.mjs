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

test('startStagingCustomerSignIn posts prepare then start and returns authorize Location', async () => {
  const { startStagingCustomerSignIn } = loadModule('../lib/identity/staging-customer-sign-in.ts')
  const csrf = opaqueCsrf()
  const authorize = `${ORIGIN}/auth/customer/authorize?response_type=code&client_id=fixture`
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
    if (url.endsWith('/auth/customer/start')) {
      return new Response(null, { status: 303, headers: { location: authorize } })
    }
    throw new Error(`unexpected fetch ${url}`)
  }
  const result = await startStagingCustomerSignIn({ fetch, origin: ORIGIN })
  assert.equal(result.status, 'redirect')
  assert.equal(result.status === 'redirect' ? result.location : null, authorize)
  assert.equal(calls.length, 2)
  assert.match(calls[0].url, /\/auth\/customer\/prepare$/)
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].body, 'mode=sign_in')
  assert.equal(calls[0].credentials, 'same-origin')
  assert.equal(calls[0].redirect, 'manual')
  assert.match(calls[1].url, /\/auth\/customer\/start$/)
  assert.equal(calls[1].method, 'POST')
  assert.equal(calls[1].body, `mode=sign_in&csrf=${csrf}`)
})

test('startStagingCustomerSignIn stays held on prepare/start failure and never invents Google', async () => {
  const { startStagingCustomerSignIn, STAGING_CUSTOMER_SIGN_IN_HELD_MESSAGE } = loadModule(
    '../lib/identity/staging-customer-sign-in.ts',
  )
  const heldPrepare = await startStagingCustomerSignIn({
    origin: ORIGIN,
    fetch: async () => new Response(JSON.stringify({ status: 'held' }), { status: 409 }),
  })
  assert.equal(heldPrepare.status, 'held')
  assert.equal(heldPrepare.message, STAGING_CUSTOMER_SIGN_IN_HELD_MESSAGE)

  const csrf = opaqueCsrf()
  let step = 0
  const heldStart = await startStagingCustomerSignIn({
    origin: ORIGIN,
    fetch: async () => {
      step += 1
      if (step === 1) {
        return new Response(JSON.stringify({ csrf }), { status: 200 })
      }
      return new Response(JSON.stringify({ status: 'held' }), { status: 409 })
    },
  })
  assert.equal(heldStart.status, 'held')

  step = 0
  const badLocation = await startStagingCustomerSignIn({
    origin: ORIGIN,
    fetch: async () => {
      step += 1
      if (step === 1) return new Response(JSON.stringify({ csrf }), { status: 200 })
      return new Response(null, {
        status: 303,
        headers: { location: 'https://accounts.google.com/o/oauth2/v2/auth' },
      })
    },
  })
  assert.equal(badLocation.status, 'held')
})

test('TopNav Sign In uses accountSignInHref; auth page fails closed to customer entry when staging enabled', () => {
  const topNav = readFileSync(new URL('../components/TopNav.tsx', import.meta.url), 'utf8')
  assert.match(topNav, /accountSignInHref/)
  assert.match(topNav, /signedIn === false \? accountSignInHref\(\) : '\/dashboard'/)
  assert.doesNotMatch(topNav, /signedIn === false \? '\/auth' : '\/dashboard'/)

  const authPage = readFileSync(new URL('../app/auth/page.tsx', import.meta.url), 'utf8')
  assert.match(authPage, /stagingCustomerUiEnabled/)
  assert.match(authPage, /StagingCustomerSignInEntry/)
  assert.match(authPage, /stagingCustomerUiEnabled\(\)\) return <StagingCustomerSignInEntry/)

  const customerPage = readFileSync(new URL('../app/auth/customer/page.tsx', import.meta.url), 'utf8')
  assert.match(customerPage, /stagingCustomerUiEnabled/)
  assert.match(customerPage, /StagingCustomerSignInEntry/)
  assert.match(customerPage, /redirect\('\/auth'\)/)

  const entry = readFileSync(new URL('../components/StagingCustomerSignInEntry.tsx', import.meta.url), 'utf8')
  assert.match(entry, /startStagingCustomerSignIn/)
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
