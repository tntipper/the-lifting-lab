import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { FEED_HEADER, FEED_LIMITS, parseWholesalePence, planSupplierFeed, summarizeFeed } from '../lib/commerce/supplier-feed.ts'

const metadata = () => ({
  provenance: {
    supplierId: 'synthetic-supplier', sourceId: 'synthetic-fixture', receivedAt: '2026-09-15T10:00:00Z',
    fileModifiedAt: '2026-09-15T09:30:00Z',
    supplierObservation: { observedAt: '2026-09-15T09:00:00Z', trusted: true, evidenceId: 'synthetic-observation-1' },
    rowGrain: { status: 'approved_unique_sellable_unit', evidenceId: 'synthetic-grain-1' },
  }, evaluatedAt: '2026-09-15T10:00:00Z', maxObservationAgeMs: 86_400_000,
})
const fields = (overrides = {}) => ({
  ProductCode: 'SYN-1', TranslationName: 'Synthetic supplement', Tax: 'VAT', StockLevel: '5', Barcode: '4006381333931',
  Brand: 'Synthetic brand', Flavour: 'Vanilla', FilterByCategory: 'Protein', NutritionalInformation: '<p>Opaque text only.</p>',
  Size: '6 x 500g', ProductFlag: '', ProductFlagDate: '', ProductPrice: '12.34', ExpiryDate: '', ...overrides,
})
const quote = value => /[",\r\n]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value
const record = value => (Array.isArray(value) ? value : FEED_HEADER.map(key => value[key])).map(quote).join(',')
const csv = (records = [fields()], header = FEED_HEADER) => Buffer.from(record(header) + '\n' + records.map(record).join('\n') + '\n')
const codes = result => result.issues.map(value => value.code)
const rowCodes = row => row.issues.map(value => value.code)

test('valid unique record is review-only and never commerce approval', () => {
  const input = csv(), options = metadata(), result = planSupplierFeed(input, options)
  assert.equal(result.ingestionStatus, 'READY_FOR_REVIEW')
  assert.equal(result.rawSha256, createHash('sha256').update(input).digest('hex'))
  assert.equal(result.rawBytes, input.length)
  assert.equal(result.accounting.totalDataRecords, 1)
  assert.equal(result.candidates[0].status, 'REVIEW_REQUIRED')
  assert.equal(result.candidates[0].selectedRecordNumber, 1)
  assert.equal(result.writesEnabled, false)
  assert.deepEqual(result.candidates.map(candidate => [candidate.approved, candidate.sellable, candidate.priceWriteAllowed, candidate.mapping, candidate.costApproval, candidate.formulaApproval]), [[false, false, false, null, null, null]])
  assert.equal(result.rows[0].observations.wholesaleQuotePence, 1234)
  assert.equal(result.rows[0].observations.quoteCurrency, 'GBP')
  assert.equal(result.rows[0].observations.quoteUnit, 'unresolved_supplier_size')
  assert.equal(result.rows[0].observations.taxBasisApproved, false)
  assert.equal(result.rows[0].observations.billableQuantity, null)
  assert.equal(result.rows[0].observations.scientificFields, null)
  options.provenance.supplierId = 'mutated'
  assert.equal(result.provenance.supplierId, 'synthetic-supplier')
  assert.deepEqual(planSupplierFeed(input, metadata()), planSupplierFeed(input, metadata()))
  assert.doesNotThrow(() => JSON.stringify(result))
})

test('BOM, escaped quotes, commas, CRLF and multiline HTML preserve logical rows and opaque values', () => {
  const nutrition = '<p data-unit="mg">Line one, not a nutrient value\r\nLine two</p>'
  const values = fields({ TranslationName: 'Name, "quoted"', NutritionalInformation: nutrition })
  const raw = Buffer.from('\uFEFF' + record(FEED_HEADER) + '\r\n' + record(values) + '\r\n')
  const result = planSupplierFeed(raw, metadata())
  assert.equal(result.accounting.parsedDataRecords, 1)
  assert.ok(result.rows[0].parserEndLine >= 3)
  assert.equal(result.rows[0].fields.NutritionalInformation, nutrition)
  assert.equal(result.rows[0].fields.Size, '6 x 500g')
  assert.equal(result.rows[0].observations.scientificFields, null)
  assert.equal(result.rows[0].observations.billableQuantity, null)
  assert.notEqual(result.rawSha256, planSupplierFeed(csv([values]), metadata()).rawSha256)
})

for (const [raw, expected] of [['0.01', 1], ['1', 100], ['12.3', 1230], ['9999999.99', 999999999], ['10000000.00', 1000000000]]) {
  test('exact pence: ' + raw, () => assert.deepEqual(parseWholesalePence(raw), { pence: expected, issue: null }))
}
for (const raw of ['', '0', '0.00', '-1', '+1', ' 1.00', '1.00 ', '01.00', '1e2', '1,000.00', '£1.00', '.50', '1.', '1.001', 'NaN', 'Infinity', '10000000.01', '9'.repeat(100)]) {
  test('bad price remains held with no coercion: ' + raw.slice(0, 30), () => {
    const result = planSupplierFeed(csv([fields({ ProductPrice: raw })]), metadata())
    assert.equal(result.rows[0].observations.wholesaleQuotePence, null)
    assert.equal(result.candidates[0].status, 'HOLD')
    assert.equal(result.candidates[0].selectedRecordNumber, null)
  })
}

test('identical and conflicting duplicates are all retained and never selected, summed or date-ranked', () => {
  const result = planSupplierFeed(csv([fields(), fields(), fields({ StockLevel: '9', ProductPrice: '15.00', ProductFlagDate: '2099-01-01' }), fields({ ProductCode: 'SYN-2' })]), metadata())
  assert.equal(result.accounting.totalDataRecords, 4)
  assert.equal(result.accounting.duplicateCodeGroups, 1)
  assert.equal(result.accounting.recordsInDuplicateGroups, 3)
  assert.equal(result.accounting.uniqueProductCodes, 2)
  assert.deepEqual(result.candidates[0].recordNumbers, [1, 2, 3])
  assert.equal(result.candidates[0].selectedRecordNumber, null)
  assert.deepEqual(result.rows.slice(0, 3).map(row => row.observations.stockLevel), [5, 5, 9])
  assert.equal(result.accounting.issueRecordCounts.DUPLICATE_PRODUCT_CODE_AMBIGUOUS, 3)
})

test('case and surrounding-space identity collisions hold without silently rewriting codes', () => {
  const result = planSupplierFeed(csv([fields(), fields({ ProductCode: 'syn-1' }), fields({ ProductCode: ' SYN-1 ' })]), metadata())
  assert.equal(result.accounting.uniqueProductCodes, 3)
  assert.deepEqual(result.candidates.map(candidate => candidate.supplierProductCode), ['SYN-1', 'syn-1', ' SYN-1 '])
  assert.ok(result.rows.every(row => rowCodes(row).includes('PRODUCT_CODE_NORMALIZATION_COLLISION')))
})

test('malformed widths retain all records, group claimed codes, and hold even otherwise-valid rows', () => {
  const normal = FEED_HEADER.map(key => fields()[key])
  const result = planSupplierFeed(csv([normal, [...normal, 'shifted'], normal.slice(0, 13), [''], FEED_HEADER.map(key => fields({ ProductCode: 'SYN-2' })[key])]), metadata())
  assert.equal(result.accounting.complete, true)
  assert.equal(result.accounting.totalDataRecords, 5)
  assert.equal(result.accounting.invalidWidthRecords, 3)
  assert.equal(result.accounting.validWidthRecords, 2)
  assert.equal(result.accounting.unassignedRecords, 1)
  assert.equal(result.accounting.recordsInDuplicateGroups, 3)
  assert.ok(codes(result).includes('SNAPSHOT_COLUMN_COUNT_MISMATCH'))
  assert.equal(result.rows[1].fields, null)
  assert.equal(result.rows[1].observations, null)
  assert.equal(result.rows[1].rawFields.length, 15)
  assert.ok(result.candidates.every(candidate => candidate.selectedRecordNumber === null))
})

for (const header of [[...FEED_HEADER].reverse(), [...FEED_HEADER.slice(0, -1)], [...FEED_HEADER, 'Extra'], ['ProductCode', 'ProductCode', ...FEED_HEADER.slice(2)]]) {
  test('header mismatch never interprets or maps rows: ' + header.join(','), () => {
    const result = planSupplierFeed(csv([fields()], header), metadata())
    assert.ok(codes(result).includes('SNAPSHOT_HEADER_MISMATCH'))
    assert.equal(result.rows[0].fields, null)
    assert.equal(result.rows[0].observations, null)
    assert.equal(result.candidates.length, 0)
    assert.equal(result.accounting.unassignedRecords, 1)
  })
}

test('fatal quote syntax keeps parsed prefix and marks unknown tail instead of inventing a total', () => {
  const prefix = csv()
  const result = planSupplierFeed(Buffer.concat([prefix, Buffer.from('SYN-2,"unterminated\nSYN-3,also inside quote')]), metadata())
  assert.equal(result.accounting.complete, false)
  assert.equal(result.accounting.totalDataRecords, null)
  assert.equal(result.accounting.parsedDataRecords, 1)
  assert.equal(result.accounting.parserFailure.code, 'CSV_QUOTE_NOT_CLOSED')
  assert.equal(result.candidates[0].selectedRecordNumber, null)
  assert.equal(JSON.stringify(summarizeFeed(result)).includes('unterminated'), false)
})

test('invalid UTF8 is not silently replaced', () => {
  const result = planSupplierFeed(Buffer.from([0xc3, 0x28]), metadata())
  assert.ok(codes(result).includes('SNAPSHOT_INVALID_UTF8'))
  assert.equal(result.accounting.totalDataRecords, null)
})
test('empty file and header-only snapshot cannot pass', () => {
  assert.ok(codes(planSupplierFeed(Buffer.alloc(0), metadata())).includes('SNAPSHOT_HEADER_MISSING'))
  assert.ok(codes(planSupplierFeed(Buffer.from(record(FEED_HEADER) + '\n'), metadata())).includes('SNAPSHOT_NO_DATA'))
})
test('record resource limit is explicit and does not discard a parsed prefix silently', () => {
  const result = planSupplierFeed(csv([fields(), fields({ ProductCode: 'SYN-2', NutritionalInformation: 'x'.repeat(FEED_LIMITS.recordCharacters + 1) })]), metadata())
  assert.equal(result.accounting.complete, false)
  assert.equal(result.accounting.parsedDataRecords, 1)
  assert.equal(result.accounting.parserFailure.code, 'CSV_MAX_RECORD_SIZE')
})
test('snapshot byte limit rejects oversized input with unknown accounting', () => {
  const result = planSupplierFeed(Buffer.alloc(FEED_LIMITS.bytes + 1, 'a'), metadata())
  assert.ok(codes(result).includes('SNAPSHOT_TOO_LARGE'))
  assert.equal(result.accounting.complete, false)
  assert.equal(result.accounting.totalDataRecords, null)
  assert.equal(result.rows.length, 0)
})
test('row limit remains bounded and reports unknown remainder', () => {
  const raw = Buffer.from(record(FEED_HEADER) + '\n' + '\n'.repeat(FEED_LIMITS.rows + 1))
  const result = planSupplierFeed(raw, metadata())
  assert.equal(result.accounting.parsedDataRecords, FEED_LIMITS.rows)
  assert.equal(result.accounting.totalDataRecords, null)
  assert.equal(result.accounting.parserFailure.code, 'SNAPSHOT_ROW_LIMIT')
  assert.equal(result.accounting.unassignedRecords, FEED_LIMITS.rows)
})

for (const [mutation, expected] of [
  [options => { options.evaluatedAt = '2026-09-15' }, 'EVALUATION_TIME_INVALID'],
  [options => { options.provenance.receivedAt = 'yesterday' }, 'RECEIPT_TIME_INVALID'],
  [options => { options.provenance.receivedAt = '2026-09-15T11:00:00Z' }, 'RECEIPT_IN_FUTURE'],
  [options => { options.provenance.fileModifiedAt = 'yesterday' }, 'FILE_MODIFIED_TIME_INVALID'],
  [options => { options.provenance.sourceId = '' }, 'PROVENANCE_INVALID'],
  [options => { options.maxObservationAgeMs = 0 }, 'FRESHNESS_POLICY_INVALID'],
  [options => { options.maxObservationAgeMs = 0.5 }, 'FRESHNESS_POLICY_INVALID'],
]) {
  test('invalid metadata cannot yield a review-ready snapshot: ' + expected, () => {
    const options = metadata(); mutation(options)
    const result = planSupplierFeed(csv(), options)
    assert.ok(codes(result).includes(expected))
    assert.equal(result.ingestionStatus, 'HOLD')
  })
}
test('missing required identity labels remain visible and held', () => {
  const result = planSupplierFeed(csv([fields({ ProductCode: '', Brand: '', TranslationName: '', Size: '' })]), metadata())
  assert.equal(result.accounting.parsedDataRecords, 1)
  assert.equal(result.accounting.unassignedRecords, 1)
  assert.ok(rowCodes(result.rows[0]).includes('PRODUCT_CODE_MISSING'))
  assert.equal(result.rows[0].issues.filter(value => value.code === 'REQUIRED_LABEL_FIELD_MISSING').length, 3)
})

for (const raw of ['-1', '-0', '1.5', '1e3', '', ' 5', '01', '1000000001']) {
  test('invalid or negative stock is held: ' + raw, () => {
    const result = planSupplierFeed(csv([fields({ StockLevel: raw })]), metadata())
    assert.ok(result.rows[0].issues.some(value => value.code.startsWith('STOCK_')))
    assert.equal(result.candidates[0].status, 'HOLD')
  })
}
test('zero stock remains an observation, never availability approval', () => {
  const result = planSupplierFeed(csv([fields({ StockLevel: '0' })]), metadata())
  assert.equal(result.rows[0].observations.stockLevel, 0)
  assert.equal(result.candidates[0].sellable, false)
})
for (const raw of ['', '4.00638E+12', '4006381333932', ' 4006381333931', '0000000000000']) {
  test('barcode remains opaque and non-authoritative: ' + raw, () => {
    const result = planSupplierFeed(csv([fields({ Barcode: raw })]), metadata())
    assert.equal(result.rows[0].observations.barcode.raw, raw)
    assert.equal(result.rows[0].observations.barcode.normalized, null)
    assert.equal(result.candidates[0].mapping, null)
    assert.equal(result.candidates[0].status, 'HOLD')
  })
}
for (const tax of ['VAT', 'Zero', '', '20%']) {
  test('tax flag does not establish economic cost basis: ' + tax, () => {
    const result = planSupplierFeed(csv([fields({ Tax: tax })]), metadata())
    assert.equal(result.rows[0].fields.Tax, tax)
    assert.equal(result.rows[0].observations.taxBasisApproved, false)
    assert.equal(result.candidates[0].costApproval, null)
  })
}

test('recent receipt and mtime do not refresh an unknown supplier observation', () => {
  const options = metadata(); options.provenance.supplierObservation = null
  const result = planSupplierFeed(csv(), options)
  assert.ok(codes(result).includes('SUPPLIER_OBSERVATION_UNVERIFIED'))
  assert.equal(result.candidates[0].status, 'HOLD')
  assert.equal(result.provenance.supplierObservation, null)
})
for (const change of [
  options => { options.provenance.supplierObservation.trusted = false },
  options => { options.provenance.supplierObservation.evidenceId = '' },
  options => { options.provenance.supplierObservation.observedAt = '2026-09-14' },
  options => { options.provenance.supplierObservation.observedAt = '2026-02-30T09:00:00Z' },
]) {
  test('untrusted or inexact supplier timestamp stays held', () => {
    const options = metadata(); change(options)
    assert.ok(codes(planSupplierFeed(csv(), options)).includes('SUPPLIER_OBSERVATION_UNVERIFIED'))
  })
}
test('freshness expiry boundary and future observations are deterministic', () => {
  const options = metadata(); options.maxObservationAgeMs = 3_600_000
  assert.ok(codes(planSupplierFeed(csv(), options)).includes('SUPPLIER_OBSERVATION_EXPIRED'))
  options.maxObservationAgeMs++
  assert.equal(planSupplierFeed(csv(), options).ingestionStatus, 'READY_FOR_REVIEW')
  options.provenance.supplierObservation.observedAt = '2026-09-15T10:00:01Z'
  assert.ok(codes(planSupplierFeed(csv(), options)).includes('SUPPLIER_OBSERVATION_IN_FUTURE'))
})
test('unknown grain needs explicit supplier evidence; no sum or pack inference follows approval', () => {
  const options = metadata(); options.provenance.rowGrain = { status: 'unknown' }
  assert.ok(codes(planSupplierFeed(csv(), options)).includes('SUPPLIER_ROW_GRAIN_UNCONFIRMED'))
  options.provenance.rowGrain = { status: 'approved_unique_sellable_unit' }
  assert.ok(codes(planSupplierFeed(csv(), options)).includes('SUPPLIER_ROW_GRAIN_UNCONFIRMED'))
})
test('aggregate summary omits raw business fields', () => {
  const result = planSupplierFeed(csv([fields({ TranslationName: 'PRIVATE_NAME', NutritionalInformation: 'PRIVATE_HTML', ProductCode: 'PRIVATE_SKU' })]), metadata())
  const output = JSON.stringify(summarizeFeed(result))
  for (const privateValue of ['PRIVATE_NAME', 'PRIVATE_HTML', 'PRIVATE_SKU', '12.34', '4006381333931']) assert.equal(output.includes(privateValue), false)
})

test('CLI is local-only, summaries default, explicit files exclusive and private, holds exit 2', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'tll-feed-test-'))
  try {
    const input = join(folder, 'feed.csv'), meta = join(folder, 'metadata.json'), output = join(folder, 'summary.json'), plan = join(folder, 'plan.json')
    const options = metadata(); options.provenance.supplierObservation = null
    await writeFile(input, csv()); await writeFile(meta, JSON.stringify(options))
    const run = (...extra) => spawnSync(process.execPath, ['--experimental-strip-types', resolve('scripts/plan-supplier-feed.mjs'), '--input', input, '--metadata', meta, ...extra], { encoding: 'utf8' })
    const result = run('--summary-output', output, '--plan-output', plan)
    assert.equal(result.status, 2, result.stderr)
    assert.equal(JSON.parse(result.stdout).ingestionStatus, 'HOLD')
    assert.equal(result.stdout.includes('SYN-1'), false)
    assert.equal(JSON.parse(await readFile(plan, 'utf8')).rows.length, 1)
    assert.equal((await stat(plan)).mode & 0o777, 0o600)
    const original = await readFile(output, 'utf8')
    assert.equal(run('--summary-output', output).status, 1)
    assert.equal(await readFile(output, 'utf8'), original)
    assert.equal(run('--apply', 'true').status, 1)
    assert.equal(run('--input', 'again.csv').status, 1)
  } finally { await rm(folder, { recursive: true, force: true }) }
})
