import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RECOVERY_V1 } from '../scripts/staging-provider-keychain-fixture-recovery-preflight.mjs'
import { assessV2RecoverySnapshot, parseRecoveryV2BuildIdentity } from '../scripts/staging-provider-keychain-fixture-recovery-v2-preflight.mjs'

const snapshot = () => ({ directory: { ...RECOVERY_V1.directory },
  main: { ...RECOVERY_V1.main }, sidecar: { ...RECOVERY_V1.sidecar },
  entries: [...RECOVERY_V1.names], defaultKeychain: 'login-keychain',
  searchList: ['login-keychain'],
  parentJournal: { runId: RECOVERY_V1.runId, phase: 'LOCAL_RECONCILIATION', outcome: 'HOLD' },
  nativeJournal: { runId: RECOVERY_V1.runId, operation: 'CREATE',
    status: 'COMPLETE', outcome: 'HOLD', sequence: 1 } })

test('V2 recognizes only its own source-bound build identity', () => {
  const value = { status: 'ARMED_RECOVERY_BINARY_VERIFIED',
    schema: 'tll-fixture-recovery-v2-armed-build/v2',
    sourceSha256: 'a'.repeat(64), binarySha256: 'b'.repeat(64),
    architecture: 'arm64', signingIdentifier: 'tll-provider-keychain-fixture-recovery-v2-armed',
    signingKind: 'adhoc' }
  assert.deepEqual(parseRecoveryV2BuildIdentity(value), {
    sourceSha256: value.sourceSha256, binarySha256: value.binarySha256 })
  assert.equal(parseRecoveryV2BuildIdentity({ ...value,
    schema: 'tll-fixture-recovery-armed-build/v1' }), null)
  assert.equal(parseRecoveryV2BuildIdentity({ ...value,
    signingIdentifier: 'tll-provider-keychain-fixture-recovery-armed-v1' }), null)
})

test('V2 preserves fixed synthetic identity and terminal V1 evidence', () => {
  const initial = snapshot()
  assert.equal(assessV2RecoverySnapshot(initial, 'initial'), true)
  assert.equal(assessV2RecoverySnapshot({ ...initial,
    main: { ...initial.main, ino: 8 } }, 'initial'), false)
  assert.equal(assessV2RecoverySnapshot({ ...initial,
    nativeJournal: { ...initial.nativeJournal, outcome: 'PASS' } }, 'initial'), false)
  assert.equal(assessV2RecoverySnapshot({ ...initial,
    entries: [...initial.entries, 'other'] }, 'initial'), false)
  assert.equal(assessV2RecoverySnapshot({ ...initial,
    main: null, entries: [RECOVERY_V1.names[0]] }, 'afterApi'), true)
  assert.equal(assessV2RecoverySnapshot({ ...initial,
    main: null, sidecar: null, entries: [] }, 'afterSidecar'), true)
  assert.equal(assessV2RecoverySnapshot({ ...initial,
    directory: null, main: null, sidecar: null, entries: [] }, 'final'), true)
})
