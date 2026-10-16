import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { validateProductMappings, toExactMapping, presentStoreLinkMapping } from '../lib/commerce/product-mapping.ts'

const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/product-mapping/valid.json', import.meta.url)))[0]
const codes = rows => validateProductMappings(rows).map(issue => issue.code)

test('valid inactive saved row and unmapped affiliate/not_sold rows pass', () => {
  assert.deepEqual(codes([fixture()]), [])
  for (const status of ['affiliate', 'not_sold']) assert.deepEqual(codes([
    { ...fixture(), status, shopify_product_id: null, shopify_variant_id: null, supplier_sku: null, cost_ex_vat: null },
  ]), [])
})
for (const [name, patch, code] of [
  ['missing SKU', { supplier_sku: ' ' }, 'MISSING_SKU'],
  ['missing cost', { cost_ex_vat: null }, 'MISSING_COST'],
  ['active without approval', { active: true }, 'ACTIVE_WITHOUT_APPROVAL'],
  ['inactive but published', { published: true }, 'INACTIVE_PUBLISHED'],
  ['negative cost', { cost_ex_vat: -1 }, 'INVALID_COST'],
  ['non-numeric cost', { cost_ex_vat: 'NaN' }, 'INVALID_COST'],
  ['blank cost', { cost_ex_vat: ' ' }, 'INVALID_COST'],
  ['bad status', { status: 'active' }, 'INVALID_STATUS'],
  ['boolean string', { active: 'false' }, 'INVALID_BOOLEAN'],
  ['unsafe numeric Shopify ID', { shopify_variant_id: 1001 }, 'INVALID_SHOPIFY_ID'],
  ['automatic pricing on inactive row', { price_auto: true }, 'INVALID_PRICE_AUTO'],
]) test(name, () => assert.ok(codes([{ ...fixture(), ...patch }]).includes(code)))

test('duplicate variants across suppliers and numeric/GID aliases are flagged', () => {
  assert.ok(codes([fixture(), { ...fixture(), supplier: 'another', shopify_variant_id: '1001' }]).includes('DUPLICATE_VARIANT'))
})
test('malformed rows report codes without leaking values', () => {
  assert.deepEqual(codes([null, []]), ['INVALID_ROW', 'INVALID_ROW'])
  assert.ok(!JSON.stringify(validateProductMappings([{ ...fixture(), cost_ex_vat: 'PRIVATE-COST' }])).includes('PRIVATE-COST'))
})
test('active row with approval and published state passes', () => {
  assert.deepEqual(codes([{ ...fixture(), active: true, published: true, approval_reference: 'synthetic-review' }]), [])
})

const pack = { version: 'pack-v1', sellingUnit: 'single', innerCount: 1, amountPerInner: 500, unit: 'g' }
const identity = { formulaId: 'formula', formulaVersion: 'v1', flavourId: 'vanilla', labelVersion: 'v1', pack }
function reviewedRow() {
  return { ...fixture(), review: { approved: false, version: 'v1', expectedVersion: 'v2', verifiedAtMs: 1, expiresAtMs: 2 },
    mapping_status: 'ambiguous', mapping_source: 'feed_estimate', pack, flavour: 'vanilla',
    shop_identity: identity, supplier_identity: structuredClone(identity) }
}
test('conversion preserves evidence without inventing exactness or approval and strips costs', () => {
  const row = reviewedRow(), mapping = toExactMapping(row)
  assert.equal(mapping.status, 'ambiguous'); assert.equal(mapping.source, 'feed_estimate')
  assert.equal(mapping.review.approved, false); assert.equal(mapping.review.expectedVersion, 'v2')
  assert.equal(mapping.productId, row.comparison_product_id)
  assert.equal(mapping.shopifyVariantId, row.shopify_variant_id)
  assert.equal(mapping.supplierSku, row.supplier_sku)
  assert.ok(!('cost_ex_vat' in mapping)); assert.ok(!('supplier' in mapping))
  mapping.shopIdentity.pack.innerCount = 99
  assert.equal(row.shop_identity.pack.innerCount, 1)
})
test('conversion refuses absent or malformed reviewed identities', () => {
  assert.throws(() => toExactMapping({ ...fixture(), approval_reference: 'reference-only' }))
  assert.throws(() => toExactMapping({ ...reviewedRow(), supplier_identity: { ...identity, pack: { ...pack, innerCount: 0 } } }))
  assert.throws(() => toExactMapping({ ...reviewedRow(), review: { ...reviewedRow().review, expiresAtMs: 0 } }))
  assert.throws(() => toExactMapping({ ...reviewedRow(), flavour: 'chocolate' }))
  assert.throws(() => toExactMapping({ ...reviewedRow(), pack: { ...pack, amountPerInner: 1000 } }))
})

