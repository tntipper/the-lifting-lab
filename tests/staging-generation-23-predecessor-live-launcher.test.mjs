import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const entry = fileURLToPath(new URL('../scripts/staging-generation-23-predecessor-live-launcher.mjs', import.meta.url))

test('the Gen23 read launcher exits before worker or credential access while disabled', () => {
  const source = readFileSync(entry, 'utf8')
  assert.match(source, /^export const STAGING_GENERATION_23_PREDECESSOR_LIVE_ENABLED = false$/m)
  const output = execFileSync(process.execPath, [entry, '--child'], { encoding: 'utf8', timeout: 3_000 })
  assert.deepEqual(JSON.parse(output), { status: 'GENERATION_23_PREDECESSOR_LIVE_DISABLED' })
})
