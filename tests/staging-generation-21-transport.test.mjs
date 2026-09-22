import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ACTIVE_WINDOW_EXPIRES_AT } from '../scripts/staging-generation-21-credentials.mjs'
import { GENERATION_21_SOURCE_FINGERPRINT, NATIVE_GENERATION_21_TRANSPORT_ENABLED } from '../scripts/staging-generation-21-transport.mjs'

test('Gen21 armed transport uses the shared reviewed expiry source and has no dynamic expiry calculation', () => {
  const source = readFileSync('scripts/staging-generation-21-transport.mjs', 'utf8')
  assert.equal(NATIVE_GENERATION_21_TRANSPORT_ENABLED, true)
  assert.equal(ACTIVE_WINDOW_EXPIRES_AT, '2026-09-22T14:00:00.000Z')
  assert.match(GENERATION_21_SOURCE_FINGERPRINT, /^[a-f0-9]{64}$/)
  assert.match(source, /assertGeneration21ActiveWindowExpiry\(nowMs\)/)
  assert.doesNotMatch(source, /nowMs\s*\+\s*MAX_WINDOW_MS/)
})
