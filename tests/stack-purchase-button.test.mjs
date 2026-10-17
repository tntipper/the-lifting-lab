import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
const require = createRequire(import.meta.url)
const source = ts.transpileModule(readFileSync('components/StackPurchaseButton.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText
function button(cart, productIds = ['a'], ready = true) {
  const mod = { exports: {} }
  vm.runInNewContext(source, { exports: mod.exports, module: mod,
    require: name => name === './StagingCartContext' ? { useStagingCart: () => cart } : require(name),
  })
  return mod.exports.default({ productIds, ready }).props
}
test('no cart, disabled cart, unsupported full stacks and incomplete details show disabled Coming soon', () => {
  for (const [cart, ids, ready] of [
    [null, ['a'], true], [{ enabled: false }, ['a'], true],
    [{ enabled: true, view: { state: 'ready', productId: 'a' } }, ['a','b'], true],
    [{ enabled: true, view: { state: 'ready', productId: 'b' } }, ['a'], true],
    [{ enabled: true, view: { state: 'held', productId: 'a' } }, ['a'], true],
    [{ enabled: true, view: { state: 'ready', productId: 'a' } }, ['a'], false],
  ]) {
    const props = button(cart, ids, ready)
    assert.equal(props.disabled, true)
    assert.match(props.children, /Coming soon/)
    assert.equal(props.onClick, undefined)
  }
})
test('supported stack uses the enabled cart hook with a pack quantity, never daily servings', () => {
  const calls = [], cart = { enabled: true, busy: false, view: { state: 'ready', productId: 'a', quantity: 2 }, setQuantity: (...args) => calls.push(args) }
  const props = button(cart)
  assert.equal(props.disabled, false)
  props.onClick()
  assert.deepEqual(calls, [[3, 'a']])
  cart.busy = true
  assert.equal(button(cart).disabled, true)
  cart.busy = false; cart.view.quantity = 5
  assert.equal(button(cart).disabled, true)
})
