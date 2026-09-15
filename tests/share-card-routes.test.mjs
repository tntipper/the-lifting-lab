import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import test from 'node:test'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const UNKNOWN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const product = { id: A, brand: 'Stored Brand', name: 'Stored Product', category: 'creatine', status: 'active' }

class CapturedImage extends Response {
  constructor(element, options) {
    super(null, options)
    this.element = element
  }
}

// Run the actual route and server adapter against an in-memory catalogue. No
// Supabase client, environment credentials, HTTP requests or social posts exist.
function fixture({ rows = [product], fail = false } = {}) {
  const lookups = []
  const awards = []
  const cache = new Map()
  const fakeSupabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'fixture-user' } } }) },
    from(table) {
      const call = { table }
      return {
        select(columns) { call.columns = columns; return this },
        eq(key, value) { call.filter = [key, value]; return this },
        async in(key, ids) {
          call.ids = [key, ids]
          lookups.push(call)
          return { data: rows, error: fail ? { message: 'Private provider detail' } : null }
        },
      }
    },
  }

  function load(relativePath) {
    if (cache.has(relativePath)) return cache.get(relativePath)
    const filename = fileURLToPath(new URL(`../${relativePath}`, import.meta.url))
    const output = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    }).outputText
    const module = { exports: {} }
    const localRequire = name => {
      if (name === 'next/og') return { ImageResponse: CapturedImage }
      if (name === '@/lib/supabase-public') return { createPublicClient: () => fakeSupabase }
      if (name === '@/lib/supabase-server') return { createServerSupabase: async () => fakeSupabase }
      if (name === '@/lib/scores') return { scoreFor: () => 61 }
      if (name === '@/lib/points') return { awardPoints: async (_, action, ref) => { awards.push({ action, ref }); return 25 } }
      if (name.startsWith('@/lib/')) return load(`${name.slice(2)}.ts`)
      return require(name)
    }
    vm.runInThisContext(`(function(require, module, exports) {${output}\n})`, { filename })(localRequire, module, module.exports)
    cache.set(relativePath, module.exports)
    return module.exports
  }
  return { load, lookups, awards }
}

function visibleText(element) {
  if (element == null || typeof element === 'boolean') return ''
  if (typeof element === 'string' || typeof element === 'number') return String(element)
  if (Array.isArray(element)) return element.map(visibleText).join(' ')
  return visibleText(element.props?.children)
}

test('stack route rejects arbitrary card content before any catalogue lookup', async () => {
  const f = fixture()
  const { GET } = f.load('app/api/stack/sharecard/route.tsx')
  for (const params of [
    { data: JSON.stringify({ score: 100, items: [{ name: 'Invented', score: 100 }] }) },
    { ids: A, score: '100' },
    { ids: 'not-a-product' },
  ]) {
    const response = await GET(new Request(`https://fixture.invalid/card?${new URLSearchParams(params)}`))
    assert.equal(response.status, 400)
    assert.equal(response instanceof CapturedImage, false)
  }
  assert.equal(f.lookups.length, 0)
})

test('stack image renders stored data and individual scores from explicitly active lookup', async () => {
  const f = fixture()
  const { GET } = f.load('app/api/stack/sharecard/route.tsx')
  const response = await GET(new Request(`https://fixture.invalid/card?ids=${A}`))
  assert.equal(response instanceof CapturedImage, true)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const text = visibleText(response.element)
  assert.match(text, /Stored Brand/)
  assert.match(text, /Stored Product/)
  assert.match(text, /61/)
  assert.match(text, /Individual catalogue scores/)
  assert.match(text, /not been assessed as a combined stack/)
  assert.deepEqual(f.lookups[0], {
    table: 'products', columns: 'id, name, brand, category, status',
    filter: ['status', 'active'], ids: ['id', [A]],
  })
})

test('product image preserves active product shares and returns honest errors for invalid or unknown IDs', async () => {
  const f = fixture()
  const { default: image } = f.load('app/products/[id]/opengraph-image.tsx')
  const active = await image({ params: Promise.resolve({ id: A }) })
  assert.equal(active instanceof CapturedImage, true)
  assert.match(visibleText(active.element), /Stored Product/)
  for (const [id, status] of [['bad&status=eq.pending', 400], [UNKNOWN, 404]]) {
    const response = await image({ params: Promise.resolve({ id }) })
    assert.equal(response.status, status)
    assert.equal(response instanceof CapturedImage, false)
  }
})

test('upstream failure does not turn into a fabricated branded product card', async () => {
  const f = fixture({ fail: true })
  const { default: image } = f.load('app/products/[id]/opengraph-image.tsx')
  const response = await image({ params: Promise.resolve({ id: A }) })
  assert.equal(response.status, 503)
  assert.equal(response instanceof CapturedImage, false)
  assert.doesNotMatch(await response.text(), /Private provider detail/)
})

test('share reward route rejects malformed IDs and passes a canonical UUID to existing reward rules', async () => {
  const f = fixture()
  const { POST } = f.load('app/api/share/route.ts')
  const claim = productId => POST(new Request('https://fixture.invalid/api/share', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId }),
  }))
  const invalid = await claim('made-up-share-reference')
  assert.equal(invalid.status, 400)
  assert.equal(f.awards.length, 0)
  const valid = await claim(A.toUpperCase())
  assert.equal(valid.status, 200)
  assert.deepEqual(f.awards, [{ action: 'share', ref: A }])
})
