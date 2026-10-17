import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
const require = createRequire(import.meta.url)

function harness() {
  let mode = 'closed', focused = 0, refIndex = 0, cleanup
  const listeners = new Map()
  const inside = {}
  const refs = [{ current: { focus: () => focused++ } }, { current: { contains: el => el === inside } }]
  const document = { activeElement: {}, addEventListener: (type, handler) => listeners.set(type, handler), removeEventListener: type => listeners.delete(type) }
  const activeElement = {}
  const react = { useId: () => 'guidance-test', useRef: () => refs[refIndex++],
    useState: () => [mode, value => { mode = typeof value === 'function' ? value(mode) : value }],
    useEffect: effect => { cleanup?.(); cleanup = effect() } }

  function load(file, overrides = {}) {
    const mod = { exports: {} }
    const js = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
    vm.runInNewContext(js, { module: mod, exports: mod.exports, document, require: name => overrides[name] ?? require(name) })
    return mod.exports
  }
  const guidance = load('lib/shop-guidance.ts')
  const Component = load('components/GuidanceNote.tsx', { react, '@/lib/shop-guidance': guidance, '@/components/shop.module.css': { __esModule: true, default: {} } }).default
  const render = (amount = 250) => { refIndex = 0; return Component({ nutrients: [{ nutrient_name: 'Caffeine', amount, unit: 'mg' }] }) }
  return { render, isOpen: () => mode !== 'closed', dispatch: (type, event) => listeners.get(type)?.(event), listeners, inside, document, focused: () => focused, activeElement, guidance }
}

test('advisory popup keeps text/source, is a real button, and supports pointer, click, keyboard Escape and blur', () => {
  const h = harness()
  assert.equal(h.render(200), null)
  let tree = h.render(), [button, panel] = tree.props.children
  assert.equal(button.type, 'button')
  assert.equal(button.props.type, 'button')
  assert.equal(button.props['aria-expanded'], false)
  assert.equal(button.props['aria-controls'], panel.props.id)
  assert.equal(panel.props.hidden, true)
  assert.equal(button.props['aria-label'], 'Above EFSA single-dose guidance')
  const note = panel.props.children[1][0]
  assert.equal(note.props.children[0], h.guidance.aboveGuidance([{ nutrient_name: 'Caffeine', amount: 250, unit: 'mg' }])[0].text)
  assert.equal(note.props.children[2].props.children, 'Source ↗')
  assert.equal(note.props.children[2].props.href, 'https://www.efsa.europa.eu/en/topics/topic/caffeine')
  tree.props.onPointerEnter({ pointerType: 'touch' }); assert.equal(h.isOpen(), false)
  button.props.onClick(); assert.equal(h.isOpen(), true)
  ;[button, panel] = h.render().props.children
  assert.equal(button.props['aria-expanded'], true); assert.equal(panel.props.hidden, false)
  button.props.onClick(); assert.equal(h.isOpen(), false)
  tree = h.render()
  tree.props.onPointerEnter({ pointerType: 'mouse' }); assert.equal(h.isOpen(), true)
  tree = h.render()
  // Escape must dismiss hover-open content without focus on the trigger.
  let prevented = false
  h.dispatch('keydown', { key: 'Escape', preventDefault: () => { prevented = true } })
  assert.equal(h.isOpen(), false); assert.equal(prevented, true); assert.equal(h.focused(), 0)
  tree = h.render()
  assert.equal(h.listeners.size, 0)
  tree.props.onPointerEnter({ pointerType: 'mouse' })
  tree = h.render()
  tree.props.children[0].props.onClick() // Hover -> pinned, rather than closed.
  tree = h.render()
  assert.equal(h.isOpen(), true)
  tree.props.onPointerLeave({ pointerType: 'mouse', currentTarget: { contains: () => false } })
  assert.equal(h.isOpen(), true)
  h.dispatch('pointerdown', { target: h.inside }); assert.equal(h.isOpen(), true)
  h.dispatch('pointerdown', { target: {} }); assert.equal(h.isOpen(), false)
  tree = h.render()
  tree.props.children[0].props.onClick()
  tree = h.render()
  tree.props.onBlur({ currentTarget: { contains: () => true } }); assert.equal(h.isOpen(), true)
  tree.props.onBlur({ currentTarget: { contains: () => false } }); assert.equal(h.isOpen(), false)
  tree = h.render()
  tree.props.onPointerEnter({ pointerType: 'mouse' })
  tree = h.render()
  tree.props.onPointerLeave({ pointerType: 'mouse', currentTarget: { contains: () => false } })
  assert.equal(h.isOpen(), false)
  tree = h.render()
  tree.props.children[0].props.onClick()
  h.render()
  h.document.activeElement = h.inside
  h.dispatch('keydown', { key: 'Escape', preventDefault() {} })
  assert.equal(h.isOpen(), false); assert.equal(h.focused(), 1)
})
