import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  assertGeneration21PreArmReady,
  assertReviewedGen19RetirementPlanListed,
  DEFAULT_LOCAL_RETIREMENT_EVIDENCE_PATH,
  EXPECTED_GEN19_RETIREMENT_TARGET,
  GENERATION_21_CONSUMED,
  PRE_ARM_CHECKLIST_DOC,
  RETIREMENT_PLAN_DOC,
  projectPredecessorRetirementEvidence,
} from '../scripts/staging-generation-21-pre-arm-gate.mjs'
import { NATIVE_GENERATION_21_TRANSPORT_ENABLED } from '../scripts/staging-generation-21-transport.mjs'
import { NATIVE_GENERATION_21_DATABASE_TRANSPORT_ENABLED } from '../scripts/staging-generation-21-database-transport.mjs'
import { WINDOW_ID, PACKAGE_ID, PREDECESSOR, GENERATION } from '../scripts/staging-generation-21-credentials.mjs'

const RETIREMENT_EVIDENCE = Object.freeze({
  schema: 'tll-generation-21-predecessor-retirement-evidence/v1',
  status: 'PASS_RETIRED_BASELINE',
  projectRef: 'qdmvngjwkcsilzmqksme',
  predecessorGeneration: 19,
  predecessorWindowId: '51809dd4-bd4b-44c7-8609-7dd8ca063679',
  predecessorExpiresAt: '2026-09-21T11:08:34.000Z',
  state: 'retired', runtimeRoles: 5, markerExact: 5, loginRoles: 0, passwordsConfigured: 0,
  validUntilInfinity: 5, operatorEdges: 5, executionEdges: 0, runtimeSessions: 0, controlRows: 5, controlsEnabled: 0,
  provenAt: '2026-09-22T10:00:00.000Z',
  source: 'reviewed-generation-19-retirement-evidence',
})

test('Generation 21 identity, exact Gen19 predecessor, and native gates are fixed', () => {
  assert.equal(GENERATION, 21)
  assert.equal(WINDOW_ID, 'a5511645-77af-4fc9-9e4c-f5c8a474d5fa')
  assert.equal(PACKAGE_ID, 'tll-staging-generation-21-credentials/v1')
  assert.deepEqual(PREDECESSOR, {
    generation: 19, windowId: '51809dd4-bd4b-44c7-8609-7dd8ca063679', expiresAt: '2026-09-21T11:08:34.000Z',
  })
  assert.equal(NATIVE_GENERATION_21_TRANSPORT_ENABLED, false)
  assert.equal(NATIVE_GENERATION_21_DATABASE_TRANSPORT_ENABLED, false)
})

test('reviewed Gen19 retirement plan and checklist carry the exact contract', () => {
  const listed = assertReviewedGen19RetirementPlanListed()
  assert.equal(listed.status, 'REVIEWED_RETIREMENT_PLAN_LISTED')
  assert.deepEqual(listed.target, EXPECTED_GEN19_RETIREMENT_TARGET)
  for (const path of [RETIREMENT_PLAN_DOC, PRE_ARM_CHECKLIST_DOC]) {
    const text = readFileSync(path, 'utf8')
    assert.match(text, /51809dd4-bd4b-44c7-8609-7dd8ca063679/)
    assert.match(text, /2026-09-21T11:08:34\.000Z/)
  }
})

test('predecessor retirement evidence requires the complete canonical retired-role baseline', () => {
  assert.equal(projectPredecessorRetirementEvidence(RETIREMENT_EVIDENCE)?.status, 'PASS_RETIRED_BASELINE')
  assert.equal(projectPredecessorRetirementEvidence({ ...RETIREMENT_EVIDENCE, predecessorGeneration: 18 }), null)
  assert.equal(projectPredecessorRetirementEvidence({ ...RETIREMENT_EVIDENCE, validUntilInfinity: 0 }), null)
  assert.equal(projectPredecessorRetirementEvidence({ ...RETIREMENT_EVIDENCE, executionEdges: 1 }), null)
  assert.equal(projectPredecessorRetirementEvidence({ ...RETIREMENT_EVIDENCE, controlsEnabled: 1 }), null)
  assert.equal(projectPredecessorRetirementEvidence({ ...RETIREMENT_EVIDENCE, controlRows: 4 }), null)
  assert.equal(projectPredecessorRetirementEvidence({ ...RETIREMENT_EVIDENCE, token: 'sbp_oauth_deadbeef' }), null)
})

test('pre-arm gate needs exact evidence and remains disarmed before an independent arming review', async () => {
  assert.equal(GENERATION_21_CONSUMED, false)
  await assert.rejects(() => assertGeneration21PreArmReady(), /predecessor_retirement_unproven/)
  const result = await assertGeneration21PreArmReady({ retirementEvidence: RETIREMENT_EVIDENCE })
  assert.equal(result.status, 'PRE_ARM_READY')
  assert.equal(result.predecessorBaselineComplete, true)
  assert.equal(result.nativeGatesArmed, false)
  assert.equal(result.nextAction, 'INDEPENDENT_ARMING_REVIEW')
  assert.match(DEFAULT_LOCAL_RETIREMENT_EVIDENCE_PATH, /implementation-state\/staging\//)
})
