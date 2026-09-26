import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

test('ordinary invocation stops before Keychain, journal or hosted access', () => {
  assert.match(readFileSync('scripts/staging-minimum-configuration-live-launcher.mjs', 'utf8'),
    /^export const STAGING_MINIMUM_CONFIGURATION_LIVE_ENABLED = false$/m)
  assert.deepEqual(JSON.parse(execFileSync(process.execPath,
    ['scripts/staging-minimum-configuration-live-launcher.mjs'], { encoding: 'utf8' })), {
    status: 'STAGING_MINIMUM_CONFIGURATION_LIVE_DISABLED',
  })
  assert.match(readFileSync('scripts/staging-minimum-configuration-keychain.py', 'utf8'),
    /^APPROVED_MINIMUM_SUPABASE_READ = False$/m)
})

test('source fixes Supabase selector and only three read ports inside a bounded worker', () => {
  const source = readFileSync('scripts/staging-minimum-configuration-live-launcher.mjs', 'utf8')
  const observer = readFileSync('scripts/staging-minimum-configuration-observer.mjs', 'utf8')
  const helper = readFileSync('scripts/staging-minimum-configuration-keychain.py', 'utf8')
  assert.match(source, /createStagingMinimumConfigurationJournal\(\)/)
  assert.match(source, /runBoundedDetachedWorker/)
  assert.match(source, /deadlineMs: 70_000/)
  assert.match(source, /createStagingAccountHostedBaselineSupabaseBinding/)
  assert.match(helper, /SERVICE = "Supabase CLI"/)
  assert.match(helper, /ACCOUNT = "supabase"/)
  assert.match(helper, /timeout=30/)
  for (const port of ['readDatabase', 'readEdgeSecretNames', 'readProvider']) assert.match(observer, new RegExp(port))
  assert.doesNotMatch(source, /updateProvider|createDeployment|setEdgeEnabled|method:\s*['"](?:PATCH|PUT|DELETE)['"]/)
})
