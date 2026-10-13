#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse } from 'csv-parse/sync'
import { importSignoff, signoffReport } from '../lib/signoff-import.ts'

const help = 'Usage: node --experimental-strip-types scripts/import-signoff.mjs input.xlsx [--sheet Sign-off] [--mapping data/mapping-review.csv] [--payment-fixed-pence N --payment-variable-bps N] [--write --output NEW.generated.json]'
export async function readSignoff(path, sheet = 'Sign-off') {
  if (!path.toLowerCase().endsWith('.xlsx') || path.includes('://')) throw new Error('Local XLSX required')
  return JSON.parse(execFileSync('python3', [fileURLToPath(new URL('./import-signoff-xlsx.py', import.meta.url)), path, sheet],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 }))
}
export async function main(args) {
  if (args.length === 1 && args[0] === '--help') { console.log(help); return }
  const input = args[0]
  if (!input || input.startsWith('--')) throw new Error('Input required')
  const options = { sheet: 'Sign-off', mapping: 'data/mapping-review.csv' }
  let write = false
  for (let i = 1; i < args.length; i++) {
    const key = args[i].slice(2)
    if (args[i] === '--write') { if (write) throw new Error('Duplicate write'); write = true; continue }
    if (!args[i].startsWith('--') || !['sheet', 'mapping', 'output', 'payment-fixed-pence', 'payment-variable-bps'].includes(key) ||
      !args[i + 1] || args[i + 1].startsWith('--') || (Object.hasOwn(options, key) && !['sheet', 'mapping'].includes(key))) throw new Error('Arguments')
    options[key] = args[++i]
  }
  if (Boolean(options.output) !== write) throw new Error('--write and --output required together')
  if (options.output && (!options.output.endsWith('.generated.json') || options.output.includes('://') ||
    [input, options.mapping].some(path => resolve(path) === resolve(options.output)))) throw new Error('New generated output required')
  let fees
  if (options['payment-fixed-pence'] !== undefined || options['payment-variable-bps'] !== undefined) {
    if (!/^\d{1,10}$/.test(options['payment-fixed-pence'] ?? '') || !/^\d{1,5}$/.test(options['payment-variable-bps'] ?? '')) throw new Error('Both payment fees required')
    fees = { fixedPence: Number(options['payment-fixed-pence']), variableBps: Number(options['payment-variable-bps']) }
    if (fees.fixedPence > 1_000_000_000 || fees.variableBps > 10000) throw new Error('Payment fees out of range')
  }
  const candidates = parse(await readFile(options.mapping, 'utf8'), { bom: true, skip_empty_lines: true,
    columns: headers => { if (new Set(headers).size !== headers.length) throw new Error('Duplicate mapping headers'); return headers } })
  const result = importSignoff(await readSignoff(input, options.sheet), candidates, fees)
  console.log(signoffReport(result))
  if (write) {
    if (result.diagnostics.some(d => d.decision === 'Approved' && d.errors.length)) throw new Error('Approved rows have validation errors; output withheld')
    await mkdir(dirname(options.output), { recursive: true })
    await writeFile(options.output, JSON.stringify({ source: resolve(input), sheet: options.sheet,
      liveEnabled: false, mappings: result.mappings, prices: result.prices, margins: result.margins }, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  }
  return result
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(() => { console.error('BLOCKED: Import failed: check local input, validation, arguments and new output path. ' + help); process.exitCode = 1 })
}
