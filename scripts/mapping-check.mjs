#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { parse } from 'csv-parse/sync'
import { validateProductMappings } from '../lib/commerce/product-mapping.ts'

// Local files only. JSON: array of rows. CSV: snake_case headers; JSON-encoded evidence cells.
// published is optional observed export evidence; omission means publication was not checked.
const help = 'Usage: npm run mapping:check -- --input export.csv|export.json'
try {
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === '--help') { console.log(help); process.exit(0) }
  if (args.length !== 2 || args[0] !== '--input') throw new Error('arguments')
  const input = await readFile(args[1], 'utf8')
  let rows
  if (extname(args[1]).toLowerCase() === '.json') rows = JSON.parse(input)
  else if (extname(args[1]).toLowerCase() === '.csv') {
    rows = parse(input, { bom: true, columns: headers => {
      if (new Set(headers).size !== headers.length) throw new Error('duplicate headers')
      return headers
    }, skip_empty_lines: true }).map(row => {
      for (const key of Object.keys(row)) {
        if (row[key] === '') row[key] = null
        else if (['active', 'price_auto', 'published'].includes(key)) {
          if (row[key] === 'true') row[key] = true
          else if (row[key] === 'false') row[key] = false
        } else if (['pack', 'review', 'shop_identity', 'supplier_identity'].includes(key)) row[key] = JSON.parse(row[key])
      }
      // Empty publication cells are unknown rather than a false observation.
      if (row.published === null) delete row.published
      return row
    })
  } else throw new Error('format')
  if (!Array.isArray(rows) || !rows.length) throw new Error('empty or invalid export')
  const issues = validateProductMappings(rows)
  console.log(JSON.stringify({ status: issues.length ? 'FAIL' : 'PASS', rows: rows.length,
    publicationUncheckedRows: rows.filter(row => row?.published === undefined).length, errors: issues.length, issues }, null, 2))
  process.exitCode = issues.length ? 2 : 0
} catch {
  // Parser/filesystem errors may contain private row contents. Never echo them.
  console.error('Mapping check failed: invalid arguments, unreadable file or malformed export. ' + help)
  process.exitCode = 1
}
