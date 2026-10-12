import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse } from 'csv-parse/sync'

export function buildChecklist(rows) {
  const store = rows.filter(row => row.status === 'store')
  if (!store.length) throw new Error('No local store variants')
  const ids = new Set()
  return store.map(row => {
    if (!row.shopify_variant_id || ids.has(row.shopify_variant_id)) throw new Error('Missing or duplicate variant ID')
    ids.add(row.shopify_variant_id)
    if (!row.shopify_sku_observed) throw new Error('Missing observed SKU')
    return {
      sku: row.shopify_sku_observed, shopify_variant_id: row.shopify_variant_id,
      comparison_product_id: row.comparison_product_id, product: row.product_name, variant: row.variant_title,
      'NHC claims': 'TODO: check permitted nutrition/health claims and conditions of use against exact UK label and all customer copy',
      'novel food': 'TODO: review each ingredient and extract against current GB authorisations and conditions',
      WADA: 'TODO: check current prohibited list and exact batch evidence; certification is not a guarantee',
      warnings: 'TODO: exact UK label; caffeine content/daily portion; 16+ or stricter age notice; allergens and other warnings',
      signed_by: '', signed_date: '',
    }
  }).sort((a, b) => a.sku.localeCompare(b.sku) || a.shopify_variant_id.localeCompare(b.shopify_variant_id))
}
export function checklistCsv(rows) {
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  return [Object.keys(rows[0]), ...rows.map(Object.values)].map(row => row.map(quote).join(',')).join('\n') + '\n'
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length > 2) throw new Error('No arguments: rebuild local unsigned draft only; do not run after manual sign-off')
  const output = 'docs/compliance-checklist.csv'
  // Never overwrite manual review or signatures: only regenerate an unchanged draft.
  const rows = buildChecklist(parse(readFileSync('data/mapping-review.csv', 'utf8'), { columns: true, bom: true }))
  const csv = checklistCsv(rows)
  let previous
  try { previous = readFileSync(output, 'utf8') } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (previous !== undefined && previous !== csv) throw new Error('Existing checklist differs; preserve manual review and reconcile it by hand')
  writeFileSync(output, csv)
  console.log(`Unsigned compliance draft: ${rows.length} local store variants; no launch approval inferred.`)
}
