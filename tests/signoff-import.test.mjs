import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { importSignoff, gbpPence } from '../lib/signoff-import.ts'
import { readSignoff } from '../scripts/import-signoff.mjs'
const candidate = { comparison_product_id: 'comparison-1', status: 'store', shopify_product_id: '123',
  shopify_variant_id: '9007199254740993', handle: 'test-product', supplier: 'tropship', supplier_sku: 'TEST1',
  cost_ex_vat: '10', variant_title: '250g Plain' }
const row = (decision = 'Approved', cells = {}, number = 2) => ({ row: number, formulaFields: [], cells: {
  handle: 'test-product', variant_title: '250g Plain', toby_signoff: decision, store_price_gbp: '30',
  trade_cost_ex_vat: '10', vat_rate: '0.2', delivery_cost_per_order: '6', customer_shipping: '4.99',
  payment_fixed_pence: '25', payment_variable_bps: '200', margin_store_gbp: '-999', toby_notes: 'Review reason', ...cells } })
test('only valid Approved rows exported; saved field formats and corrected margin retained', () => {
  const result = importSignoff([row(), row('Rejected', {}, 3), row('Query', {}, 4), row('', {}, 5)], [candidate])
  assert.equal(result.mappings.length, 1)
  assert.equal(result.mappings[0].shopify_variant_id, 'gid://shopify/ProductVariant/9007199254740993')
  assert.equal(result.mappings[0].cost_ex_vat, '10')
  assert.equal(result.mappings[0].active, false)
  assert.equal(result.mappings[0].price_auto, false)
  assert.deepEqual(result.prices[0], { shopifyVariantId: result.mappings[0].shopify_variant_id, amountPence: 3000, currency: 'GBP' })
  assert.equal(result.margins[0].marginPence, 1604)
  assert.deepEqual(result.counts, { rows: 4, approved: 1, rejected: 1, query: 1, undecided: 1, exported: 1, invalidRows: 0 })
  assert.deepEqual(result.diagnostics[1].reasons, ['Review reason'])
})
test('missing price/variant/fees and invalid decision produce errors, including rejected rows', () => {
  for (const [cells, code] of [[{ store_price_gbp: '' }, 'MISSING_OR_INVALID_PRICE'], [{ variant_title: '' }, 'MISSING_VARIANT'],
    [{ payment_fixed_pence: '' }, 'MISSING_OR_INVALID_PAYMENT_FEES'], [{ vat_rate: '' }, 'MISSING_OR_INVALID_SUPPLIER_VAT']]) {
    const result = importSignoff([row('Approved', cells), row('Rejected', cells, 3)], [candidate])
    assert.equal(result.mappings.length, 0)
    assert.ok(result.diagnostics.every(d => d.errors.includes(code)))
  }
  assert.ok(importSignoff([row('approved')], [candidate]).diagnostics[0].errors.includes('INVALID_SIGNOFF'))
})
test('ambiguous mappings and duplicate approvals hold every affected row', () => {
  assert.equal(importSignoff([row()], [candidate, candidate]).mappings.length, 0)
  const result = importSignoff([row(), row('Approved', {}, 3)], [candidate])
  assert.equal(result.mappings.length, 0)
  assert.ok(result.diagnostics.every(d => d.errors.includes('DUPLICATE_VARIANT')))
})
test('formula inputs not accepted; cached margin columns ignored; strict GBP amounts', () => {
  assert.equal(importSignoff([{ ...row(), formulaFields: ['store_price_gbp'] }], [candidate]).mappings.length, 0)
  assert.equal(importSignoff([{ ...row(), formulaFields: ['margin_store_gbp'] }], [candidate]).mappings.length, 1)
  for (const value of ['-1', '1.001', 'NaN', '1e3', '', '£10']) assert.equal(gbpPence(value), null)
  assert.equal(gbpPence('19.29'), 1929)
})
// Minimal synthetic OOXML fixture, generated using stdlib ZIP/XML, no Excel dependency.
function fixture(path, rows) {
  const generate = `import sys,json,zipfile,xml.etree.ElementTree as E
rows=json.loads(sys.argv[2]); ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
root=E.Element('worksheet',xmlns=ns); data=E.SubElement(root,'sheetData')
headers=list(rows[0]); values=[headers]+[[r.get(h,'') for h in headers] for r in rows]
for number,values in enumerate(values,1):
 row=E.SubElement(data,'row',r=str(number))
 for index,value in enumerate(values):
  column=''; n=index+1
  while n: n,remainder=divmod(n-1,26); column=chr(65+remainder)+column
  c=E.SubElement(row,'c',r=column+str(number),t='inlineStr'); E.SubElement(E.SubElement(c,'is'),'t').text=value
with zipfile.ZipFile(sys.argv[1],'w') as z:
 z.writestr('xl/workbook.xml','<workbook xmlns="'+ns+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sign-off" sheetId="1" r:id="rId1"/></sheets></workbook>')
 z.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
 z.writestr('xl/worksheets/sheet1.xml',E.tostring(root))
 z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>')
 z.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')`
  const result = spawnSync('python3', ['-c', generate, path, JSON.stringify(rows)], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
}
test('synthetic XLSX CLI: dry-run, write gate, no overwrite, unchanged input and mapping', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'signoff-'))
  try {
    const xlsx = join(dir, 'input.xlsx'), mapping = join(dir, 'mapping.csv'), output = join(dir, 'result.generated.json')
    fixture(xlsx, [row().cells, row('Rejected').cells, row('Query').cells])
    const keys = Object.keys(candidate)
    writeFileSync(mapping, keys.join(',') + '\n' + keys.map(k => candidate[k]).join(',') + '\n')
    const before = readFileSync(xlsx), mappingBefore = readFileSync(mapping)
    assert.equal((await readSignoff(xlsx)).length, 3)
    const run = args => spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/import-signoff.mjs', xlsx, '--mapping', mapping, ...args], { encoding: 'utf8' })
    const dry = run([])
    assert.equal(dry.status, 0, dry.stderr)
    assert.match(dry.stdout, /approved: 1/)
    assert.match(dry.stdout, /rejected: 1/)
    assert.match(dry.stdout, /query: 1/)
    assert.equal(existsSync(output), false)
    assert.equal(run(['--output', output]).status, 1)
    const write = run(['--write', '--output', output])
    assert.equal(write.status, 0, write.stderr)
    const exported = JSON.parse(readFileSync(output))
    assert.equal(exported.mappings.length, 1)
    assert.equal(exported.prices[0].amountPence, 3000)
    assert.equal(exported.liveEnabled, false)
    const outputBefore = readFileSync(output)
    assert.equal(run(['--write', '--output', output]).status, 1)
    assert.deepEqual(readFileSync(output), outputBefore)
    assert.deepEqual(readFileSync(xlsx), before)
    assert.deepEqual(readFileSync(mapping), mappingBefore)
    fixture(xlsx, [row('Approved', { store_price_gbp: '' }).cells])
    const withheld = join(dir, 'invalid.generated.json')
    assert.equal(run(['--write', '--output', withheld]).status, 1)
    assert.equal(existsSync(withheld), false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
test('duplicate Approved row with missing price also holds the otherwise-valid approval', () => {
  const result = importSignoff([row(), row('Approved', { store_price_gbp: '' }, 3)], [candidate])
  assert.equal(result.mappings.length, 0)
  assert.ok(result.diagnostics.every(d => d.errors.includes('DUPLICATE_VARIANT')))
})
test('CLI fee override enables rows with missing fees but never permits missing identity', () => {
  const cells = { payment_fixed_pence: '', payment_variable_bps: '' }
  assert.equal(importSignoff([row('Approved', cells)], [candidate], { fixedPence: 0, variableBps: 0 }).mappings.length, 1)
  assert.equal(importSignoff([row('Approved', cells)], [{ ...candidate, shopify_variant_id: null }], { fixedPence: 0, variableBps: 0 }).mappings.length, 0)
})
test('XLSX shared strings, sparse cells and cached formulas are read without trusting cache', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'signoff-xml-'))
  try {
    const path = join(dir, 'source.xlsx')
    fixture(path, [row().cells])
    const patch = `import sys,zipfile,xml.etree.ElementTree as E
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(sys.argv[1]) as z: files={n:z.read(n) for n in z.namelist()}
root=E.fromstring(files['xl/worksheets/sheet1.xml']); rows=root.findall('s:sheetData/s:row',ns)
headers={''.join(c.find('s:is',ns).itertext()):c.get('r')[:-1] for c in rows[0]}
for c in rows[1]:
 if c.get('r')==headers['toby_signoff']+'2':
  c.remove(c.find('s:is',ns)); c.set('t','s'); E.SubElement(c,'{'+ns['s']+'}v').text='0'
 if c.get('r')==headers['store_price_gbp']+'2':
  c.remove(c.find('s:is',ns)); c.attrib.pop('t'); E.SubElement(c,'{'+ns['s']+'}f').text='10+20'; E.SubElement(c,'{'+ns['s']+'}v').text='30'
 if c.get('r')==headers['toby_notes']+'2': rows[1].remove(c)
files['xl/worksheets/sheet1.xml']=E.tostring(root)
files['xl/sharedStrings.xml']=('<sst xmlns="'+ns['s']+'"><si><r><t>App</t></r><r><t>roved</t></r></si></sst>').encode()
with zipfile.ZipFile(sys.argv[1],'w') as z:
 for name,content in files.items(): z.writestr(name,content)`
    const modified = spawnSync('python3', ['-c', patch, path], { encoding: 'utf8' })
    assert.equal(modified.status, 0, modified.stderr)
    const rows = await readSignoff(path)
    assert.equal(rows[0].cells.toby_signoff, 'Approved')
    assert.equal(rows[0].cells.toby_notes, '')
    assert.equal(rows[0].cells.store_price_gbp, '')
    assert.deepEqual(rows[0].formulaFields, ['store_price_gbp'])
    assert.equal(importSignoff(rows, [candidate]).mappings.length, 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
