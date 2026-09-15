#!/usr/bin/env node
import { readFile, writeFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { planSupplierFeed, summarizeFeed, FEED_LIMITS } from '../lib/commerce/supplier-feed.ts'

// Local-only dry run. Metadata is a separate operator-authored JSON document.
const help = 'Usage: node --experimental-strip-types scripts/plan-supplier-feed.mjs --input feed.csv --metadata metadata.json [--summary-output report.json] [--plan-output private-plan.json]'
const allowed = new Set(['--input', '--metadata', '--summary-output', '--plan-output'])
try {
  const values = new Map()
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === '--help') { console.log(help); process.exit(0) }
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1]
    if (!allowed.has(key) || !value || value.startsWith('--') || values.has(key)) throw new Error('Invalid or duplicate arguments. ' + help)
    values.set(key, resolve(value))
  }
  if (!values.has('--input') || !values.has('--metadata')) throw new Error(help)
  const inputPath = values.get('--input'), metadataPath = values.get('--metadata')
  if ((await stat(inputPath)).size > FEED_LIMITS.bytes) throw new Error('Input exceeds the 50 MB snapshot limit.')
  if ((await stat(metadataPath)).size > 50_000) throw new Error('Metadata exceeds the 50 KB limit.')
  let metadata
  try { metadata = JSON.parse(await readFile(metadataPath, 'utf8')) } catch { throw new Error('Metadata must be valid JSON.') }
  if (!metadata || typeof metadata !== 'object' || !metadata.provenance) throw new Error('Metadata must contain provenance, evaluatedAt and maxObservationAgeMs.')
  const snapshot = planSupplierFeed(await readFile(inputPath), metadata)
  const summary = JSON.stringify(summarizeFeed(snapshot), null, 2) + '\n'
  // Explicit local outputs only, exclusive creation, restricted permissions. Never overwrite a feed.
  for (const [flag, content] of [['--summary-output', summary], ['--plan-output', JSON.stringify(snapshot, null, 2) + '\n']]) {
    if (values.has(flag)) await writeFile(values.get(flag), content, { flag: 'wx', mode: 0o600 })
  }
  console.log(summary.trimEnd())
  process.exitCode = snapshot.ingestionStatus === 'HOLD' ? 2 : 0
} catch (error) {
  // Filesystem and JSON errors can include private contents/paths; emit stable codes only.
  const code = error?.code
  console.error(code ? `Dry run failed (${code}). No live changes were made.` : error instanceof Error ? error.message : 'Dry run failed.')
  process.exitCode = 1
}
