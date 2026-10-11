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

test('the credential-owning worker never blocks its supervisor-loss watcher on a subprocess', () => {
  const source = readFileSync(entry, 'utf8')
  const worker = source.slice(source.indexOf('function readToken('), source.indexOf('\nasync function childRead()'))
  assert.match(worker, /child = spawn\(PYTHON,/)
  assert.doesNotMatch(worker, /spawnSync\(/)
  assert.match(worker, /child\.kill\('SIGKILL'\)/)
  assert.match(worker, /signal\.addEventListener\('abort', stop/)
  assert.match(source, /checkArming\(\{ verifyManifest: false \}\)/)
  assert.match(source, /killSignal: 'SIGKILL'/)
})
