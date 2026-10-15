import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { buildSync } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
function load(file) {
  const result = buildSync({ entryPoints: [file], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime'] })
  const mod = { exports: {} }
  vm.runInNewContext(result.outputFiles[0].text, { module: mod, exports: mod.exports, require, process })
  return mod.exports
}
const { stackDoseTotals, dailyCost } = load('lib/stack-builder.ts')
const { default: Panel } = load('components/CombinedDosePanel.tsx')
const item = (name, nutrients, servings = 1) => ({ id: name, servings_per_day: servings, products: { id: name, brand: 'Fixture', name, product_nutrients: nutrients } })
const nutrient = (nutrient_name, amount, unit) => ({ nutrient_name, amount, unit })
test('combined doses convert units, multiply servings and preserve contribution amounts', () => {
  const result = stackDoseTotals([item('A', [nutrient('Creatine', 3, 'g')]), item('B', [nutrient('Creatine', 1000, 'mg')], 2)])
  assert.equal(result.length, 1)
  assert.equal(result[0].amount, 5)
  assert.equal(result[0].unit, 'g')
  assert.equal(result[0].contributions[1].amount, 2)
})
test('micrograms convert to the established guidance unit; incompatible units remain separate', () => {
  const result = stackDoseTotals([item('A', [nutrient('Vitamin D3', .05, 'mg')]), item('B', [nutrient('vitamin d', 25, 'µg'), nutrient('Vitamin D3', 1000, 'IU')])])
  assert.equal(result.length, 2)
  assert.ok(Math.abs(result.find(row => row.unit === 'mcg').amount - 75) < .00001)
  assert.equal(result.find(row => row.unit === 'IU').amount, 1000)
})
test('an unavailable exact store price never falls back to a recorded retail price', () => {
  assert.equal(dailyCost({ retail_price: 20, servings_per_container: 40 }), .5)
  assert.equal(dailyCost({ retail_price: 20, servings_per_container: 40, storePrice: { price: null } }), null)
  assert.equal(dailyCost({ retail_price: 20, servings_per_container: 0 }), null)
  assert.equal(dailyCost({ retail_price: NaN, servings_per_container: 20 }), null)
})
test('dose bars are accessible, alphabetical, extend past the track and preserve upper-level provenance', () => {
  const html = renderToStaticMarkup(React.createElement(Panel, { totals: [
    { name: 'Creatine', amount: 5, unit: 'g', contributions: [{ product: 'A', amount: 3 }, { product: 'B', amount: 2 }] },
    { name: 'Caffeine', amount: 500, unit: 'mg' },
  ] }))
  assert.ok(html.indexOf('Caffeine') < html.indexOf('Creatine'))
  assert.match(html, /role="img"/)
  assert.match(html, /Above EFSA intake guidance/)
  assert.match(html, /Evidence dose/)
  assert.match(html, /A 3 g \+ B 2 g/)
  assert.match(html, /dose-hatch/)
  assert.doesNotMatch(html, /Above UK guidance|gradient|Critical|Caution/)
})
test('context-specific and per-session ranges are not called daily evidence doses', () => {
  for (const name of ['L-Citrulline', 'Sodium']) {
    const html = renderToStaticMarkup(React.createElement(Panel, { totals: [{ name, amount: 6, unit: 'g' }] }))
    assert.doesNotMatch(html, />Evidence dose</)
    assert.match(html, /per.session|prolonged or heavy sweating/)
  }
})
