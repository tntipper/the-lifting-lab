import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const source = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
function load(file, overrides = {}) {
  const js = ts.transpileModule(source(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText
  const mod = { exports: {} }
  vm.runInNewContext(js, { module: mod, exports: mod.exports,
    require: name => Object.hasOwn(overrides, name) ? overrides[name] : require(name),
  }, { filename: file })
  return mod.exports
}

// Run the component's actual calculation, substituting only the React input hooks.
function beta(weight, unit = 'kg', form = 'standard') {
  let index = 0, result
  const states = [unit, String(weight), form, 300]
  const component = load('app/calculators/beta-alanine/BetaAlanineCalculator.tsx', {
    react: { useState: () => [states[index++], () => {}], useMemo: fn => (result = fn()) },
    'next/link': () => null, '@/lib/gtag': { track() {} },
  })
  component.default()
  return result
}
for (const form of ['standard', 'sr']) {
  test(`beta-alanine ${form}: rounded floor and ceiling stay at 3.2g and 6.4g`, () => {
    assert.equal(beta(40, 'kg', form).daily, 3.2)
    assert.equal(beta(120, 'kg', form).daily, 6.4)
    assert.equal(beta(80, 'lb', form).daily, 3.2)
    assert.equal(beta(265, 'lb', form).daily, 6.4)
    assert.equal(beta(70, 'kg', form).daily, 4.5)
  })
}
test('beta-alanine range holds across positive weights and both unit systems', () => {
  for (const unit of ['kg', 'lb']) for (let weight = 1; weight <= 300; weight++) {
    const { daily } = beta(weight, unit)
    assert.ok(daily >= 3.2 && daily <= 6.4, `${weight}${unit}: ${daily}g`)
  }
  assert.equal(beta(0), null)
  assert.equal(beta(-10), null)
})
test('citrulline conversion delivers both pure targets from both malate ratios', () => {
  // Use the unchanged real form conversion, with target/form hooks set explicitly.
  const text = source('app/calculators/citrulline/CitrullineCalculator.tsx')
  const body = text.match(/function half\(n: number\): number \{([\s\S]*?)\n\}/)[1]
  const expression = text.match(/const productDose = ([^\n]+)/)[1]
  const convert = vm.runInNewContext(`(target, frac) => { function half(n) { ${body} }; const meta = { frac }; return ${expression} }`)
  assert.deepEqual([convert(6, 2 / 3), convert(8, 2 / 3)], [9, 12])
  assert.deepEqual([convert(6, 0.5), convert(8, 0.5)], [12, 16])
  const items = load('lib/dosage.ts').DOSE_ITEMS
  const citrulline = items.find(item => item.id === 'l-citrulline')
  assert.match(citrulline.dose, /6–8 g pure; 9–12 g malate 2:1; 12–16 g malate 1:1/)
  assert.match(citrulline.detail, /9 to 12 g of citrulline malate 2:1 or 12 to 16 g of citrulline malate 1:1/)
  const combos = JSON.stringify(load('lib/combos.ts').evaluateCombo(['citrulline', 'pre-workout']))
  assert.match(combos, /6–8g pure L-citrulline = 9–12g citrulline malate 2:1 = 12–16g citrulline malate 1:1/)
})
test('ashwagandha dosage includes contraindications and liver stop advice', () => {
  const { detail } = load('lib/dosage.ts').DOSE_ITEMS.find(item => item.id === 'ashwagandha')
  for (const warning of ['liver injury', 'stop and see a doctor', 'jaundice', 'dark urine', 'upper-right abdominal pain',
    'pregnancy', 'breastfeeding', 'thyroid conditions', 'autoimmune disease', 'liver conditions', 'hormone-sensitive cancers',
    'planned surgery', 'sedatives', 'thyroid medication']) assert.ok(detail.includes(warning), warning)
})
test('nutrient flags distinguish vitamin C guidance and iron safe level from ULs', () => {
  const { NUTRIENT_LIMITS, analyseStack } = load('lib/nutrient-limits.ts')
  const items = ['Vitamin C', 'Iron', 'Vitamin D3'].map(name => ({ servings_per_day: 1,
    products: { brand: 'Fixture', name, product_nutrients: [{ nutrient_name: name, amount: NUTRIENT_LIMITS[name].ul, unit: NUTRIENT_LIMITS[name].unit }] },
  }))
  const flags = analyseStack(items)
  for (const [name, value, label] of [['Vitamin C', 1000, 'UK EVM guidance'], ['Iron', 40, 'EFSA safe level'], ['Vitamin D3', 100, 'EFSA UL']]) {
    const flag = flags.find(flag => flag.nutrientName === name)
    assert.equal(flag.ul, value)
    assert.equal(flag.percentage, 100)
    assert.equal(flag.limitLabel, label)
  }
  assert.match(NUTRIENT_LIMITS['Vitamin C'].note, /supplemental.*not an EFSA UL/)
  assert.match(NUTRIENT_LIMITS.Iron.note, /total iron.*not a UL/)
})
test('PT-141 is excluded from the licensed medicine list and explicitly not UK-licensed', () => {
  const text = source('app/peptides/page.tsx')
  assert.match(text, /PT-141 is not UK-licensed/)
  assert.doesNotMatch(text, /licensed medicine —[^—]*PT-141/)
})
test('caffeine half-life copy uses 5-6 hours and clearly describes the 5-hour estimate', () => {
  const calculator = source('app/calculators/caffeine/CaffeineCalculator.tsx')
  const page = source('app/calculators/caffeine/page.tsx')
  assert.match(calculator, /const HALF_LIFE_H = 5\b/)
  assert.match(calculator, /half-life of 5-6 hours/)
  assert.match(calculator, /This estimate uses 5 hours/)
  assert.doesNotMatch(page, /roughly 5 hours|~5 hour|about a 5 hour|Because of the 5 hour/)
  assert.match(page, /half-life of 5-6 hours/)
  assert.match(page, /estimates a latest intake time using a 5-hour half-life/)
})
