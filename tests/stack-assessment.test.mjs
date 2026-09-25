import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const require = createRequire(import.meta.url)
function projection(scores) {
  const modules = new Map()
  function load(name) {
    if (modules.has(name)) return modules.get(name)
    const js = ts.transpileModule(readFileSync(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const mod = { exports: {} }
    vm.runInNewContext(js, { module: mod, exports: mod.exports, require: dependency => dependency === '@/lib/scores'
      ? { scoreFor: (_brand, productName) => scores[productName] ?? null }
      : dependency.startsWith('./') ? load(dependency.slice(2)) : require(dependency) })
    modules.set(name, mod.exports); return mod.exports
  }
  return load('stack-assessment')
}
const product = (id, name, category = 'creatine') => ({ id, brand: 'Fixture', name, category, score: 100 })
test('unapproved stack research shows no average even when old values exist', () => {
  const p = projection({ a: 80, b: 60, held: 100, zero: 0 })
  const rows = [product('a', 'a'), product('b', 'b'), product('c', 'held', 'zma'), product('d', 'zero'), product('e', 'missing')]
  const summary = p.summariseStackAssessments(rows, 6)
  assert.equal(summary.average, null); assert.equal(summary.included, 0); assert.equal(summary.total, 6)
  assert.equal(summary.underReview, 1); assert.equal(summary.unassessed, 5)
  assert.match(summary.text, /0 of 6/); assert.match(summary.text, /not a combined-stack assessment/)
  assert.match(summary.text, /Scientific review is incomplete/)
  assert.equal(p.catalogueAssessment(rows[0]).score, 80, 'Caller score 100 must not replace the trusted lookup')
})
test('an entirely held or unassessed stack has no numeric average or quality grade', () => {
  const p = projection({ held: 99, zero: 0, invalid: Infinity })
  const rows = [product('a', 'held', 'hormone-support'), product('b', 'zero'), product('c', 'invalid')]
  const summary = p.summariseStackAssessments(rows)
  assert.equal(summary.average, null); assert.equal(summary.included, 0)
  const text = p.stackResearchText(rows)
  assert.match(text, /No approved product effectiveness assessment/); assert.match(text, /Under review; no benefit recommendation/)
  assert.match(text, /Not assessed/); assert.doesNotMatch(text, /scored 99|Excellent|Good dosing|evidence-based UK/)
})
test('every held category has the same caption gate and duplicate rows cannot inflate the included count', () => {
  const p = projection({ a: 80 })
  for (const category of ['cycle-support', 'liver-health', 'hormone-support', 'zma']) {
    assert.match(p.assessmentText({ category, score: 80 }), /Under review.*no benefit recommendation/)
  }
  const duplicate = p.summariseStackAssessments([product('a', 'a'), product('a', 'a')])
  assert.equal(duplicate.included, 0); assert.equal(duplicate.total, 1); assert.equal(duplicate.unassessed, 1)
  assert.match(p.assessmentText({ category: 'creatine', score: 80 }), /Not assessed; no benefit recommendation/)
})
