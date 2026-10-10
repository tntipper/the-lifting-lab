import assert from 'node:assert/strict'
import test from 'node:test'
import { collectorUrl } from './collector-url.mjs'

const origin = 'http://127.0.0.1:3181'

test('protocol-less analytics frame referrer can be inspected without a parser crash', () => {
  const observed = collectorUrl('127.0.0.1/analytics-frame.html', origin)
  assert.equal(observed.search, '')
  assert.equal(observed.hash, '')
  assert.ok(observed.pathname.endsWith('/analytics-frame.html'))
})

test('absolute public page identity remains unchanged', () => {
  const observed = collectorUrl(origin + '/products', origin)
  assert.equal(observed.origin + observed.pathname, origin + '/products')
})

test('external absolute and protocol-relative origins are not coerced into local identity', () => {
  for (const value of ['https://referrer.example.invalid/path', '//referrer.example.invalid/path']) {
    const observed = collectorUrl(value, origin)
    assert.equal(observed.hostname, 'referrer.example.invalid')
    assert.notEqual(observed.origin, origin)
  }
})

test('resolving relative or protocol-less values preserves private query and fragment evidence', () => {
  for (const value of ['127.0.0.1/analytics-frame.html', '/analytics-frame.html',
    '//127.0.0.1/analytics-frame.html', origin + '/products']) {
    const observed = collectorUrl(value + '?token=SYNTHETIC_QUERY_PRIVATE#SYNTHETIC_FRAGMENT_PRIVATE', origin)
    assert.equal(observed.searchParams.get('token'), 'SYNTHETIC_QUERY_PRIVATE')
    assert.equal(observed.hash, '#SYNTHETIC_FRAGMENT_PRIVATE')
    assert.equal(!!(observed.search || observed.hash), true)
  }
})

test('malformed absolute values remain rejected rather than treated as clean', () => {
  assert.throws(() => collectorUrl('http://[', origin), { code: 'ERR_INVALID_URL' })
})
