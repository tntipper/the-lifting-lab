import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import test from 'node:test'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const { createClient } = require('@supabase/supabase-js')
const USER = '10000000-0000-4000-8000-000000000001'
const PRODUCT = '20000000-0000-4000-8000-000000000001'

// Invoke the actual route and points adapter through the installed Supabase
// query builder. Only authentication/cookies and fetch are replaced. The fetch
// fixture models an INSERT/DELETE-only favourites grant and captures the wire
// contract; it cannot contact any provider or use environment credentials.
function fixture({ signedIn = true, insertFails = false } = {}) {
  const calls = []
  const favourites = new Set()
  const rewarded = new Set()
  const client = createClient('https://fixture.invalid', 'synthetic-public-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, options) => {
      const request = new Request(url, options)
      const body = await request.json()
      const target = new URL(request.url)
      calls.push({ target, body, method: request.method, prefer: request.headers.get('prefer') })
      if (target.pathname === '/rest/v1/user_favourites') {
        // ON CONFLICT DO UPDATE requires UPDATE privileges even for a new row.
        if (insertFails || request.headers.get('prefer') !== 'resolution=ignore-duplicates') {
          return Response.json({ code: '42501', message: 'permission denied for table user_favourites' }, { status: 403 })
        }
        assert.equal(target.searchParams.get('on_conflict'), 'user_id,product_id')
        assert.deepEqual(body, { user_id: USER, product_id: PRODUCT })
        favourites.add(`${body.user_id}:${body.product_id}`)
        return new Response(null, { status: 201 })
      }
      if (target.pathname === '/rest/v1/rpc/award_points') {
        assert.deepEqual(body, { p_action: 'favourite', p_ref_id: PRODUCT })
        const ref = `${USER}:${body.p_ref_id}`
        assert.ok(favourites.has(ref), 'persist the favourite before attempting a reward')
        const points = rewarded.has(ref) ? 0 : 10
        rewarded.add(ref)
        return Response.json(points)
      }
      assert.fail(`Unexpected fixture endpoint: ${target.pathname}`)
    } },
  })
  client.auth.getUser = async () => ({ data: { user: signedIn ? { id: USER } : null }, error: null })
  const cache = new Map()
  function load(relativePath) {
    if (cache.has(relativePath)) return cache.get(relativePath)
    const filename = fileURLToPath(new URL(`../${relativePath}`, import.meta.url))
    const output = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText
    const loaded = { exports: {} }
    const localRequire = name => {
      if (name === '@supabase/ssr') return { createServerClient: () => client }
      if (name === 'next/headers') return { cookies: async () => ({ getAll: () => [], set() {} }) }
      if (name === '@/lib/preview-mode') return { guardedSupabaseFetch: () => assert.fail('Unexpected transport') }
      if (name === '@/lib/products') return {}
      if (name === '@/lib/assessment-display') return { assessmentDisplayFor: () => ({ score: null }) }
      if (name === '@/lib/points') return load('lib/points.ts')
      return require(name)
    }
    vm.runInThisContext(`(function(require, module, exports) {${output}\n})`, { filename })(localRequire, loaded, loaded.exports)
    cache.set(relativePath, loaded.exports)
    return loaded.exports
  }
  const { POST } = load('app/api/favourites/route.ts')
  const post = body => POST(new Request('https://fixture.invalid/api/favourites', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }))
  return { post, calls, favourites }
}

test('favourite route inserts and ignores repeat adds without requesting UPDATE authority', async () => {
  const f = fixture()
  // A body-supplied owner must never replace the authenticated user.
  const body = { productId: PRODUCT, user_id: 'forged-owner' }
  const first = await f.post(body)
  assert.equal(first.status, 200)
  assert.deepEqual(await first.json(), { ok: true, pointsAwarded: 10 })
  const duplicate = await f.post(body)
  assert.equal(duplicate.status, 200)
  assert.deepEqual(await duplicate.json(), { ok: true, pointsAwarded: 0 })
  assert.equal(f.favourites.size, 1)
  assert.deepEqual(f.calls.map(call => [call.method, call.target.pathname]), [
    ['POST', '/rest/v1/user_favourites'], ['POST', '/rest/v1/rpc/award_points'],
    ['POST', '/rest/v1/user_favourites'], ['POST', '/rest/v1/rpc/award_points'],
  ])
  for (const call of f.calls.filter(call => call.target.pathname.endsWith('/user_favourites'))) {
    assert.equal(call.prefer, 'resolution=ignore-duplicates')
    assert.equal(call.target.searchParams.get('on_conflict'), 'user_id,product_id')
  }
})

test('a failed favourite insert returns an error without attempting points', async () => {
  const f = fixture({ insertFails: true })
  const response = await f.post({ productId: PRODUCT })
  assert.equal(response.status, 500)
  assert.equal(f.calls.length, 1)
  assert.equal(f.favourites.size, 0)
})

test('signed-out and missing-product requests never reach the database transport', async () => {
  const signedOut = fixture({ signedIn: false })
  assert.equal((await signedOut.post({ productId: PRODUCT })).status, 401)
  assert.equal(signedOut.calls.length, 0)
  const signedIn = fixture()
  assert.equal((await signedIn.post({})).status, 400)
  assert.equal(signedIn.calls.length, 0)
})
