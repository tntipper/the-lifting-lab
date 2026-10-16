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

test('caffeine 400 mg is labelled EFSA intake guidance, not a UL, in the stack nudge', () => {
  const { NUTRIENT_LIMITS, analyseStack } = load('lib/nutrient-limits.ts')
  assert.equal(NUTRIENT_LIMITS.Caffeine.limitLabel, 'EFSA intake guidance')
  assert.equal(NUTRIENT_LIMITS.Caffeine.note, 'EFSA intake guidance: 400 mg/day from all sources for healthy adults (200 mg/day if pregnant or breastfeeding), not a UL.')
  const flags = analyseStack([{ servings_per_day: 1, products: { brand: 'Fixture', name: 'Pre', product_nutrients: [{ nutrient_name: 'Caffeine', amount: 400, unit: 'mg' }] } }])
  const flag = flags.find(f => f.nutrientName === 'Caffeine')
  assert.equal(flag.limitLabel, 'EFSA intake guidance')
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
    assert.equal(`${ref.minimum}–${ref.maximum} ${ref.unit} ${ref.timing}. ${ref.context}`, '6–8 g L-citrulline (about 9–12 g citrulline malate 2:1) per session, 45–60 min pre-workout. A per-session dose, not a daily target.')
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
test('Oath evening-caffeine sentences in dosage and combos', () => {
  assert.match(source('lib/dosage.ts'), /If you train in the evening, consider a stim-free option: caffeine\\'s half-life averages around 5 hours in healthy adults but varies widely between people, so late doses can disrupt sleep\./)
  assert.match(source('lib/combos.ts'), /so late doses can disrupt your sleep\./)
  assert.doesNotMatch(source('lib/combos.ts'), /wreck your sleep/)
})
