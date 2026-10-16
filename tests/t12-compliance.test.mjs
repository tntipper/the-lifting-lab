import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { spawnSync } from 'node:child_process'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup as render } from 'react-dom/server'
import { parse } from 'csv-parse/sync'
import { scanText, scanFile } from '../scripts/claims-scan.mjs'
import { buildChecklist, checklistCsv } from '../scripts/compliance-checklist.mjs'

const root = fileURLToPath(new URL('../', import.meta.url)), require = createRequire(import.meta.url)
function modules() {
  const cache = new Map()
  function load(path) {
    if (cache.has(path)) return cache.get(path)
    const filename = resolve(root, path), mod = { exports: {} }
    const js = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText
    const local = name => {
      if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }
      if (name === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) }
      if (name === 'next/navigation') return { useRouter: () => ({ back() {} }) }
      if (name === '@/lib/preview-mode') return { isSyntheticPreview: () => false, isIsolatedEnvironment: () => false }
      if (name === '@/components/LocalStackContext') return { useLocalStack: () => ({ inStack: () => false, toggle() {} }) }
      if (name.startsWith('@/components/') && !['@/components/ProductWarnings', '@/components/PolicyDraftNotice', '@/components/SiteFooter'].includes(name)) return { __esModule: true, default: () => null }
      if (name === './RelatedProducts') return { __esModule: true, default: () => null }
      if (name.startsWith('@/') || name.startsWith('.')) {
        const base = name.startsWith('@/') ? resolve(root, name.slice(2)) : resolve(dirname(filename), name)
        const hit = [base, base + '.ts', base + '.tsx', base + '.mjs'].find(existsSync)
        assert.ok(hit, name)
        if (hit.endsWith('.mjs')) return { submissionSizeError: () => null }
        return load(relative(root, hit))
      }
      return require(name)
    }
    vm.runInNewContext(js, { require: local, module: mod, exports: mod.exports, process: { env: {} },
      URL, URLSearchParams, fetch: () => { throw new Error('No network permitted') } }, { filename })
    cache.set(path, mod.exports); return mod.exports
  }
  return load
}
const load = modules(), warnings = load('lib/commerce/product-warnings.ts').productWarningsFor
const htmlFor = (path, props = {}) => render(React.createElement(load(path).default, props))

test('claims scanner catches case, inflections, hyphens, negations and reports line numbers', () => {
  const hits = scanText('CURE cures curing\nTreat treatment preventing prevention detox detoxification fat-burning miracle disease')
  assert.deepEqual(hits.map(h => h.keyword), ['CURE', 'cures', 'curing', 'Treat', 'treatment', 'preventing', 'prevention', 'detox', 'detoxification', 'fat-burning', 'miracle', 'disease'])
  assert.equal(hits.find(h => h.keyword === 'Treat').line, 2)
  assert.equal(scanText('does not treat illness').length, 1)
  assert.equal(scanText('creatine prevents illness').length, 1)
  assert.equal(scanText('creatine; dietary protein; preventionist; treatmentology').length, 0)
})

