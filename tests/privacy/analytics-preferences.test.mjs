import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import { renderToStaticMarkup } from 'react-dom/server'
const require = createRequire(import.meta.url)
const source = ts.transpileModule(readFileSync('components/AnalyticsPreferences.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText
for (const stored of [null, 'accepted', 'rejected']) test(`consent banner and footer control: ${stored}`, () => {
  const state = [], effects = [], portals = []
  let index = 0, reloads = 0
  const body = {}, mod = { exports: {} }
  const consent = { readAnalyticsChoice: () => stored, clearAnalyticsCookies() {}, analyticsAllowed: () => false,
    saveAnalyticsChoice: () => true }
  vm.runInNewContext(source, {
    module: mod, exports: mod.exports,
    require(name) {
      if (name === 'react') return { useRef: () => ({ current: null }), useState(initial) {
        const slot = index++
        if (!(slot in state)) state[slot] = initial
        return [state[slot], value => { state[slot] = value }]
      }, useEffect: effect => effects.push(effect) }
      if (name === 'react-dom') return { createPortal(element, target) { assert.equal(target, body); portals.push(element); return null } }
      if (name === 'next/navigation') return { usePathname: () => '/' }
      if (name === '@/lib/gtag') return { GA_MEASUREMENT_ID: 'fixture' }
      if (name === '@/lib/analytics-consent') return consent
      if (name === '@/lib/analytics-data') return {}
      return require(name)
    },
    document: { body, getElementById: () => null },
    window: { location: { reload() { reloads++ } }, addEventListener() {}, removeEventListener() {}, setInterval() {}, clearInterval() {} },
    requestAnimationFrame: fn => fn(),
  })
  const render = () => { index = 0; portals.length = 0; return mod.exports.default() }
  render(); effects[0]()
  let tree = render()
  assert.equal(portals.length, stored === null ? 1 : 0)
  if (stored === null) {
    const html = renderToStaticMarkup(portals[0])
    assert.match(html, /fixed inset-x-3 bottom-3/)
    assert.match(html, /Reject analytics/)
    assert.match(html, /Accept analytics/)
    portals[0].props.children.at(-1).props.children.at(-1).props.onClick()
    tree = render()
    assert.equal(portals.length, 0)
  }
  const trigger = tree.props.children[0].props.children[0]
  assert.equal(trigger.props['aria-expanded'], false)
  trigger.props.onClick()
  tree = render()
  assert.equal(portals.length, 1)
  assert.equal(tree.props.children[0].props.children[0].props['aria-expanded'], true)
  portals[0].props.children.at(-1).props.children[0].props.onClick()
  render()
  if (stored === 'accepted') assert.equal(reloads, 1)
  else assert.equal(portals.length, 0)
})
