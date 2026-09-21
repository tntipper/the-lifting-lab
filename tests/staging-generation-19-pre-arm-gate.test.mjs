import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  assertGeneration19PreArmReady,
  assertReviewedGen17CleanupPathListed,
  EXPECTED_GEN17_CLEANUP_TARGET,
  PRE_ARM_CHECKLIST_DOC,
  projectPredecessorRetirementEvidence,
  REVIEWED_CLEANUP_DOC,
} from '../scripts/staging-generation-19-pre-arm-gate.mjs'
import { NATIVE_GENERATION_19_TRANSPORT_ENABLED } from '../scripts/staging-generation-19-transport.mjs'
import { NATIVE_GENERATION_19_DATABASE_TRANSPORT_ENABLED } from '../scripts/staging-generation-19-database-transport.mjs'
import { WINDOW_ID, PACKAGE_ID, PREDECESSOR, GENERATION } from '../scripts/staging-generation-19-credentials.mjs'

test('generation 19 package identity and gates stay disarmed', () => {
  assert.equal(GENERATION, 19)
  assert.equal(WINDOW_ID, '51809dd4-bd4b-44c7-8609-7dd8ca063679')
  assert.equal(PACKAGE_ID, 'tll-staging-generation-19-credentials/v1')
  assert.equal(PREDECESSOR.generation, 17)
  assert.equal(PREDECESSOR.windowId, EXPECTED_GEN17_CLEANUP_TARGET.windowId)
  assert.equal(NATIVE_GENERATION_19_TRANSPORT_ENABLED, false)
  assert.equal(NATIVE_GENERATION_19_DATABASE_TRANSPORT_ENABLED, false)
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
  const ok = projectPredecessorRetirementEvidence({
    schema: 'tll-generation-19-predecessor-retirement-evidence/v1',
    status: 'RETIRED_MARKERS_PROVEN',
    predecessorGeneration: 17,
    predecessorWindowId: '5728d807-701a-486b-a8c5-34bf89238275',
    predecessorExpiresAt: '2026-09-21T09:31:04.000Z',
    state: 'retired',
    provenAt: '2026-09-21T12:00:00.000Z',
    source: 'operator-readonly-inspect',
  })
  assert.equal(ok.status, 'RETIRED_MARKERS_PROVEN')
  assert.equal(
    projectPredecessorRetirementEvidence({
      schema: 'tll-generation-19-predecessor-retirement-evidence/v1',
      status: 'RETIRED_MARKERS_PROVEN',
      predecessorGeneration: 17,
      predecessorWindowId: '313afec9-46d0-41bb-af47-0be277c6fa4f',
      predecessorExpiresAt: '2026-09-21T09:31:04.000Z',
      state: 'retired',
      provenAt: '2026-09-21T12:00:00.000Z',
      source: 'operator-readonly-inspect',
    }),
    null,
  )
  assert.equal(
    projectPredecessorRetirementEvidence({
      schema: 'tll-generation-19-predecessor-retirement-evidence/v1',
      status: 'RETIRED_MARKERS_PROVEN',
      predecessorGeneration: 17,
      predecessorWindowId: '5728d807-701a-486b-a8c5-34bf89238275',
      predecessorExpiresAt: '2026-09-21T09:31:04.000Z',
      state: 'retired',
      provenAt: '2026-09-21T12:00:00.000Z',
      source: 'operator-readonly-inspect',
      token: 'sbp_oauth_deadbeef',
    }),
    null,
  )
})

test('pre-arm gate passes with reviewed cleanup path while gates stay false', async () => {
  const ready = await assertGeneration19PreArmReady()
  assert.equal(ready.status, 'PRE_ARM_READY')
  assert.equal(ready.reviewedCleanupPathListed, true)
  assert.equal(ready.predecessorRetirementProven, false)
  assert.equal(ready.nativeGatesArmed, false)
  assert.equal(ready.windowId, WINDOW_ID)
  assert.match(ready.nextAction, /GEN17_CLEANUP|ARMING_REVIEW/)
})

test('pre-arm gate accepts secret-free retirement evidence without requiring cleanup execution', async () => {
  const ready = await assertGeneration19PreArmReady({
    retirementEvidence: {
      schema: 'tll-generation-19-predecessor-retirement-evidence/v1',
      status: 'RETIRED_MARKERS_PROVEN',
      predecessorGeneration: 17,
      predecessorWindowId: '5728d807-701a-486b-a8c5-34bf89238275',
      predecessorExpiresAt: '2026-09-21T09:31:04.000Z',
      state: 'retired',
      provenAt: '2026-09-21T12:00:00.000Z',
      source: 'operator-readonly-inspect',
    },
  })
  assert.equal(ready.predecessorRetirementProven, true)
  assert.equal(ready.nextAction, 'INDEPENDENT_ARMING_REVIEW')
})
