import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

test('the customer account has one canonical home and keeps the old dashboard address working', () => {
  assert.match(source('app/account/page.tsx'), /dashboard\/page/)
  const config = source('next.config.ts')
  assert.match(config, /source: "\/dashboard"/)
  assert.match(config, /destination: "\/account"/)
  assert.match(source('components/TopNav.tsx'), /signedIn === false \? accountSignInHref\(\) : '\/account'/)
})

test('sign-in flows land on the unified account home', () => {
  assert.match(source('lib/auth-flow.ts'), /DEFAULT_RETURN_PATH = '\/account'/)
  assert.match(source('lib/server/staging-customer-session.ts'), /location: '\/account'/)
  assert.match(source('app/auth/page.tsx'), /`\/account\?ref=/)
})

test('account destinations share the customer navigation', () => {
  const navigation = source('components/AccountNavigation.tsx')
  for (const destination of ['/account', '/account/orders', '/favourites', '/stack', '/account/settings']) {
    assert.ok(navigation.includes(`href: '${destination}'`), destination)
  }
  for (const page of [
    'app/dashboard/page.tsx',
    'app/account/orders/page.tsx',
    'app/account/settings/page.tsx',
    'app/favourites/page.tsx',
    'app/stack/page.tsx',
    'app/cart/page.tsx',
  ]) {
    assert.match(source(page), /AccountNavigation/, page)
  }
})

test('unified profile copy explains the shared Shopify identity and separate order retention', () => {
  const settings = source('app/account/settings/SettingsForm.tsx')
  assert.match(settings, /Shopify Customer Account is your TLL sign-in/)
  assert.match(settings, /Shopify order records are retained separately/)
})
