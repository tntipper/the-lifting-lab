import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

test('V2 live entry remains disabled and separate from V1', () => {
  const source = readFileSync(resolve(import.meta.dirname,
    '../scripts/staging-provider-keychain-fixture-recovery-v2-live-launcher.mjs'), 'utf8')
  assert.match(source, /TLL_FIXTURE_RECOVERY_V2_LIVE_ENABLED = false/)
  assert.match(source, /createFixtureRecoveryV2Journal/)
  assert.match(source, /runFixtureRecoveryV2Session/)
  assert.doesNotMatch(source, /createFixtureRecoveryJournal\s*\(/)
  assert.match(source, /readPinnedV2Baseline/)
})
