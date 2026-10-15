import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

async function load(entry) {
  const output = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`)
}
const { sortScored } = await load('lib/products.ts')
const { aboveGuidance } = await load('lib/shop-guidance.ts')
const row = (id, retail_price, cost_per_serving) => ({ id, name: id, category: 'creatine', score: null, retail_price, cost_per_serving })

test('pack price and serving cost order differently, missing and invalid prices last', () => {
  const rows = [row('big', 40, .2), row('small', 10, 1), row('missing', null, null), row('zero', 0, 0), row('invalid', NaN, NaN)]
  assert.deepEqual(sortScored(rows, 'price').slice(0, 2).map(p => p.id), ['small', 'big'])
  assert.deepEqual(sortScored(rows, 'budget').slice(0, 2).map(p => p.id), ['big', 'small'])
  assert.equal(rows[0].id, 'big', 'Sorting must not mutate the catalogue')
})
test('guidance note uses known caffeine units, combines rows, and excludes the exact threshold', () => {
  const caffeine = (amount, unit = 'mg') => ({ nutrient_name: 'Caffeine', amount, unit })
  assert.equal(aboveGuidance([caffeine(200)]).length, 0)
  assert.equal(aboveGuidance([caffeine(.4, 'g')]).length, 1)
  assert.match(aboveGuidance([caffeine(150), caffeine(100)])[0].text, /250 mg per serving/)
  for (const amount of [NaN, Infinity, -1]) assert.deepEqual(aboveGuidance([caffeine(amount)]), [])
  assert.deepEqual(aboveGuidance([caffeine(400, 'mcg')]), [])
  assert.deepEqual(aboveGuidance([caffeine(400, 'unknown')]), [])
  assert.deepEqual(aboveGuidance([{ nutrient_name: 'Guarana extract', amount: 500, unit: 'mg' }]), [])
  assert.deepEqual(aboveGuidance([caffeine(400), caffeine(1, 'unknown')]), [])
})
