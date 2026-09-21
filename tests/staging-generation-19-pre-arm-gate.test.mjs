import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  assertGeneration19PreArmReady,
  assertReviewedGen17CleanupPathListed,
  DEFAULT_LOCAL_RETIREMENT_EVIDENCE_PATH,
  EXPECTED_GEN17_CLEANUP_TARGET,
  PRE_ARM_CHECKLIST_DOC,
  projectPredecessorRetirementEvidence,
  REVIEWED_CLEANUP_DOC,
} from '../scripts/staging-generation-19-pre-arm-gate.mjs'
import { NATIVE_GENERATION_19_TRANSPORT_ENABLED } from '../scripts/staging-generation-19-transport.mjs'
import { NATIVE_GENERATION_19_DATABASE_TRANSPORT_ENABLED } from '../scripts/staging-generation-19-database-transport.mjs'
import { WINDOW_ID, PACKAGE_ID, PREDECESSOR, GENERATION } from '../scripts/staging-generation-19-credentials.mjs'

const RETIREMENT_EVIDENCE = Object.freeze({
  schema: 'tll-generation-19-predecessor-retirement-evidence/v1',
  status: 'RETIRED_MARKERS_PROVEN',
  predecessorGeneration: 17,
  predecessorWindowId: '5728d807-701a-486b-a8c5-34bf89238275',
  predecessorExpiresAt: '2026-09-21T09:31:04.000Z',
  state: 'retired',
  provenAt: '2026-09-21T12:00:00.000Z',
  source: 'operator-approved-gen17-correct-cleanup',
})

test('generation 19 package identity is fixed and native gates are armed for one window', () => {
  assert.equal(GENERATION, 19)
  assert.equal(WINDOW_ID, '51809dd4-bd4b-44c7-8609-7dd8ca063679')
  assert.equal(PACKAGE_ID, 'tll-staging-generation-19-credentials/v1')
  assert.equal(PREDECESSOR.generation, 17)
  assert.equal(PREDECESSOR.windowId, EXPECTED_GEN17_CLEANUP_TARGET.windowId)
  assert.equal(NATIVE_GENERATION_19_TRANSPORT_ENABLED, true)
  assert.equal(NATIVE_GENERATION_19_DATABASE_TRANSPORT_ENABLED, true)
})

test('reviewed Gen 17 cleanup path lists correct window and package', () => {
  const listed = assertReviewedGen17CleanupPathListed()
  assert.equal(listed.status, 'REVIEWED_CLEANUP_PATH_LISTED')
  assert.equal(listed.target.windowId, '5728d807-701a-486b-a8c5-34bf89238275')
  const cleanup = readFileSync(REVIEWED_CLEANUP_DOC, 'utf8')
  const checklist = readFileSync(PRE_ARM_CHECKLIST_DOC, 'utf8')
  assert.match(cleanup, /OPERATOR_REVIEWED_CLEANUP_PATH/)
  assert.match(cleanup, /DO_NOT_RUN_IN_PHASE_1/)
  assert.match(checklist, /PREDECESSOR_RETIREMENT_OR_REVIEWED_CLEANUP_REQUIRED/)
  assert.match(cleanup, /5728d807-701a-486b-a8c5-34bf89238275/)
  assert.match(cleanup, /tll-staging-generation-17-credentials\/v1/)
})

test('predecessor retirement evidence is secret-free and exact', () => {
  const ok = projectPredecessorRetirementEvidence(RETIREMENT_EVIDENCE)
  assert.equal(ok.status, 'RETIRED_MARKERS_PROVEN')
  assert.equal(
    projectPredecessorRetirementEvidence({
      ...RETIREMENT_EVIDENCE,
      predecessorWindowId: '313afec9-46d0-41bb-af47-0be277c6fa4f',
    }),
    null,
  )
  assert.equal(
    projectPredecessorRetirementEvidence({
      ...RETIREMENT_EVIDENCE,
      token: 'sbp_oauth_deadbeef',
    }),
    null,
  )
})

test('pre-arm gate refuses default requireArmedGatesFalse while gates are armed', async () => {
  await assert.rejects(
    () => assertGeneration19PreArmReady({ retirementEvidence: RETIREMENT_EVIDENCE }),
    error => {
      assert.match(error.message, /native_gates_must_stay_false_until_arming_diff/)
      return true
    },
  )
})

test('pre-arm gate passes with retirement evidence when allow-armed (Phase 2 arming path)', async () => {
  const ready = await assertGeneration19PreArmReady({
    retirementEvidence: RETIREMENT_EVIDENCE,
    requireArmedGatesFalse: false,
  })
  assert.equal(ready.status, 'PRE_ARM_READY')
  assert.equal(ready.predecessorRetirementProven, true)
  assert.equal(ready.reviewedCleanupPathListed, false)
  assert.equal(ready.nativeGatesArmed, true)
  assert.equal(ready.windowId, WINDOW_ID)
  assert.equal(ready.nextAction, 'ARMED_PHASE_3_REQUIRES_RUN_LIVE_ONCE')
  assert.match(DEFAULT_LOCAL_RETIREMENT_EVIDENCE_PATH, /implementation-state\/staging\//)
})

test('pre-arm gate still accepts reviewed cleanup path without re-running cleanup when allow-armed', async () => {
  const ready = await assertGeneration19PreArmReady({ requireArmedGatesFalse: false })
  assert.equal(ready.status, 'PRE_ARM_READY')
  assert.equal(ready.reviewedCleanupPathListed, true)
  assert.equal(ready.predecessorRetirementProven, false)
  assert.equal(ready.nativeGatesArmed, true)
})
