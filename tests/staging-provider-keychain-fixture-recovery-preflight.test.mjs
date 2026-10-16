import assert from 'node:assert/strict'
import test from 'node:test'
import { assessRecoverySnapshot, parseRecoveryBuildIdentity,
  RECOVERY_V1 } from '../scripts/staging-provider-keychain-fixture-recovery-preflight.mjs'

function snapshot() {
  return { directory: { ...RECOVERY_V1.directory }, main: { ...RECOVERY_V1.main },
    sidecar: { ...RECOVERY_V1.sidecar }, entries: [...RECOVERY_V1.names],
    defaultKeychain: 'login-keychain', searchList: ['login-keychain'],
    parentJournal: { runId: RECOVERY_V1.runId, phase: 'LOCAL_RECONCILIATION', outcome: 'HOLD' },
    nativeJournal: { runId: RECOVERY_V1.runId, operation: 'CREATE', status: 'COMPLETE',
      outcome: 'HOLD', sequence: 1 } }
}

test('V1 snapshot admits only exact initial fixture and terminal journals', () => {
  const original = snapshot()
  assert.equal(assessRecoverySnapshot(original, 'initial'), true)
  assert.equal(assessRecoverySnapshot({ ...original, main: { ...original.main, ino: 5 } }, 'initial'), false)
  assert.equal(assessRecoverySnapshot({ ...original, main: { ...original.main, sha256: '0'.repeat(64) } }, 'initial'), false)
  assert.equal(assessRecoverySnapshot({ ...original, sidecar: { ...original.sidecar, size: 1 } }, 'initial'), false)
  assert.equal(assessRecoverySnapshot({ ...original, entries: [...original.entries, 'unknown'] }, 'initial'), false)
  assert.equal(assessRecoverySnapshot({ ...original, defaultKeychain: 'other' }, 'initial'), false)
  assert.equal(assessRecoverySnapshot({ ...original,
    parentJournal: { ...original.parentJournal, outcome: 'PASS' } }, 'initial'), false)
})

test('recovery state progression allows only main then sidecar then directory to disappear', () => {
  const original = snapshot()
  const afterApi = { ...original, main: null, entries: ['.flA673ACC0'] }
  assert.equal(assessRecoverySnapshot(afterApi, 'afterApi'), true)
  assert.equal(assessRecoverySnapshot({ ...afterApi, sidecar: null, entries: [] }, 'afterApi'), true)
  assert.equal(assessRecoverySnapshot({ ...afterApi, entries: ['other'] }, 'afterApi'), false)
  const afterSidecar = { ...afterApi, sidecar: null, entries: [] }
  assert.equal(assessRecoverySnapshot(afterSidecar, 'afterSidecar'), true)
  assert.equal(assessRecoverySnapshot({ ...afterSidecar, directory: null }, 'afterSidecar'), false)
  assert.equal(assessRecoverySnapshot({ ...afterSidecar, directory: null }, 'final'), true)
})

test('build identity parser rejects cross-mode and source/binary/signature drift', () => {
  const hashes = { sourceSha256: 'a'.repeat(64), binarySha256: 'b'.repeat(64) }
  const identity = kind => ({ status: `${kind.toUpperCase()}_RECOVERY_BINARY_VERIFIED`,
    schema: `tll-fixture-recovery-${kind}-build/v1`, ...hashes,
    architecture: 'arm64', signingKind: 'adhoc',
    signingIdentifier: `tll-provider-keychain-fixture-recovery-${kind}-v1` })
  assert.deepEqual(parseRecoveryBuildIdentity(identity('disabled')), hashes)
  assert.deepEqual(parseRecoveryBuildIdentity(identity('armed'), 'armed'), hashes)
  assert.equal(parseRecoveryBuildIdentity(identity('disabled'), 'armed'), null)
  assert.equal(parseRecoveryBuildIdentity({ ...identity('armed'), binarySha256: 'bad' }, 'armed'), null)
  assert.equal(parseRecoveryBuildIdentity({ ...identity('armed'), signingIdentifier: 'other' }, 'armed'), null)
})
