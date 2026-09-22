import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  assertGeneration20PreArmReady,
  assertReviewedGen19RetirementPlanListed,
  DEFAULT_LOCAL_RETIREMENT_EVIDENCE_PATH,
  EXPECTED_GEN19_RETIREMENT_TARGET,
  PRE_ARM_CHECKLIST_DOC,
  RETIREMENT_PLAN_DOC,
  projectPredecessorRetirementEvidence,
} from '../scripts/staging-generation-20-pre-arm-gate.mjs'
import { NATIVE_GENERATION_20_TRANSPORT_ENABLED } from '../scripts/staging-generation-20-transport.mjs'
import { NATIVE_GENERATION_20_DATABASE_TRANSPORT_ENABLED } from '../scripts/staging-generation-20-database-transport.mjs'
import { WINDOW_ID, PACKAGE_ID, PREDECESSOR, GENERATION } from '../scripts/staging-generation-20-credentials.mjs'

const RETIREMENT_EVIDENCE = Object.freeze({
  schema: 'tll-generation-20-predecessor-retirement-evidence/v1',
  status: 'RETIRED_MARKERS_PROVEN',
  predecessorGeneration: 19,
  predecessorWindowId: '51809dd4-bd4b-44c7-8609-7dd8ca063679',
  predecessorExpiresAt: '2026-09-21T11:08:34.000Z',
  state: 'retired', provenAt: '2026-09-22T10:00:00.000Z',
  source: 'reviewed-generation-19-retirement-evidence',
})

test('Generation 20 identity, exact Gen19 predecessor, and native gates are fixed', () => {
  assert.equal(GENERATION, 20)
  assert.equal(WINDOW_ID, 'a009f2b4-86df-4701-a8bc-1112597e3c42')
  assert.equal(PACKAGE_ID, 'tll-staging-generation-20-credentials/v1')
  assert.deepEqual(PREDECESSOR, {
    generation: 19, windowId: '51809dd4-bd4b-44c7-8609-7dd8ca063679', expiresAt: '2026-09-21T11:08:34.000Z',
  })
  assert.equal(NATIVE_GENERATION_20_TRANSPORT_ENABLED, false)
  assert.equal(NATIVE_GENERATION_20_DATABASE_TRANSPORT_ENABLED, false)
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

test('predecessor retirement evidence is exact and secret-free', () => {
  assert.equal(projectPredecessorRetirementEvidence(RETIREMENT_EVIDENCE)?.status, 'RETIRED_MARKERS_PROVEN')
  assert.equal(projectPredecessorRetirementEvidence({ ...RETIREMENT_EVIDENCE, predecessorGeneration: 18 }), null)
  assert.equal(projectPredecessorRetirementEvidence({ ...RETIREMENT_EVIDENCE, token: 'sbp_oauth_deadbeef' }), null)
})

test('pre-arm gate fails closed without proof and passes with exact retirement proof', async () => {
  await assert.rejects(() => assertGeneration20PreArmReady(), /predecessor_retirement_unproven/)
  const ready = await assertGeneration20PreArmReady({ retirementEvidence: RETIREMENT_EVIDENCE })
  assert.equal(ready.status, 'PRE_ARM_READY')
  assert.equal(ready.predecessorRetirementProven, true)
  assert.equal(ready.nativeGatesArmed, false)
  assert.equal(ready.nextAction, 'INDEPENDENT_ARMING_REVIEW')
  assert.match(DEFAULT_LOCAL_RETIREMENT_EVIDENCE_PATH, /implementation-state\/staging\//)
})