test('scanner handles multiline CSV copy but excludes IDs, URLs and private review notes', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 't12-scan-'))
  try {
    const path = resolve(dir, 'copy.csv')
    writeFileSync(path, 'id,name,description,buy_url,reason\nprevent,Plain,"line one\nCures illness",https://example.test/detox,treat\n')
    const hits = scanFile(path)
    assert.equal(hits.length, 1); assert.equal(hits[0].keyword, 'Cures'); assert.equal(hits[0].line, 2)
    writeFileSync(path, 'id,url\n1,foo\n')
    assert.throws(() => scanFile(path), /copy column/)
    writeFileSync(path, 'name,description\nfoo,"unterminated')
    assert.throws(() => scanFile(path))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('scanner CLI distinguishes clean copy, findings and invalid input', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 't12-cli-'))
  const run = args => spawnSync(process.execPath, ['scripts/claims-scan.mjs', ...args], { cwd: root, encoding: 'utf8' })
  try {
    const path = resolve(dir, 'copy.txt'); writeFileSync(path, 'recorded creatine dose')
    assert.equal(run([path]).status, 0)
    writeFileSync(path, 'Cure'); assert.equal(run([path]).status, 1)
    assert.equal(run([resolve(dir, 'missing.txt')]).status, 2)
    assert.equal(run([]).status, 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('every locally recorded store variant has one unsigned checklist row, including placeholders and holds', () => {
  const rows = parse(readFileSync(resolve(root, 'data/mapping-review.csv'), 'utf8'), { columns: true })
  const built = buildChecklist(rows)
  const saved = parse(readFileSync(resolve(root, 'docs/compliance-checklist.csv'), 'utf8'), { columns: true })
  assert.deepEqual(saved, built); assert.equal(saved.length, 74)
  assert.equal(new Set(saved.map(r => r.shopify_variant_id)).size, 74)
  assert.equal(new Set(saved.map(r => r.sku)).size, 74)
  for (const row of saved) {
    assert.equal(row.signed_by, ''); assert.equal(row.signed_date, '')
    for (const field of ['NHC claims', 'novel food', 'WADA', 'warnings']) assert.match(row[field], /^TODO:/)
  }
  assert.ok(saved.some(row => row.sku.startsWith('TLL')))
  assert.equal(checklistCsv(built), readFileSync(resolve(root, 'docs/compliance-checklist.csv'), 'utf8'))
  assert.throws(() => buildChecklist([]), /No local/)
  assert.throws(() => buildChecklist([rows[0], rows[0]]), /duplicate/)
  assert.throws(() => buildChecklist([{ ...rows[0], shopify_sku_observed: '' }]), /Missing observed SKU/)
})

test('caffeine notice applies at any positive recorded dose and cannot be suppressed by metadata', () => {
  for (const amount of [1, 100, 500]) {
    const result = warnings({ category: 'eaa', safety: { containsCaffeine: false }, nutrients: [{ nutrient_name: 'Caffeine anhydrous', amount, unit: 'mg' }] })
    assert.equal(result.length, 2); assert.match(result[0].text, /pregnant/); assert.match(result[1].text, /16\+/)
  }
  for (const amount of [0, -1, NaN, Infinity]) assert.equal(warnings({ category: 'creatine', nutrients: [{ nutrient_name: 'caffeine', amount, unit: 'mg' }] }).length, 0)
})

test('category age notice, explicit label data and stricter ages work without product-name rules', () => {
  assert.equal(warnings({ category: 'pre-workout', nutrients: [] }).length, 1)
  assert.equal(warnings({ category: 'creatine' }).length, 0)
  const result = warnings({ category: 'pre-workout', safety: { containsCaffeine: true, minimumAge: 18, labelWarnings: ['Do not exceed the label portion.', ' '] } })
  assert.equal(result.length, 3); assert.match(result[1].text, /18\+/)
  assert.match(warnings({ category: 'pre-workout', safety: { minimumAge: 12 } })[0].text, /16\+/)
})

test('real product page renders caffeine and age warnings even while claims are under review', () => {
  const product = { id: 'fixture', brand: 'Fixture', name: 'Example', category: 'hormone-support', score: null, nutrients: [{ nutrient_name: 'caffeine', amount: 10, unit: 'mg' }], retail_price: null }
  const html = htmlFor('app/products/[id]/ProductDetailPage.tsx', { product, related: [] })
  assert.match(html, /aria-label="Label notes"/); assert.match(html, /Contains caffeine/); assert.match(html, /16\+/)
  assert.equal(htmlFor('components/ProductWarnings.tsx', { product: { ...product, category: 'creatine', nutrients: [] } }), '')
  const label = htmlFor('components/ProductWarnings.tsx', { product: { ...product, safety: { labelWarnings: ['<script>unsafe</script>'] } } })
  assert.match(label, /&lt;script&gt;/); assert.doesNotMatch(label, /<script>unsafe/)
})

test('footer links resolve to all five policy/contact pages', () => {
  const html = htmlFor('components/SiteFooter.tsx')
  assert.match(html, /THE LIFTING LAB LTD · Company no. 17497631/)
  assert.match(html, /href="\/guide"/)
  assert.match(html, /https:\/\/www.instagram.com\/theliftinglabuk\//)
  assert.match(html, /https:\/\/www.tiktok.com\/@theliftinglab/)
  for (const route of ['refunds', 'delivery', 'privacy', 'terms', 'contact']) {
    assert.ok(existsSync(resolve(root, `app/${route}/page.tsx`)))
    assert.match(html, new RegExp(`href="/${route}"`))
  }
})

test('policy pages render draft markers, operational TODOs and required policy copy', () => {
  const delivery = htmlFor('app/delivery/page.tsx'), refunds = htmlFor('app/refunds/page.tsx')
  const privacy = htmlFor('app/privacy/page.tsx'), terms = htmlFor('app/terms/page.tsx'), contact = htmlFor('app/contact/page.tsx')
  for (const html of [delivery, refunds, privacy, terms, contact]) {
    assert.match(html, /Draft for Lifty and Toby review/); assert.match(html, /TODO/)
  }
  assert.match(delivery, /£4.99 per customer order/); assert.match(delivery, /TLL absorbs supplier dispatch/); assert.doesNotMatch(delivery, /£6|TropShip|cost_ex_vat/)
  assert.match(refunds, /14 days/); assert.match(refunds, /statutory rights/)
  assert.match(privacy, /Supabase/); assert.match(privacy, /Shopify/); assert.match(privacy, /Suppliers and couriers/)
  assert.match(terms, /statutory consumer rights/)
  assert.match(contact, /mailto:hello@theliftinglab.co.uk/)
  assert.equal((contact.match(/Draft for Lifty and Toby review/g) ?? []).length, 1)
})


test('checklist regeneration refuses to erase human review or signatures', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 't12-checklist-'))
  try {
    mkdirSync(resolve(dir, 'data')); mkdirSync(resolve(dir, 'docs'))
    writeFileSync(resolve(dir, 'data/mapping-review.csv'), readFileSync(resolve(root, 'data/mapping-review.csv')))
    const run = () => spawnSync(process.execPath, [resolve(root, 'scripts/compliance-checklist.mjs')], { cwd: dir, encoding: 'utf8' })
    assert.equal(run().status, 0)
    const output = resolve(dir, 'docs/compliance-checklist.csv')
    const original = readFileSync(output, 'utf8')
    assert.equal(run().status, 0); assert.equal(readFileSync(output, 'utf8'), original)
    const reviewedRows = parse(original, { columns: true })
    reviewedRows[0].signed_by = 'Synthetic reviewer'; reviewedRows[0].signed_date = '2026-10-12'
    const reviewed = checklistCsv(reviewedRows)
    writeFileSync(output, reviewed)
    const failed = run(); assert.equal(failed.status, 1)
    assert.match(failed.stderr, /preserve manual review/)
    assert.equal(readFileSync(output, 'utf8'), reviewed)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
