import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { readStagingPreviewDeploymentCredentials, STAGING_PREVIEW_DEPLOYMENT_CREDENTIALS_ENABLED,
  STAGING_PREVIEW_DEPLOYMENT_KEYCHAIN_HELPER } from '../scripts/staging-surface-preview-deployment-credentials.mjs'

test('dedicated Preview Keychain helper is disabled and only knows two selectors', () => {
  assert.equal(STAGING_PREVIEW_DEPLOYMENT_CREDENTIALS_ENABLED, false)
  const source = readFileSync(STAGING_PREVIEW_DEPLOYMENT_KEYCHAIN_HELPER, 'utf8')
  assert.match(source, /^APPROVED_PREVIEW_DEPLOYMENT_READ = False$/m)
  assert.doesNotMatch(source, /Supabase CLI|managementToken/)
  assert.throws(() => execFileSync('/usr/bin/python3', ['-I', '-S', STAGING_PREVIEW_DEPLOYMENT_KEYCHAIN_HELPER, 'vercel'],
    { stdio: 'ignore', timeout: 1000 }), /Command failed/)
})

test('reader uses exactly the two fixed items, bounds each child and transfers owned buffers', () => {
  const seen = [], source = [Buffer.from('test-vercel-token'), Buffer.from('test-bypass-token')]
  const value = readStagingPreviewDeploymentCredentials({ runChild: (executable, args, options) => {
    seen.push({ executable, args, options }); return { status: 0, stdout: source[seen.length - 1] }
  } })
  assert.deepEqual(seen.map(item => item.args[3]), ['vercel', 'vercel-bypass'])
  assert.ok(seen.every(item => item.executable === '/usr/bin/python3'
    && item.options.timeout === 15_000 && item.options.maxBuffer === 4097))
  assert.equal(value.vercelToken.toString(), 'test-vercel-token')
  assert.equal(value.protectionBypassToken.toString(), 'test-bypass-token')
  assert.ok(source.every(buffer => buffer.every(byte => byte === 0)))
  value.vercelToken.fill(0); value.protectionBypassToken.fill(0)
})

test('failure of the second item wipes the first and rejects the bundle', () => {
  const first = Buffer.from('test-vercel-token'), second = Buffer.from('bad')
  let calls = 0
  assert.throws(() => readStagingPreviewDeploymentCredentials({ runChild: () => {
    calls++
    return { status: calls === 1 ? 0 : 1, stdout: calls === 1 ? first : second }
  } }), /unavailable/)
  assert.equal(calls, 2)
  assert.ok(first.every(byte => byte === 0))
  assert.ok(second.every(byte => byte === 0))
})