const run = path => spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/mapping-check.mjs', '--input', path], { encoding: 'utf8' })
test('CLI accepts JSON fixture and rejects CSV fixture with non-zero exit', () => {
  const valid = run('tests/fixtures/product-mapping/valid.json')
  assert.equal(valid.status, 0, valid.stderr); assert.equal(JSON.parse(valid.stdout).errors, 0)
  const invalid = run('tests/fixtures/product-mapping/invalid.csv')
  assert.equal(invalid.status, 2, invalid.stderr)
  assert.deepEqual(JSON.parse(invalid.stdout).issues.map(issue => issue.code).sort(), ['INACTIVE_PUBLISHED', 'MISSING_COST', 'MISSING_SKU'])
})
test('CLI parses quoted CSV and reports unchecked publication; malformed input is redacted', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mapping-check-'))
  try {
    const path = join(dir, 'valid.csv')
    writeFileSync(path, 'comparison_product_id,status,active,price_auto\r\n"synthetic, quoted",affiliate,false,false\r\n')
    const result = run(path)
    assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).publicationUncheckedRows, 1)
    for (const [name, content] of [['bad.json', '{PRIVATE-COST'], ['empty.json', '[]'],
      ['bad.csv', 'status,status\nstore,affiliate'], ['bool.csv', 'comparison_product_id,status,active,price_auto\nx,affiliate,FALSE,false']]) {
      const file = join(dir, name); writeFileSync(file, content)
      const bad = run(file); assert.notEqual(bad.status, 0); assert.ok(!bad.stderr.includes('PRIVATE-COST'))
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

const sql = readFileSync(new URL('../supabase/migrations/202610110017_product_mapping.sql', import.meta.url), 'utf8')
test('static SQL: private table, RLS and no client grants, policies or public views', () => {
  assert.match(sql, /create table tll_mapping_private\.product_mapping/)
  assert.match(sql, /alter table tll_mapping_private\.product_mapping enable row level security/)
  assert.match(sql, /revoke all on schema tll_mapping_private from public, anon, authenticated/)
  assert.match(sql, /revoke all on table tll_mapping_private\.product_mapping from public, anon, authenticated/)
  assert.match(sql, /grant select, insert, update, delete on table tll_mapping_private\.product_mapping to service_role/)
  assert.doesNotMatch(sql, /create\s+(?:policy|view)|grant[^;]*\bto\s+(?:anon|authenticated|public)\b/i)
})
test('static SQL: unique canonical variant, costs, default-off flags and update timestamps', () => {
  assert.match(sql, /shopify_variant_id text unique check/)
  assert.match(sql, /gid:\/\/shopify\/ProductVariant/)
  for (const field of ['comparison_product_id', 'status', 'shopify_product_id', 'handle', 'supplier', 'supplier_sku',
    'ean', 'pack', 'flavour', 'cost_ex_vat', 'approval_reference', 'review', 'mapping_status', 'mapping_source',
    'shop_identity', 'supplier_identity', 'created_at', 'updated_at']) assert.match(sql, new RegExp(`\\b${field}\\b`))
  for (const flag of ['price_auto', 'active']) assert.match(sql, new RegExp(`${flag} boolean not null default false`))
  assert.match(sql, /active_approval_required check/); assert.match(sql, /cost_ex_vat >= 0/)
  assert.match(sql, /create trigger product_mapping_updated_at before update/)
  assert.match(sql, /new\.updated_at := now\(\)/)
  assert.match(sql, /begin;/); assert.match(sql, /commit;/)
  assert.doesNotMatch(sql, /insert into|security definer/i)
})

const linkNow = 1000
const approvedRow = () => ({ ...reviewedRow(), active: true, approval_reference: 'synthetic-sign-off',
  mapping_status: 'exact', mapping_source: 'verified_labels',
  review: { approved: true, version: 'v1', expectedVersion: 'v1', verifiedAtMs: 1, expiresAtMs: 2000 } })
test('approved active mapping produces only public link fields without private supplier data', () => {
  const row = approvedRow(), view = presentStoreLinkMapping(row, linkNow)
  assert.ok(view)
  assert.deepEqual(Object.keys(view).sort(), ['active', 'approved', 'productId', 'review', 'shopifyProductHandle', 'shopifyVariantId'])
  view.review.version = 'changed'
  assert.equal(row.review.version, 'v1')
})
for (const [name, patch] of [
  ['inactive', { active: false }], ['unsigned', { approval_reference: null }], ['affiliate', { status: 'affiliate' }],
  ['unapproved', { review: { ...approvedRow().review, approved: false } }],
  ['expired', { review: { ...approvedRow().review, expiresAtMs: linkNow } }],
  ['stale', { review: { ...approvedRow().review, expectedVersion: 'v2' } }],
  ['not exact', { mapping_status: 'ambiguous' }], ['name match', { mapping_source: 'name_match' }],
  ['identity mismatch', { supplier_identity: { ...identity, flavourId: 'chocolate' } }],
  ['pack mismatch', { supplier_identity: { ...identity, pack: { ...pack, amountPerInner: 1000 } } }],
  ['missing identity', { shop_identity: null }], ['unsafe handle', { handle: '../cart' }],
]) test(`public link projection rejects ${name}`, () => assert.equal(presentStoreLinkMapping({ ...approvedRow(), ...patch }, linkNow), null))
