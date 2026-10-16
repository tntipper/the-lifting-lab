import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
const require = createRequire(import.meta.url)

function harness() {
  let open = false, focused = 0
  const activeElement = {}
  const react = { useId: () => 'guidance-test', useRef: () => ({ current: { focus: () => focused++ } }), useState: () => [open, value => { open = typeof value === 'function' ? value(open) : value }] }
  function load(file, overrides = {}) {
    const mod = { exports: {} }
    const js = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
    vm.runInNewContext(js, { module: mod, exports: mod.exports, document: { activeElement }, require: name => overrides[name] ?? require(name) })
    return mod.exports
  }
  
  const Component = load('components/InformedSportIcon.tsx', { react, '@/components/shop.module.css': { __esModule: true, default: {} } }).default
  const render = (certified = true, sourceUrl) => Component({ certified, sourceUrl })
  return { render, isOpen: () => open, focused: () => focused, activeElement }
}


test('certification supports mouse, tap, keyboard Escape, focus within and optional safe source', () => {
  const h = harness()
  assert.equal(h.render(false), null)
  assert.equal(h.render(null), null)
  let tree = h.render(), [button, panel] = tree.props.children
  assert.equal(button.type, 'button')
  assert.equal(button.props.type, 'button')
  assert.equal(button.props['aria-label'], 'Informed Sport certified')
  assert.equal(button.props['aria-controls'], panel.props.id)
  assert.equal(panel.props.hidden, true)
  assert.equal(panel.props.children[0].props.children, 'Informed Sport certified')
  assert.equal(panel.props.children[1], null)
  assert.equal(h.render(true, 'javascript:alert(1)').props.children[1].props.children[1], null)
  const link = h.render(true, 'https://example.com/certified').props.children[1].props.children[1]
  assert.equal(link.props.href, 'https://example.com/certified')
  assert.equal(link.props.rel, 'noopener noreferrer')
  tree.props.onPointerEnter({ pointerType: 'touch' }); assert.equal(h.isOpen(), false)
  button.props.onClick(); assert.equal(h.isOpen(), true)
  ;[button, panel] = h.render().props.children
  assert.equal(button.props['aria-expanded'], true); assert.equal(panel.props.hidden, false)
  button.props.onClick(); assert.equal(h.isOpen(), false)
  tree.props.onPointerEnter({ pointerType: 'mouse' }); assert.equal(h.isOpen(), true)
  tree.props.onPointerLeave({ pointerType: 'mouse', currentTarget: { contains: () => false } }); assert.equal(h.isOpen(), false)
  button.props.onClick()
  tree.props.onPointerLeave({ pointerType: 'mouse', currentTarget: { contains: () => true } }); assert.equal(h.isOpen(), true)
  tree.props.onBlur({ currentTarget: { contains: () => true } }); assert.equal(h.isOpen(), true)
  tree.props.onBlur({ currentTarget: { contains: () => false } }); assert.equal(h.isOpen(), false)
  button.props.onClick()
  let prevented = false
  tree.props.onKeyDown({ key: 'Escape', preventDefault: () => { prevented = true } })
  assert.equal(h.isOpen(), false); assert.equal(h.focused(), 1); assert.equal(prevented, true)
})
