import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ACTIVE_WINDOW_EXPIRES_AT, PROJECT_REF, WINDOW_ID } from '../scripts/staging-generation-21-credentials.mjs'
import { executeGeneration21CredentialWindow, GENERATION_21_SOURCE_FINGERPRINT, NATIVE_GENERATION_21_TRANSPORT_ENABLED } from '../scripts/staging-generation-21-transport.mjs'

test('Gen21 transport uses the consumed-window sentinel and has no dynamic expiry calculation', () => {
  const source = readFileSync('scripts/staging-generation-21-transport.mjs', 'utf8')
  assert.equal(NATIVE_GENERATION_21_TRANSPORT_ENABLED, false)
  assert.equal(ACTIVE_WINDOW_EXPIRES_AT, 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF')
  assert.match(GENERATION_21_SOURCE_FINGERPRINT, /^[a-f0-9]{64}$/)
  assert.match(source, /assertGeneration21ActiveWindowExpiry\(nowMs\)/)
  assert.doesNotMatch(source, /nowMs\s*\+\s*MAX_WINDOW_MS/)
})

test('consumed-window sentinel blocks before preflight, journal, provider, or database actions', async () => {
  const events = []
  const ports = Object.fromEntries(['preflightDatabase','stageVercel','stageSupabase','readbackNames','dispatchDatabase','verifyConnections','recoverDatabase','removeVercel','removeSupabase']
    .map(name => [name, async () => { events.push(name) }]))
  const journal = { recordIntent() { events.push('journal'); throw Error('must not run') }, transition() {} }
  const result = await executeGeneration21CredentialWindow({ ports, journal })
  assert.deepEqual(result, { status:'WINDOW_EXPIRY_UNSET', target:PROJECT_REF, generation:21, windowId:WINDOW_ID,
    activeWindowExpiresAt:ACTIVE_WINDOW_EXPIRES_AT, nextAction:'REVIEWED_ARMING_DIFF_REQUIRED' })
  assert.deepEqual(events, [])
})
