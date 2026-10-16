#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { dirname, extname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse } from 'csv-parse/sync'
import { canonicalShopifyId, validateProductMappings } from '../lib/commerce/product-mapping.ts'

export const defaults = {
  catalogue: 'outputs/01a0eec0-23d2-75a3-8826-52bfed59e4ab/TLL_product_catalogue_2026-10-02.xlsx',
  supplier: 'outputs/feed-review-2026-10-02/TLL_supplier_feed_comparison_2026-10-02.xlsx',
  shopify: 'docs/ops/evidence/2026-09-30-shopify-variant-readback.csv',
  comparison: 'docs/research/data/supabase-products-2026-09-25.csv',
  links: 'docs/research/data/comparison-shopify-supplier-reconciliation-2026-09-25.csv',
  output: 'data/mapping-review.csv',
}
const fields = ['comparison_product_id', 'status', 'shopify_product_id', 'shopify_variant_id', 'handle',
  'supplier', 'supplier_sku', 'ean', 'cost_ex_vat', 'active', 'price_auto', 'approval_reference',
  'match_confidence', 'reason', 'comparison_candidates', 'product_name', 'variant_title',
  'shopify_sku_observed', 'store_status_observed_2026_10_02', 'publication_observed_2026_09_30', 'cost_source', 'validation_issues']
const cell = (row, ...keys) => String(keys.map(key => row[key]).find(value => value !== undefined && value !== null) ?? '').trim()
const id = (row, kind, ...keys) => canonicalShopifyId(cell(row, ...keys), kind)
const normalName = value => value.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Read-only workbook bridge: installed Python/openpyxl, no shell, URLs or downloads. CSV needs Node only. */
const workbookReader = `import sys,json,openpyxl
book=openpyxl.load_workbook(sys.argv[1],read_only=True,data_only=True)
sheet=book[sys.argv[2]]
rows=list(sheet.values)
header=next(i for i,r in enumerate(rows) if 'SKU' in r and 'Product' in r)
names=[str(v) if v is not None else '' for v in rows[header]]
result=[{k:str(v) if v is not None else '' for k,v in zip(names,r) if k} for r in rows[header+1:] if any(v is not None for v in r)]
print(json.dumps(result))
book.close()`

export async function readSource(path, sheet) {
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(path)) throw new Error('local files only')
  if (extname(path).toLowerCase() === '.xlsx' && sheet) {
    return JSON.parse(execFileSync('python3', ['-c', workbookReader, path, sheet], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024,
    }))
  }
  if (extname(path).toLowerCase() !== '.csv') throw new Error('CSV or supported workbook required')
  return parse(await readFile(path, 'utf8'), { bom: true, skip_empty_lines: true, columns: headers => {
    if (new Set(headers).size !== headers.length) throw new Error('duplicate headers')
    return headers
  } })
}

