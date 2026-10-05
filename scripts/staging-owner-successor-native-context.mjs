/** Source binding is evidence only. It grants no hosted or credential-read authority. */
import { ACTIVE_WINDOW_STARTED_AT, ACTIVE_WINDOW_EXPIRES_AT, assertOwnerSuccessorSetupClock, WINDOW_ID } from './staging-owner-successor-sql-context.mjs'
const denied = () => { throw Error('Successor source binding unavailable') }
const exact = (v, names) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).sort().join('|') === [...names].sort().join('|')
export function ownerSuccessorSourceIdentity(proof, nowMs) {
  assertOwnerSuccessorSetupClock(ACTIVE_WINDOW_EXPIRES_AT, nowMs)
  if (!exact(proof, ['status', 'authorization', 'sourceCommit', 'executionCommit', 'manifestSha256', 'startedAt', 'expiresAt'])
    || proof.status !== 'OWNER_SUCCESSOR_SOURCE_VERIFIED' || proof.authorization !== 'NONE'
    || !/^[a-f0-9]{40}$/.test(proof.sourceCommit) || !/^[a-f0-9]{40}$/.test(proof.executionCommit)
    || proof.sourceCommit === proof.executionCommit || !/^[a-f0-9]{64}$/.test(proof.manifestSha256)
    || proof.startedAt !== ACTIVE_WINDOW_STARTED_AT || proof.expiresAt !== ACTIVE_WINDOW_EXPIRES_AT) denied()
  return Object.freeze({ windowId: WINDOW_ID, sourceCommit: proof.sourceCommit,
    executionCommit: proof.executionCommit, manifestSha256: proof.manifestSha256,
    startedAt: proof.startedAt, expiresAt: proof.expiresAt })
}
