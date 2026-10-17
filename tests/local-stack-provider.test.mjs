import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import { randomUUID } from 'node:crypto'
import { createGuestStore, STACK_STORAGE_PREFIX } from '../lib/local-stack.ts'
import { createStackSync } from '../lib/stack-sync.ts'
import { createAdditionOutbox } from '../lib/stack-addition-outbox.ts'

const product = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001', brand: 'Fixture', name: 'Creatine', category: 'creatine', score: 80 }
const require = createRequire(import.meta.url)
const filename = new URL('../components/LocalStackContext.tsx', import.meta.url)
const source = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText
function storage() {
  const data = new Map()
  return { get length() { return data.size }, key: i => [...data.keys()][i] ?? null,
    getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) }
}
// Exercise the real provider effect and sync/store implementation. A tiny hook
// host supplies lifecycle only; auth/network/storage are controlled boundaries.
function mount(localStorage, session = null, failure = null) {
  const slots = [], effects = [], auth = {}; let cursor = 0, started = false, cleanup
  const hooks = { ...React,
    useState(initial) {
      const i = cursor++
      if (!(i in slots)) slots[i] = initial
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value }]
    },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i] },
    useEffect(effect) { if (!started) effects.push(effect) },
  }
  let callback
  auth.onAuthStateChange = fn => { callback = fn; return { data: { subscription: { unsubscribe() {} } } } }
  auth.getSession = async () => {
    if (failure === 'session') throw new Error('Auth unavailable')
    return { data: { session }, error: failure === 'returned-error' ? new Error('Auth unavailable') : null }
  }
  auth.getUser = () => { throw new Error('Network auth validation unavailable') }
  const mod = { exports: {} }
  vm.runInNewContext(source, { module: mod, exports: mod.exports,
    require(name) {
      if (name === 'react') return hooks
      if (name === '@/lib/local-stack') return { createGuestStore, STACK_STORAGE_PREFIX }
      if (name === '@/lib/stack-sync') return { createStackSync }
      if (name === '@/lib/stack-addition-outbox') return { createAdditionOutbox }
      if (name === '@/lib/supabase') return { createClient: () => { if (failure === 'configuration') throw new Error('Missing public configuration'); return { auth } } }
      if (name === '@/lib/scores') return { scoreFor: () => 80 }
      if (name === '@/lib/preview-mode') return { isSyntheticPreview: () => false }
      return require(name)
    }, window: { localStorage, addEventListener() {}, removeEventListener() {} },
    crypto: { randomUUID }, fetch: async () => { throw new Error('No account transport in guest test') }, setTimeout, clearTimeout,
  }, { filename: filename.pathname })
  function render() { cursor = 0; return mod.exports.LocalStackProvider({ children: null }).props.value }
  render(); started = true; cleanup = effects[0]()
  return { render, unmount: () => cleanup(), authEvent: value => callback('SIGNED_IN', value) }
}
const settle = () => new Promise(setImmediate)

test('guest provider adds immediately, shares the count/list and survives remount without network auth', async () => {
  const data = storage(), first = mount(data)
  await settle()
  assert.equal(first.render().state.identity, null)
  first.render().toggle(product)
  // The same provider value is consumed by TopNav and SavedStackBuilder.
  assert.equal(first.render().stack.length, 1)
  assert.equal(first.render().inStack(product.id), true)
  assert.equal(first.render().stack[0].name, 'Creatine')
  assert.equal(JSON.parse(data.getItem(`tll_stack_v2_item:${product.id}`)).product.id, product.id)
  first.unmount()
  const next = mount(data); await settle()
  assert.equal(next.render().stack[0].id, product.id)
  next.render().toggle(product)
  assert.equal(next.render().stack.length, 0)
  next.unmount()
})

test('auth initialization never overwrites a newer auth event with stale guest state', async () => {
  const mounted = mount(storage())
  mounted.authEvent({ user: { id: '22222222-2222-4222-8222-222222222222' } })
  await settle()
  assert.equal(mounted.render().state.identity, '22222222-2222-4222-8222-222222222222')
  mounted.unmount()
})

for (const failure of ['session', 'returned-error', 'configuration']) test(`guest provider remains editable when ${failure} is unavailable`, async () => {
  const data = storage(), first = mount(data, null, failure)
  await settle()
  assert.equal(first.render().state.identity, null)
  first.render().add(product)
  assert.equal(first.render().stack[0].id, product.id)
  assert.equal(first.render().state.error, null)
  first.unmount()
  const next = mount(data, null, failure); await settle()
  assert.equal(next.render().stack.length, 1)
  next.unmount()
})
test('stale session rejection cannot replace a newer signed-in identity', async () => {
  const mounted = mount(storage(), null, 'session')
  const id = '22222222-2222-4222-8222-222222222222'
  mounted.authEvent({ user: { id } })
  await settle()
  assert.equal(mounted.render().state.identity, id)
  mounted.unmount()
})
