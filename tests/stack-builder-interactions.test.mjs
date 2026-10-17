import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import React from 'react'
const require = createRequire(import.meta.url)
const bundle = buildSync({ entryPoints: ['app/stack/StackBuilder.tsx'], bundle: true, write: false,
  platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime', 'next/link', '@/components/LocalStackContext', '@/lib/browser-snapshot'],
}).outputFiles[0].text
function walk(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(child => walk(child, predicate))
  if (!tree || typeof tree !== 'object') return []
  return [...(predicate(tree) ? [tree] : []), ...walk(tree.props?.children, predicate)]
}
const text = tree => Array.isArray(tree) ? tree.map(text).join('') : tree && typeof tree === 'object' ? text(tree.props?.children) : String(tree ?? '')
const find = (tree, type, label) => walk(tree, node => node.type === type && text(node) === label)[0]
const row = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001', name: 'Fixture creatine', brand: 'Fixture', category: 'creatine',
  retail_price: 20, servings_per_container: 40, serving_size: 3, serving_unit: 'g', buy_url: null,
  product_nutrients: [{ nutrient_name: 'Creatine', amount: 3, unit: 'g' }] }
function host() {
  const slots = [], effects = [], previous = [], cleanups = [], data = new Map(), requests = []
  let cursor = 0
  const localStorage = { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v) }
  const ctx = { stack: [], state: { identity: null, snapshot: null, guest: [], loading: false, busy: false, error: null },
    add: p => { ctx.stack = [...ctx.stack, p] }, remove: id => { ctx.stack = ctx.stack.filter(p => p.id !== id) }, retry() {} }
  const hooks = { ...React,
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v }] },
    useRef: initial => { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i] },
    useMemo: fn => fn(),
    useEffect: (fn, deps) => { const i = cursor++; if (!previous[i] || deps.some((v,j) => v !== previous[i][j])) { effects.push(() => { cleanups[i]?.(); cleanups[i] = fn() }); previous[i] = deps } },
  }
  const mod = { exports: {} }
  vm.runInNewContext(bundle, { module: mod, exports: mod.exports, process: { env: {} }, URLSearchParams, AbortController, AbortSignal, setTimeout, clearTimeout,
    window: { localStorage, location: { search: '', origin: 'https://fixture.test' } }, localStorage,
    fetch: async url => { requests.push(url); return { ok: true, json: async () => [row] } },
    require: name => name === 'react' ? hooks : name === '@/components/LocalStackContext' ? { useLocalStack: () => ctx }
      : name === '@/lib/browser-snapshot' ? { useBrowserSnapshot: read => read() } : name === 'next/link' ? props => React.createElement('a', props) : require(name),
  })
  return { data, requests, ctx, render() { cursor = 0; const tree = mod.exports.default().props.children.type(); effects.splice(0).forEach(fn => fn()); return tree },
    dispose() { cleanups.forEach(fn => fn?.()) } }
}
test('production guest UI opens catalogue, adds, changes goal, saves and calculates daily/monthly totals', async () => {
  const h = host()
  try {
    let tree = h.render(); tree = h.render()
    find(tree, 'button', '+ Add an ingredient').props.onClick()
    h.render(); await new Promise(setImmediate); tree = h.render()
    assert.doesNotMatch(text(tree), /Loading options/)
    const option = walk(tree, n => n.type === 'button' && n.props.className === 'stack-option')[0]
    assert.ok(option)
    option.props.onClick(); h.render(); await new Promise(setImmediate); tree = h.render()
    assert.equal(h.ctx.stack[0].id, row.id)
    assert.match(text(tree), /£0.50/)
    assert.match(text(tree), /£15.00/)
    find(tree, 'button', 'Recovery').props.onClick(); tree = h.render()
    assert.match(text(tree), /Your recovery stack/)
    assert.equal(h.data.get('tll-stack-goal'), 'Recovery')
    assert.equal(h.ctx.stack.length, 1)
    find(tree, 'button', 'Save stack').props.onClick(); tree = h.render()
    assert.ok(find(tree, 'button', 'Saved'))
    assert.equal(JSON.parse(h.data.get('tll-stack-v1')).stack[0].id, row.id)
    assert.ok(h.requests.some(url => url.startsWith('/api/products/batch')))
    assert.equal(h.requests.some(url => url === '/api/stack'), false)
  } finally { h.dispose() }
})
