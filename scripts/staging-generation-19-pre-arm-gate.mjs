/**
 * Secret-free Gen 19 pre-arm / Phase 2 gate.
 *
 * Refuses arming Gen 19 unless:
 * 1. Gen 17 + Gen 19 recovery successor pins match their credentials packages, AND
 * 2. Predecessor retirement is proven via secret-free evidence markers, OR
 * 3. An explicit reviewed Gen 17 cleanup path is listed (artefacts only — do not run live here).
 *
 * Does not touch hosted staging, Keychain, or native gates. Phase 1 keeps all gates false.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GENERATION, PACKAGE_ID, PREDECESSOR, WINDOW_ID } from './staging-generation-19-credentials.mjs'
import { NATIVE_GENERATION_19_TRANSPORT_ENABLED } from './staging-generation-19-transport.mjs'
import { NATIVE_GENERATION_19_DATABASE_TRANSPORT_ENABLED } from './staging-generation-19-database-transport.mjs'
import { assertRecoverySuccessorPinsMatchCredentials } from './staging-generation-recovery-pin-contract.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const PRE_ARM_SCHEMA = 'tll-generation-19-pre-arm/v1'
export const REVIEWED_CLEANUP_DOC = 'docs/ops/stage-plans/2026-09-21-generation-17-correct-cleanup.md'
export const PRE_ARM_CHECKLIST_DOC = 'docs/ops/stage-plans/2026-09-21-generation-19-pre-arm-checklist.md'

export const EXPECTED_GEN17_CLEANUP_TARGET = Object.freeze({
  generation: 17,
  windowId: '5728d807-701a-486b-a8c5-34bf89238275',
  packageId: 'tll-staging-generation-17-credentials/v1',
  expiresAt: '2026-09-21T09:31:04.000Z',
})

const unavailable = (reason) => {
  const error = new Error(`Generation-19 pre-arm unavailable: ${reason}`)
  error.failureStep = 'pre_arm'
  error.failureReason = reason
  throw error
}

function readDoc(relativePath) {
  try {
    return readFileSync(resolve(root, relativePath), 'utf8')
  } catch {
    unavailable('cleanup_doc_missing')
  }
}

/** Validate optional secret-free retirement evidence (no SQL, secrets, or tokens). */
export function projectPredecessorRetirementEvidence(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const keys = Object.keys(value).sort()
  const allowed = ['schema', 'status', 'predecessorGeneration', 'predecessorWindowId', 'predecessorExpiresAt', 'state', 'provenAt', 'source']
  if (keys.some((k) => !allowed.includes(k))) return null
  if (value.schema !== 'tll-generation-19-predecessor-retirement-evidence/v1') return null
  if (value.status !== 'RETIRED_MARKERS_PROVEN') return null
  if (value.predecessorGeneration !== PREDECESSOR.generation) return null
  if (value.predecessorWindowId !== PREDECESSOR.windowId) return null
  if (value.predecessorExpiresAt !== PREDECESSOR.expiresAt) return null
  if (value.state !== 'retired') return null
  if (typeof value.provenAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value.provenAt)) return null
  if (typeof value.source !== 'string' || value.source.length < 8 || value.source.length > 256) return null
  if (/SCRAM|password|secret|token|BEGIN;|sbp_/i.test(JSON.stringify(value))) return null
  return Object.freeze({ ...value })
}

/**
 * Confirm the reviewed Gen 17 cleanup doc lists the correct targets.
 * Does not execute cleanup.
 */
