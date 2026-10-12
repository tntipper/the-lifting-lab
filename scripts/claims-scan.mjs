import { readFileSync, readdirSync, lstatSync } from 'node:fs'
import { resolve, extname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse } from 'csv-parse/sync'

// Screening only: negations and quoted wording still require human review.
export const CLAIM_PATTERNS = [
  /\bcure(?:s|d)?\b/gi, /\bcuring\b/gi,
  /\btreat(?:s|ed|ing|ment|ments)?\b/gi,
  /\bprevent(?:s|ed|ing|ion|ative|ive)?\b/gi,
  /\bdetox(?:es|ed|ing|ify|ification)?\b/gi,
  /\bheal(?:s|ed|ing)?\b/gi, /\b(?:miracle|fat[-\s]+burn(?:er|ing)|disease)\b/gi,
]
const COPY_FIELDS = new Set(['name', 'brand', 'product_name', 'description', 'copy', 'title', 'body_html', 'marketing_copy', 'claims'])
export function scanText(text, source = '<text>') {
  const findings = []
  for (const pattern of CLAIM_PATTERNS) {
    for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
      findings.push({ source, line: text.slice(0, match.index).split('\n').length, keyword: match[0], offset: match.index })
    }
  }
  return findings.sort((a, b) => a.offset - b.offset)
}
export function scanFile(filename) {
  const content = readFileSync(filename, 'utf8')
  if (extname(filename).toLowerCase() !== '.csv') return scanText(content, filename)
  const rows = parse(content, { bom: true, columns: true, skip_empty_lines: true })
  const fields = rows.length ? Object.keys(rows[0]).filter(key => COPY_FIELDS.has(key.toLowerCase())) : []
  if (!rows.length || !fields.length) throw new Error('CSV must contain rows and a recognised product copy column')
  return rows.flatMap((row, i) => fields.flatMap(field => scanText(row[field], `${filename}:record ${i + 1}:${field}`)))
}
function filesAt(filename) {
  const stat = lstatSync(filename)
  if (stat.isSymbolicLink()) throw new Error('Symlinks are not supported')
  if (!stat.isDirectory()) return [filename]
  return readdirSync(filename).sort().flatMap(name => filesAt(resolve(filename, name)))
    .filter(name => ['.csv', '.md', '.txt', '.tsx', '.ts', '.html', '.json'].includes(extname(name).toLowerCase()))
}
export function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) { console.log('Usage: node scripts/claims-scan.mjs [local files/directories ...]\nDefault: saved product names/brands, mapping proposal names, product pages and warning copy. Exit 1: hits; 2: input error. No network.'); return 0 }
  try {
    const inputs = args.length ? args : ['docs/research/data/supabase-products-2026-09-25.csv', 'data/mapping-review.csv', 'app/products', 'components/ProductWarnings.tsx', 'lib/commerce/product-warnings.ts']
    const files = [...new Set(inputs.flatMap(name => filesAt(resolve(name))))]
    if (!files.length) throw new Error('No copy files found')
    const findings = files.flatMap(scanFile)
    for (const hit of findings) console.log(`${hit.source}:${hit.line}: ${hit.keyword}`)
    console.log(`Claims scan: ${findings.length} hits in ${files.length} local file(s). Human review still required.`)
    return findings.length ? 1 : 0
  } catch (error) { console.error(`Claims scan input error: ${error.message}`); return 2 }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main()
