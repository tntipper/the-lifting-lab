import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareSyntheticSuccessorWindow, consumeSyntheticSuccessorWindow,
  validateSyntheticSuccessorPhaseReceipt, bindOwnerSuccessorNativeWindow } from '../scripts/staging-owner-successor-window-binding.mjs'
import { OWNER_SUCCESSOR_WINDOW_ID } from '../scripts/staging-owner-successor-registration.mjs'
import { createSuccessorDurableJournal } from '../scripts/staging-owner-successor-durable-journal.mjs'
import { SUCCESSOR_PHASES } from '../scripts/staging-owner-successor-fixture.mjs'
import { freshWindowInput, start } from './fixtures/owner-successor-fresh-window.mjs'
test('fixed fresh window/source/readiness and journal identities remain synthetic and immutable', () => {
  const input = freshWindowInput(), { binding, capability } = prepareSyntheticSuccessorWindow(input)
  input.pins.sourceSha = 'd'.repeat(40); input.predecessor.state = 'active'
  assert.equal(binding.source.sourceSha, 'a'.repeat(40)); assert.equal(binding.predecessor.state, 'retired')
  assert.equal(binding.predecessor.windowId, 'd5180b08-79ee-43e8-96d4-4f73621fecbf')
  assert.equal(binding.predecessor.expiresAt, '2026-09-28T21:47:00.000Z')
  assert.equal(binding.readiness, `${OWNER_SUCCESSOR_WINDOW_ID}|2030-01-01T12:00:00.000Z|2030-01-01T12:45:00.000Z`)
  assert.equal(binding.historicalOutcome, 'UNKNOWN'); assert.equal(binding.authorization, 'NONE')
  assert.equal(new Set(Object.values(binding.recordNames)).size, SUCCESSOR_PHASES.length)
  assert.ok(Object.values(binding.recordNames).every(name => name.includes(OWNER_SUCCESSOR_WINDOW_ID) && !name.includes('v18')))
  assert.equal(consumeSyntheticSuccessorWindow(capability, freshWindowInput().pins, start), binding)
  assert.throws(() => consumeSyntheticSuccessorWindow(capability, freshWindowInput().pins, start))
  assert.deepEqual(bindOwnerSuccessorNativeWindow(), { status: 'NATIVE_WINDOW_BINDING_DISABLED', authorization: 'NONE' })
})
test('invalid clocks, duration, active/foreign predecessor and old-window/revision bindings are denied', () => {
  for (const expiresAtMs of [NaN, Infinity, undefined, start + 44 * 60_000, start + 61 * 60_000, start + 45 * 60_000 + 1])
    assert.throws(() => prepareSyntheticSuccessorWindow({ ...freshWindowInput(), expiresAtMs }))
  for (const field of ['state', 'windowId', 'expiresAt', 'runtimeSessions', 'controlsEnabled', 'providerEnabled', 'retiredRoles', 'provenance']) {
    const input = freshWindowInput(); input.predecessor[field] = 'wrong'
    assert.throws(() => prepareSyntheticSuccessorWindow(input))
  }
  for (const drift of [{ windowId: '759bc8ed-5ecd-475c-8a4c-e35fcf628a73', expiresAt: '2026-09-28T21:05:00.000Z' },
    { state: 'active' }, { runtimeSessions: 1 }, { controlsEnabled: true }, { providerEnabled: true }, { retiredRoles: 4 }]) {
    const input = freshWindowInput(); Object.assign(input.predecessor, drift)
    assert.throws(() => prepareSyntheticSuccessorWindow(input))
  }
  for (const delta of [{ windowId: 'd5180b08-79ee-43e8-96d4-4f73621fecbf' }, { edgeRevision: 'tll-gen23-v18-cart-route-1' }, { extra: true }]) {
    const input = freshWindowInput(); Object.assign(input.pins, delta); assert.throws(() => prepareSyntheticSuccessorWindow(input))
  }
})
test('admission is one-use and source drift or invalid/expired time cannot prepare material', () => {
  for (const now of [NaN, undefined, Infinity, start - 1, start + 30_000]) {
    const { capability } = prepareSyntheticSuccessorWindow(freshWindowInput())
    assert.throws(() => consumeSyntheticSuccessorWindow(capability, freshWindowInput().pins, now))
    assert.throws(() => consumeSyntheticSuccessorWindow(capability, freshWindowInput().pins, start))
  }
  for (const field of ['sourceSha', 'reviewedSha', 'manifestSha256', 'dependencySha256']) {
    const { capability } = prepareSyntheticSuccessorWindow(freshWindowInput()), pins = freshWindowInput().pins
    pins[field] = 'd'.repeat(field.endsWith('Sha256') ? 64 : 40)
    assert.throws(() => consumeSyntheticSuccessorWindow(capability, pins, start))
  }
  assert.throws(() => consumeSyntheticSuccessorWindow({}, freshWindowInput().pins, start))
})
test('mixed-window, uncertain, extra-field and forged-binding phase receipts fail closed', () => {
  const { binding } = prepareSyntheticSuccessorWindow(freshWindowInput())
  for (const phase of SUCCESSOR_PHASES) {
    const receipt = { phase, status: `PASS_${phase.toUpperCase()}`, windowId: binding.windowId,
      edgeRevision: binding.edgeRevision, sourceSha: binding.source.sourceSha, provenance: 'SYNTHETIC_STUB' }
    assert.equal(validateSyntheticSuccessorPhaseReceipt(binding, receipt).authorization, 'NONE')
    for (const delta of [{ windowId: 'old' }, { status: 'UNCERTAIN' }, { extra: true }, { sourceSha: 'd'.repeat(40) }])
      assert.throws(() => validateSyntheticSuccessorPhaseReceipt(binding, { ...receipt, ...delta }))
    assert.throws(() => validateSyntheticSuccessorPhaseReceipt({ ...binding }, receipt))
  }
})
test('existing durable journal claims this fresh identity and refuses duplicate/replayed claim', () => {
  const { binding } = prepareSyntheticSuccessorWindow(freshWindowInput())
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'successor-binding-')))
  fs.chmodSync(root, 0o700)
  const plan = { windowId: binding.windowId, sourceSha: binding.source.sourceSha, startedAtMs: start,
    expiresAtMs: Date.parse(binding.expiresAt) }
  try {
    const ledger = createSuccessorDurableJournal({ root, plan })
    ledger.dispatch('baseline', start)
    assert.throws(() => createSuccessorDurableJournal({ root, plan }))
    assert.throws(() => ledger.dispatch('baseline', start + 1000))
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
