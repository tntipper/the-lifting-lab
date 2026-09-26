/** Categorical V2 fixture observations. The native program owns full Keychain-list equality. */
import { captureRecoverySnapshot, RECOVERY_V1 } from './staging-provider-keychain-fixture-recovery-preflight.mjs'

const SHA = /^[a-f0-9]{64}$/
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const same = (value, answer) => exact(value, Object.keys(answer))
  && Object.entries(answer).every(([key, expected]) => value[key] === expected)

export function parseRecoveryV2BuildIdentity(value, kind = 'armed') {
  if (!['disabled', 'armed'].includes(kind)
    || !exact(value, ['status', 'schema', 'sourceSha256', 'binarySha256',
      'architecture', 'signingIdentifier', 'signingKind'])
    || value.status !== `${kind.toUpperCase()}_RECOVERY_BINARY_VERIFIED`
    || value.schema !== `tll-fixture-recovery-v2-${kind}-build/v2`
    || value.architecture !== 'arm64' || value.signingKind !== 'adhoc'
    || value.signingIdentifier !== `tll-provider-keychain-fixture-recovery-v2-${kind}`
    || !SHA.test(value.sourceSha256) || !SHA.test(value.binarySha256)) return null
  return Object.freeze({ sourceSha256: value.sourceSha256, binarySha256: value.binarySha256 })
}

export function assessV2RecoverySnapshot(value, phase) {
  if (!exact(value, ['directory', 'main', 'sidecar', 'entries', 'defaultKeychain',
    'searchList', 'parentJournal', 'nativeJournal'])
    || !Array.isArray(value.entries) || !Array.isArray(value.searchList)
    || value.defaultKeychain !== 'login-keychain'
    || value.searchList.length !== 1 || value.searchList[0] !== 'login-keychain'
    || !same(value.parentJournal, { runId: RECOVERY_V1.runId,
      phase: 'LOCAL_RECONCILIATION', outcome: 'HOLD' })
    || !same(value.nativeJournal, { runId: RECOVERY_V1.runId, operation: 'CREATE',
      status: 'COMPLETE', outcome: 'HOLD', sequence: 1 })) return false
  if (phase === 'final') return value.directory === null && value.main === null
    && value.sidecar === null && value.entries.length === 0
  if (!same(value.directory, RECOVERY_V1.directory)) return false
  const entries = [...value.entries].sort()
  if (phase === 'initial') return same(value.main, RECOVERY_V1.main)
    && same(value.sidecar, RECOVERY_V1.sidecar)
    && entries.join('|') === [...RECOVERY_V1.names].sort().join('|')
  if (phase === 'afterApi') return value.main === null
    && (value.sidecar === null || same(value.sidecar, RECOVERY_V1.sidecar))
    && entries.join('|') === (value.sidecar === null ? '' : RECOVERY_V1.names[0])
  if (phase === 'afterSidecar') return value.main === null && value.sidecar === null
    && entries.length === 0
  return false
}

export function observeV2Recovery(phase, capture = captureRecoverySnapshot) {
  try { return assessV2RecoverySnapshot(capture(), phase) } catch { return false }
}
