import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// Ordinary tests inspect source only; never import or invoke a native launcher.
test('reserved entry is OFF before fixed supervisor admission and has no fixture wiring', () => {
  const source = readFileSync(new URL('../scripts/staging-owner-successor-reserved-entry.mjs', import.meta.url), 'utf8')
  assert.match(source, /export const STAGING_OWNER_SUCCESSOR_LIVE_ENABLED = false/)
  assert.match(source, /export const SUCCESSOR_EXPIRY = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'/)
  assert.match(source, /export async function runOwnerSuccessorLiveOnce\(\) \{\s*if \(!STAGING_OWNER_SUCCESSOR_LIVE_ENABLED\) return Object.freeze\(\{ status: 'SUCCESSOR_EXECUTION_DISABLED', authorization: 'NONE' \}\)/)
  const imports = [...source.matchAll(/from '([^']+)'/g)].map(m => m[1])
  assert.deepEqual(imports, ['node:path', 'node:url', './staging-owner-successor-process-binding.mjs'])
  assert.match(source, /return runBoundedOwnerSuccessorWorker\(\)/)
})
