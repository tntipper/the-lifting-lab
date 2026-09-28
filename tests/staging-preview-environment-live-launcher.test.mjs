import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const launcher = 'scripts/staging-preview-environment-live-launcher.mjs'

test('live and Keychain gates remain disabled in ordinary work', () => {
  const source = readFileSync(launcher, 'utf8')
  assert.match(source, /^export const STAGING_PREVIEW_ENVIRONMENT_LIVE_ENABLED = false$/m)
  assert.match(source, /if \(STAGING_PREVIEW_ENVIRONMENT_LIVE_ENABLED !== true\) return disabled\(\)/)
  assert.match(source, /if \(STAGING_PREVIEW_ENVIRONMENT_LIVE_ENABLED !== true\) process\.stdout\.write/)
  assert.match(readFileSync('scripts/staging-preview-environment-keychain.py', 'utf8'),
    /^APPROVED_PREVIEW_ENVIRONMENT_READ = False$/m)
})

test('live source fixes one Keychain selector, one journal, a supervised worker and no mutation endpoint', () => {
  const source = readFileSync(launcher, 'utf8')
  assert.match(source, /createStagingPreviewEnvironmentJournal\(\)/)
  assert.match(source, /runBoundedDetachedWorker/)
  assert.match(source, /TLL_STAGING_PREVIEW_ENV_INVENTORY_V2/)
  assert.match(source, /deadlineMs: 70_000/)
  assert.match(readFileSync('scripts/staging-preview-environment-keychain.py', 'utf8'), /timeout=30/)
  const observer = readFileSync('scripts/staging-preview-environment-observer.mjs', 'utf8')
  assert.match(observer, /readEffectivePreviewEnvironmentInventory/)
  assert.match(observer, /readProject/)
  assert.doesNotMatch(source, /method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]|createPreviewDeployment|setEdgeEnabled/)
})
