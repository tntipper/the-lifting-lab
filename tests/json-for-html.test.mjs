import assert from 'node:assert/strict'
import test from 'node:test'
import { serializeJsonForHtml } from '../lib/json-for-html.ts'

test('untrusted structured data cannot terminate the enclosing script', () => {
  const values = [
    '</script><script>alert("injected")</script>',
    '</ScRiPt ><img src=x onerror=alert(1)>',
    '<!--<script>ignored</script>-->',
    '</script\n><svg onload=alert(1)>',
  ]

  for (const name of values) {
    const payload = { '@context': 'https://schema.org', '@type': 'Product', name }
    const serialized = serializeJsonForHtml(payload)
    const html = `<script type="application/ld+json">${serialized}</script>`

    // No HTML opening/comment/closing tokens can originate inside the payload.
    assert.doesNotMatch(serialized, /[<>]/)
    assert.equal((html.match(/<\/script\s*>/gi) ?? []).length, 1)
    assert.deepEqual(JSON.parse(serialized), payload)
  }
})

test('HTML-sensitive characters and Unicode separators round trip in keys and values', () => {
  const characters = '<>&\u2028\u2029'
  const payload = {
    [characters]: characters,
    nested: [{ description: 'A & B > C < D', url: 'https://example.com/?a=1&b=2' }],
  }
  const serialized = serializeJsonForHtml(payload)

  assert.doesNotMatch(serialized, /[<>&\u2028\u2029]/)
  assert.match(serialized, /\\u003c\\u003e\\u0026\\u2028\\u2029/)
  assert.deepEqual(JSON.parse(serialized), payload)
})

test('ordinary product data and JSON scalar values retain JSON.stringify semantics', () => {
  const values = [
    null, true, false, 0, 42.5, '', 'Plain product',
    { name: 'Whey “Vanilla” 🥛', price: 29.99, available: true, missing: null },
    ['one', 2, false, null],
    { quote: '"', slash: '\\', literalEscape: '\\u003c', newline: '\n' },
    { optional: undefined, values: [undefined, NaN, Infinity] },
    { toJSON: () => ({ label: '</script>', amount: 5 }) },
  ]

  for (const value of values) {
    assert.deepEqual(JSON.parse(serializeJsonForHtml(value)), JSON.parse(JSON.stringify(value)))
  }
})

test('unsupported top-level values and cycles fail instead of emitting invalid JSON', () => {
  for (const value of [undefined, () => {}, Symbol('not JSON')]) {
    assert.throws(() => serializeJsonForHtml(value), TypeError)
  }

  const cyclic = {}
  cyclic.self = cyclic
  assert.throws(() => serializeJsonForHtml(cyclic), TypeError)
  assert.throws(() => serializeJsonForHtml(1n), TypeError)
})
