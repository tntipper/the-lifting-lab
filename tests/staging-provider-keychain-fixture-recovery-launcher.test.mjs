import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const launcher = resolve(root, 'scripts/staging-provider-keychain-fixture-recovery-live-launcher.mjs')

test('recovery launcher has a disabled first gate and a dedicated journal', () => {
  const source = readFileSync(launcher, 'utf8')
  assert.match(source, /export const TLL_FIXTURE_RECOVERY_LIVE_ENABLED = false/)
  assert.match(source, /if \(TLL_FIXTURE_RECOVERY_LIVE_ENABLED !== true\) return fixed\('RECOVERY_DISABLED'\)/)
  assert.match(source, /createFixtureRecoveryJournal/)
  assert.match(source, /tll-provider-keychain-fixture-recovery-v1\.json/)
  assert.match(source, /\[phase\]/)
})
