import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const source = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
function load(file) {
  const js = ts.transpileModule(source(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const mod = { exports: {} }
  vm.runInNewContext(js, { module: mod, exports: mod.exports, require }, { filename: file })
  return mod.exports
}

test('caffeine 400 mg is labelled an EFSA safe level, not a UL, in the stack warning', () => {
  const { NUTRIENT_LIMITS, analyseStack } = load('lib/nutrient-limits.ts')
  assert.equal(NUTRIENT_LIMITS.Caffeine.limitLabel, 'EFSA safe level')
  assert.match(NUTRIENT_LIMITS.Caffeine.note, /not a UL/)
  const flags = analyseStack([{ servings_per_day: 1, products: { brand: 'Fixture', name: 'Pre', product_nutrients: [{ nutrient_name: 'Caffeine', amount: 400, unit: 'mg' }] } }])
  const flag = flags.find(f => f.nutrientName === 'Caffeine')
  assert.equal(flag.limitLabel, 'EFSA safe level')
})
test('daily totals compare safety-limit-only nutrients with the same limit label as the warning', () => {
  const panel = source('components/CombinedDosePanel.tsx')
  assert.match(panel, /upperLimit\.limitLabel \?\? 'EFSA UL'/)
  assert.match(panel, /limitStatus \?\? 'Reference range unavailable'/)
})
test('citrulline 6-8 g is a per-session range, not a daily target', () => {
  const { referenceRangeFor } = load('lib/stack-reference-ranges.ts')
  for (const name of ['L-Citrulline', 'Citrulline']) {
    const ref = referenceRangeFor(name)
    assert.equal(ref.perSession, true)
    assert.match(ref.timing, /per session/)
    assert.match(ref.context, /not a daily target/)
  }
  assert.match(source('components/CombinedDosePanel.tsx'), /reference\.perSession \? 'Per-session range: compare one serving, not this daily total'/)
})
test('remaining caffeine half-life copy uses the Oath canonical wording', () => {
  const canon = /half-life averages around 5 hours in healthy\s+adults but varies widely(?:\s+between people)?/
  for (const file of ['lib/sleep.ts', 'app/combine/page.tsx', 'app/calculators/timing/TimingPlanner.tsx', 'lib/dosage.ts', 'lib/combos.ts']) {
    const text = source(file)
    assert.match(text, canon, file)
    assert.doesNotMatch(text, /five to six hours|5 to 6 hour|5-6 hour/, file)
  }
})
