import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { parse } from 'csv-parse/sync'
import { seedMapping, readSource, reviewCsv } from '../scripts/seed-mapping.mjs'
import { validateProductMappings } from '../lib/commerce/product-mapping.ts'

const keys = ['catalogue', 'supplier', 'shopify', 'comparison', 'links']
const fixturePath = key => `tests/fixtures/seed-mapping/${key}.csv`
const fixtures = () => Object.fromEntries(keys.map(key => [key, parse(readFileSync(fixturePath(key)), { columns: true })]))

test('one proposal per variant, canonical IDs, leading-zero EAN, repeated supplier rows and product-level match', () => {
  const rows = seedMapping(fixtures())
  assert.equal(rows.length, 4)
  assert.equal(rows[0].shopify_variant_id, 'gid://shopify/ProductVariant/1001')
  assert.equal(rows[0].ean, '0012345678901')
  assert.equal(rows[0].match_confidence, 'historical_variant_sku')
  assert.equal(rows[1].comparison_product_id, 'comparison-protein')
  assert.equal(rows[1].match_confidence, 'historical_product')
  assert.equal(rows[1].cost_ex_vat, '9.00')
  assert.equal(rows[2].comparison_product_id, null)
  assert.equal(rows[2].cost_ex_vat, null)
  assert.match(rows[2].validation_issues, /MISSING_PRODUCT.*MISSING_COST/)
  assert.equal(rows[3].status, 'affiliate')
  assert.equal(rows[3].comparison_product_id, 'comparison-other')
  assert.ok(rows.every(row => row.active === false && row.price_auto === false && row.approval_reference === null))
  assert.ok(rows.every(row => !('published' in row)))
  assert.ok(!validateProductMappings(rows).some(issue => issue.code === 'INACTIVE_PUBLISHED'))
})

test('conflicting comparison evidence is withheld and candidates are not incorrectly called affiliate', () => {
  const source = fixtures()
  source.links.push({ tll_id: 'comparison-other', historical_shopify_product_id: '999', historical_shopify_variant_id: '1001', supplier_sku: 'OTHER' })
  const rows = seedMapping(source)
  assert.equal(rows[0].comparison_product_id, null)
  assert.equal(rows[0].match_confidence, 'ambiguous')
  assert.match(rows[0].comparison_candidates, /comparison-other/)
  assert.equal(rows.filter(row => row.status === 'affiliate').length, 0)
})

test('a specific variant/SKU link takes precedence over other flavours in the product family', () => {
  const source = fixtures()
  source.links.push({ tll_id: 'comparison-other', historical_shopify_product_id: '101', historical_shopify_variant_id: '1002', supplier_sku: 'SYN002' })
  const rows = seedMapping(source)
  assert.equal(rows[0].comparison_product_id, 'comparison-protein')
  assert.equal(rows[1].comparison_product_id, 'comparison-other')
})

test('exact brand + name can propose a family ID but is explicitly name-only, and near names do not match', () => {
  const source = fixtures()
  source.comparison.push({ id: 'placeholder-id', name: 'placeholder', brand: 'Synthetic' })
  const row = seedMapping(source)[2]
  assert.equal(row.comparison_product_id, 'placeholder-id')
  assert.equal(row.match_confidence, 'name_only')
  assert.match(row.reason, /pack\/flavour not verified/)
  source.comparison.at(-1).name = 'placeholder XL'
  assert.equal(seedMapping(source)[2].comparison_product_id, null)
})

test('conflicting supplier evidence never falls back to an attractive historical price', () => {
  const source = fixtures()
  source.supplier.push({ ...source.supplier[0], '2 Oct supplier quote £': '1.00' })
  const row = seedMapping(source)[0]
  assert.equal(row.cost_ex_vat, null)
  assert.equal(row.ean, null)
  assert.match(row.reason, /Conflicting supplier rows/)
})

test('missing supplier quote retains labelled historical cost without inventing barcode or approval', () => {
  const source = fixtures()
  source.supplier = source.supplier.filter(row => row.SKU !== 'SYN001')
  const row = seedMapping(source)[0]
  assert.equal(row.cost_ex_vat, '8.50')
  assert.equal(row.ean, null)
  assert.match(row.cost_source, /14 Sep historical/)
  assert.match(row.reason, /No 2 Oct supplier row/)
})

test('internal TLL placeholders never become proposed real supplier SKUs', () => {
  const source = fixtures()
  source.catalogue[2].SKU = 'TLL-placeholder'
  source.shopify[2].sku = 'TLL-placeholder'
  const row = seedMapping(source)[2]
  assert.equal(row.supplier_sku, null)
  assert.equal(row.shopify_sku_observed, 'TLL-placeholder')
  assert.match(row.validation_issues, /MISSING_SKU/)
})

test('reject missing/duplicate variants, malformed IDs, missing headers and empty inputs', () => {
  for (const mutate of [
    source => source.shopify.pop(),
    source => source.shopify.push({ ...source.shopify[0] }),
    source => { source.catalogue[0]['Shopify product ID'] = 'broken' },
    source => source.catalogue.push({ ...source.catalogue[0] }),
    source => { delete source.supplier[0]['2 Oct barcode'] },
    source => { source.comparison = [] },
    source => source.comparison.push({ ...source.comparison[0] }),
  ]) { const source = fixtures(); mutate(source); assert.throws(() => seedMapping(source)) }
})

test('CSV round-trip preserves quoted reasons and blank approval', () => {
  const rows = parse(reviewCsv(seedMapping(fixtures())), { columns: true })
  assert.match(rows[0].reason, /Label needs review, including flavour/)
  assert.equal(rows[0].ean, '0012345678901')
  assert.ok(rows.every(row => row.active === 'false' && row.price_auto === 'false' && row.approval_reference === ''))
})

test('local reader rejects URLs and duplicate headers', async () => {
  await assert.rejects(readSource('https://example.invalid/source.csv'))
  const dir = mkdtempSync(join(tmpdir(), 'seed-reader-'))
  try {
    const path = join(dir, 'bad.csv'); writeFileSync(path, 'id,id\nx,y\n')
    await assert.rejects(readSource(path))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('CLI is deterministic, integrates with mapping-check and preserves existing output on bad inputs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'seed-cli-')), output = join(dir, 'review.csv')
  const args = keys.flatMap(key => [`--${key}`, fixturePath(key)])
  const run = extra => spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/seed-mapping.mjs', ...args, '--output', output, ...extra], { encoding: 'utf8' })
  try {
    assert.equal(run([]).status, 0)
    const first = readFileSync(output, 'utf8')
    assert.equal(run([]).status, 0)
    assert.equal(readFileSync(output, 'utf8'), first)
    const check = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/mapping-check.mjs', '--input', output], { encoding: 'utf8' })
    assert.equal(check.status, 2)
    assert.deepEqual(JSON.parse(check.stdout).issues.map(issue => issue.code), ['MISSING_PRODUCT', 'MISSING_COST'])
    assert.equal(run(['--supplier', join(dir, 'missing.csv')]).status, 1)
    assert.equal(readFileSync(output, 'utf8'), first)
    assert.equal(run(['--output', fixturePath('catalogue')]).status, 1)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