export function seedMapping({ catalogue, supplier, shopify, comparison, links }) {
  // A broken/empty source must not silently make every comparison product affiliate.
  for (const [rows, headers] of [[catalogue, ['Product', 'SKU', 'Shopify product ID']],
    [supplier, ['Product', 'SKU', '2 Oct supplier quote £', '2 Oct barcode']],
    [shopify, ['shopify_product_id', 'shopify_variant_id', 'shopify_handle', 'sku']],
    [comparison, ['id', 'name']], [links, ['tll_id', 'historical_shopify_product_id', 'historical_shopify_variant_id', 'supplier_sku']]]) {
    if (!rows.length || rows.some(row => headers.some(key => !(key in row)))) throw new Error('source schema')
  }
  const comparisonIds = new Set(comparison.map(row => cell(row, 'id')))
  if (comparisonIds.has('') || comparisonIds.size !== comparison.length) throw new Error('comparison IDs')
  const represented = new Set(), seen = new Set(), result = []
  for (const item of catalogue) {
    const productId = id(item, 'Product', 'Shopify product ID'), sku = cell(item, 'SKU')
    if (!productId || !sku) throw new Error('catalogue identity')
    const variants = shopify.filter(row => id(row, 'Product', 'shopify_product_id') === productId && cell(row, 'sku') === sku)
    if (variants.length !== 1) throw new Error('missing or ambiguous Shopify readback')
    const shop = variants[0], variantId = id(shop, 'ProductVariant', 'shopify_variant_id')
    if (!variantId || seen.has(variantId)) throw new Error('duplicate or invalid variant')
    seen.add(variantId)
    const directCandidates = links.filter(row => comparisonIds.has(cell(row, 'tll_id')) && (
      id(row, 'ProductVariant', 'historical_shopify_variant_id') === variantId ||
      cell(row, 'supplier_sku') === sku))
    // Product-family evidence must not override a variant/SKU link to a specific flavour.
    const savedCandidates = directCandidates.length ? directCandidates : links.filter(row =>
      comparisonIds.has(cell(row, 'tll_id')) && id(row, 'Product', 'historical_shopify_product_id') === productId)
    // Only exact brand + product-name text after case/punctuation normalisation; no fuzzy guesses.
    const nameCandidates = savedCandidates.length ? [] : comparison.filter(row =>
      normalName(`${cell(row, 'brand')} ${cell(row, 'name')}`) === normalName(cell(item, 'Product')))
    const candidates = savedCandidates.length ? savedCandidates : nameCandidates.map(row => ({ tll_id: cell(row, 'id') }))
    const candidateIds = [...new Set(candidates.map(row => cell(row, 'tll_id')))].sort()
    candidateIds.forEach(value => represented.add(value))
    const comparisonId = candidateIds.length === 1 ? candidateIds[0] : null
    const exactLink = candidates.some(row => id(row, 'ProductVariant', 'historical_shopify_variant_id') === variantId && cell(row, 'supplier_sku') === sku)
    const quotes = supplier.filter(row => cell(row, 'SKU') === sku)
    const signatures = new Set(quotes.map(row => JSON.stringify([
      cell(row, '2 Oct supplier quote £'), cell(row, '2 Oct barcode'), cell(row, '2 Oct supplier pack'), cell(row, 'Supplier product name') ])))
    const quote = signatures.size === 1 ? quotes[0] : null
    const currentCost = quote && cell(quote, '2 Oct supplier quote £')
    const historicalCost = cell(item, 'TropShip wholesale £ 14 Sep')
    // Missing feed rows stay unresolved; historical cost is visible only as a proposal.
    const cost = quotes.length && !quote ? null : (currentCost || historicalCost || null)
    const reasons = [comparisonId ? (exactLink ? 'Unverified historical variant + SKU link' : nameCandidates.length ?
      'Exact normalised brand + product-name text only; pack/flavour not verified' : 'Unverified historical product/SKU link; option review required') :
      candidateIds.length ? 'Conflicting comparison IDs; choose manually' : 'No saved comparison link; choose manually',
    quote ? cell(quote, 'Match detail') : quotes.length ? 'Conflicting supplier rows; cost/EAN withheld' : 'No 2 Oct supplier row; historical cost only if available',
    cell(quote ?? {}, 'Review note'), cell(item, 'Research note'), 'TODO: exact label/pack/flavour, fresh cost and Toby/Lifty sign-off'].filter(Boolean)
    result.push({ comparison_product_id: comparisonId, status: 'store', shopify_product_id: productId,
      shopify_variant_id: variantId, handle: cell(shop, 'shopify_handle'), supplier: 'tropship',
      // Internal TLL placeholders are not verified TropShip SKUs.
      supplier_sku: sku.startsWith('TLL-') ? null : sku,
      ean: quote ? cell(quote, '2 Oct barcode') || null : null, cost_ex_vat: cost,
      active: false, price_auto: false, approval_reference: null,
      match_confidence: !comparisonId ? candidateIds.length ? 'ambiguous' : 'unmatched' : exactLink ? 'historical_variant_sku' : nameCandidates.length ? 'name_only' : 'historical_product',
      reason: reasons.join('; '), comparison_candidates: candidateIds.join('|'), product_name: cell(item, 'Product'),
      variant_title: cell(item, 'Size / flavour'), shopify_sku_observed: sku, store_status_observed_2026_10_02: cell(item, 'Store status'),
      publication_observed_2026_09_30: cell(shop, 'online_store_published'),
      cost_source: cost ? (currentCost ? '2 Oct supplier quote' : '14 Sep historical wholesale') + '; ex VAT basis: docs/ops/evidence/2026-10-05-supplier-terms-scope-and-baseline.md; not current approval' : '',
    })
  }
  for (const item of comparison) if (!represented.has(cell(item, 'id'))) result.push({
    comparison_product_id: cell(item, 'id'), status: 'affiliate', active: false, price_auto: false, approval_reference: null,
    product_name: cell(item, 'name'), match_confidence: 'unmatched',
    reason: 'No historical link to a launch variant; affiliate proposal only; TODO: Toby/Lifty review',
  })
  const issues = validateProductMappings(result)
  return result.map((row, index) => ({ ...row, validation_issues: issues.filter(issue => issue.row === index + 1).map(issue => issue.code).join('|') }))
}

export function reviewCsv(rows) {
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  return [fields, ...rows.map(row => fields.map(field => row[field]))].map(row => row.map(escape).join(',')).join('\n') + '\n'
}

const help = 'Usage: node --experimental-strip-types scripts/seed-mapping.mjs [--catalogue file.xlsx|csv] [--supplier file.xlsx|csv] [--shopify file.csv] [--comparison file.csv] [--links file.csv] [--output file.csv]'
export async function main(args) {
  if (args.length === 1 && args[0] === '--help') { console.log(help); return }
  const paths = { ...defaults }
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].slice(2)
    if (!args[i].startsWith('--') || !Object.hasOwn(defaults, key) || !args[i + 1]) throw new Error('arguments')
    paths[key] = args[i + 1]
  }
  // Prevent accidentally replacing source files or changing non-review files.
  if (extname(paths.output).toLowerCase() !== '.csv' || /^[a-z][a-z\d+.-]*:\/\//i.test(paths.output) ||
      Object.entries(paths).some(([key, path]) => key !== 'output' && resolve(path) === resolve(paths.output))) throw new Error('output')
  const sources = {}
  for (const key of ['catalogue', 'supplier', 'shopify', 'comparison', 'links']) {
    try { sources[key] = await readSource(paths[key], key === 'catalogue' ? 'Catalogue' : key === 'supplier' ? 'Comparison' : null) }
    catch { console.error(`Required local source (${key}) could not be read: ${paths[key]}. XLSX requires python3/openpyxl; CSV must retain the worksheet headers.`); throw new Error('source') }
  }
  const rows = seedMapping(sources)
  await mkdir(dirname(paths.output), { recursive: true })
  await writeFile(paths.output, reviewCsv(rows), { mode: 0o600 })
  console.log(JSON.stringify({ rows: rows.length, store: rows.filter(row => row.status === 'store').length,
    affiliate: rows.filter(row => row.status === 'affiliate').length, validationErrors: validateProductMappings(rows).length,
    active: 0, approved: 0 }))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(() => { console.error('Mapping seed failed; check local source files and headers. ' + help); process.exitCode = 1 })
}
