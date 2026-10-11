import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const script = new URL('../scripts/staging-generation-23-consumer-diagnostic.mjs', import.meta.url)
const source = await readFile(script, 'utf8')
const armed = await import(`data:text/javascript;base64,${Buffer.from(source
  .replace('export const STAGING_GENERATION_23_CONSUMER_DIAGNOSTIC_ENABLED = false',
    'export const STAGING_GENERATION_23_CONSUMER_DIAGNOSTIC_ENABLED = true')
  .replaceAll("from './", `from '${new URL('../scripts/', import.meta.url).href}`)
  .replace('resolve(import.meta.dirname,', `resolve(${JSON.stringify(fileURLToPath(new URL('../scripts/', import.meta.url)))},`)).toString('base64')}`)

const runId = '8a5354d1-e925-4e30-84cf-70802c5d4a34'
const commit = 'a'.repeat(40)
const withPath = fn => {
  const dir = mkdtempSync(join(tmpdir(), 'tll-consumer-diagnostic-'))
  try { return fn(join(dir, 'state.json')) } finally { rmSync(dir, { recursive: true, force: true }) }
}

test('ordinary source cannot create the diagnostic record', async () => {
  const plain = await import(`${script.href}?plain=${Date.now()}`)
  assert.throws(() => plain.createStagingGeneration23ConsumerDiagnostic(), /unavailable/)
})

test('records every consumer boundary in order without a secret', () => withPath(path => {
  const diagnostic = armed.createStagingGeneration23ConsumerDiagnostic({ path, makeRunId: () => runId })
  diagnostic.claim(commit)
  for (const stage of armed.STAGES) {
    if (stage !== armed.STAGES[0]) diagnostic.pending(stage)
    diagnostic.verified(stage, ['website_request', 'broker_request'].includes(stage) ? 200 : null)
  }
  const result = diagnostic.finish()
  assert.equal(result.state, 'PASS')
  assert.equal(result.stage, 'broker_response_validation')
  assert.equal(result.websiteHttpStatus, 200)
  assert.equal(result.brokerHttpStatus, 200)
  assert.equal(statSync(path).mode & 0o777, 0o600)
  assert.throws(() => armed.createStagingGeneration23ConsumerDiagnostic({ path,
    makeRunId: () => runId }), /unavailable/)
}))

test('pending stage survives a failure and blocks replay or out-of-order work', () => withPath(path => {
  const diagnostic = armed.createStagingGeneration23ConsumerDiagnostic({ path, makeRunId: () => runId })
  diagnostic.claim(commit)
  assert.throws(() => diagnostic.pending('broker_request'), /unavailable/)
  diagnostic.verified('preview_build')
  diagnostic.pending('deployment_identity')
  assert.throws(() => diagnostic.verified('website_request'), /unavailable/)
  diagnostic.hold()
  assert.deepEqual({ stage: diagnostic.read().stage, state: diagnostic.read().state },
    { stage: 'deployment_identity', state: 'HOLD' })
  assert.throws(() => diagnostic.claim(commit), /unavailable/)
  assert.throws(() => diagnostic.pending('website_request'), /unavailable/)
  assert.doesNotMatch(readFileSync(path, 'utf8'), /password|Bearer|secret/i)
}))