export function assertReviewedGen17CleanupPathListed() {
  const doc = readDoc(REVIEWED_CLEANUP_DOC)
  const checklist = readDoc(PRE_ARM_CHECKLIST_DOC)
  for (const text of [doc, checklist]) {
    if (!text.includes(EXPECTED_GEN17_CLEANUP_TARGET.windowId)) unavailable('cleanup_path_window_mismatch')
    if (!text.includes(EXPECTED_GEN17_CLEANUP_TARGET.packageId)) unavailable('cleanup_path_package_mismatch')
    if (!text.includes(`generation: ${EXPECTED_GEN17_CLEANUP_TARGET.generation}`)
      && !text.includes(`generation ${EXPECTED_GEN17_CLEANUP_TARGET.generation}`)
      && !text.includes(`Generation ${EXPECTED_GEN17_CLEANUP_TARGET.generation}`)
      && !text.includes(`Gen ${EXPECTED_GEN17_CLEANUP_TARGET.generation}`)) {
      unavailable('cleanup_path_generation_mismatch')
    }
  }
  if (!doc.includes('OPERATOR_REVIEWED_CLEANUP_PATH') || !doc.includes('DO_NOT_RUN_IN_PHASE_1')) {
    unavailable('cleanup_path_markers_missing')
  }
  if (!checklist.includes('PREDECESSOR_RETIREMENT_OR_REVIEWED_CLEANUP_REQUIRED')) {
    unavailable('pre_arm_checklist_marker_missing')
  }
  // Refuse if the cleanup-targets table still lists the Gen 16 leftover as windowId.
  if (/^\s*\|\s*windowId\s*\|\s*`?313afec9-46d0-41bb-af47-0be277c6fa4f/im.test(doc)) {
    unavailable('cleanup_path_pins_gen16_leftover')
  }
  return Object.freeze({
    status: 'REVIEWED_CLEANUP_PATH_LISTED',
    path: REVIEWED_CLEANUP_DOC,
    target: EXPECTED_GEN17_CLEANUP_TARGET,
  })
}

/**
 * Phase 2 pre-arm assertion. Safe to call with gates false (Phase 1 / ordinary tests).
 * When `requireArmedGatesFalse` is true (default), refuses if Gen 19 native gates are already true
 * without a separate arming review — Phase 1 must stay disarmed.
 */
export async function assertGeneration19PreArmReady({
  retirementEvidence = null,
  requireArmedGatesFalse = true,
} = {}) {
  if (GENERATION !== 19 || WINDOW_ID !== '51809dd4-bd4b-44c7-8609-7dd8ca063679' || PACKAGE_ID !== 'tll-staging-generation-19-credentials/v1') {
    unavailable('package_identity_mismatch')
  }
  if (PREDECESSOR.generation !== 17 || PREDECESSOR.windowId !== EXPECTED_GEN17_CLEANUP_TARGET.windowId) {
    unavailable('role_predecessor_mismatch')
  }

  await assertRecoverySuccessorPinsMatchCredentials([17, 18, 19])

  if (requireArmedGatesFalse) {
    if (NATIVE_GENERATION_19_TRANSPORT_ENABLED !== false || NATIVE_GENERATION_19_DATABASE_TRANSPORT_ENABLED !== false) {
      unavailable('native_gates_must_stay_false_until_arming_diff')
    }
  }

  const proven = projectPredecessorRetirementEvidence(retirementEvidence)
  let cleanupPath = null
  if (!proven) {
    cleanupPath = assertReviewedGen17CleanupPathListed()
  }

  if (!proven && !cleanupPath) unavailable('predecessor_retirement_unproven')

  return Object.freeze({
    schema: PRE_ARM_SCHEMA,
    status: 'PRE_ARM_READY',
    generation: GENERATION,
    windowId: WINDOW_ID,
    packageId: PACKAGE_ID,
    predecessor: Object.freeze({ ...PREDECESSOR }),
    predecessorRetirementProven: Boolean(proven),
    reviewedCleanupPathListed: Boolean(cleanupPath),
    cleanupPath: cleanupPath?.path ?? null,
    nativeGatesArmed: false,
    nextAction: proven
      ? 'INDEPENDENT_ARMING_REVIEW'
      : 'OPERATOR_APPROVED_GEN17_CLEANUP_THEN_ARMING_REVIEW',
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await assertGeneration19PreArmReady()
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
