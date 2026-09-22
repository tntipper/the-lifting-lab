/**
 * Secret-free Gen 20 pre-arm / Phase 2 gate.
 *
 * Refuses arming Gen 20 unless:
 * 1. Gen 19 + Gen 20 recovery successor pins match their credentials packages, AND
 * 2. the exact Gen 19 predecessor retirement is proven via secret-free evidence.
 *
 * Does not touch hosted staging or Keychain. It verifies either the disabled base
 * or the separately reviewed one-window armed state without invoking native work.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GENERATION, PACKAGE_ID, PREDECESSOR, WINDOW_ID } from './staging-generation-20-credentials.mjs'
import { NATIVE_GENERATION_20_TRANSPORT_ENABLED } from './staging-generation-20-transport.mjs'
import { NATIVE_GENERATION_20_DATABASE_TRANSPORT_ENABLED } from './staging-generation-20-database-transport.mjs'
import { assertRecoverySuccessorPinsMatchCredentials } from './staging-generation-recovery-pin-contract.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const PRE_ARM_SCHEMA = 'tll-generation-20-pre-arm/v1'
export const RETIREMENT_PLAN_DOC = 'docs/ops/stage-plans/2026-09-22-hosted-gen19-retirement-remediation.md'
export const PRE_ARM_CHECKLIST_DOC = 'docs/ops/stage-plans/2026-09-22-generation-20-pre-arm-checklist.md'

export const EXPECTED_GEN19_RETIREMENT_TARGET = Object.freeze({
  generation: 19,
  windowId: '51809dd4-bd4b-44c7-8609-7dd8ca063679',
  packageId: 'tll-staging-generation-19-credentials/v1',
  expiresAt: '2026-09-21T11:08:34.000Z',
})

const unavailable = (reason) => {
  const error = new Error(`Generation-20 pre-arm unavailable: ${reason}`)
  error.failureStep = 'pre_arm'
  error.failureReason = reason
  throw error
}

function readDoc(relativePath) {
  try {
    return readFileSync(resolve(root, relativePath), 'utf8')
  } catch {
    unavailable('retirement_doc_missing')
  }
}

/** Validate optional secret-free retirement evidence (no SQL, secrets, or tokens). */
export function projectPredecessorRetirementEvidence(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const keys = Object.keys(value).sort()
  const allowed = ['schema', 'status', 'predecessorGeneration', 'predecessorWindowId', 'predecessorExpiresAt', 'state', 'provenAt', 'source']
  if (keys.some((k) => !allowed.includes(k))) return null
  if (value.schema !== 'tll-generation-20-predecessor-retirement-evidence/v1') return null
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
 * Confirm the reviewed Gen19 retirement plan and Gen20 checklist carry the
 * exact predecessor contract. This is documentation validation only.
 */
export function assertReviewedGen19RetirementPlanListed() {
  const doc = readDoc(RETIREMENT_PLAN_DOC)
  const checklist = readDoc(PRE_ARM_CHECKLIST_DOC)
  for (const text of [doc, checklist]) {
    if (!text.includes(EXPECTED_GEN19_RETIREMENT_TARGET.windowId)) unavailable('retirement_plan_window_mismatch')
    if (!text.includes(EXPECTED_GEN19_RETIREMENT_TARGET.expiresAt)
    ) {
      unavailable('retirement_plan_generation_mismatch')
    }
  }
  if (!doc.includes('Generation 19') || !checklist.includes('Generation: `19`')) unavailable('retirement_plan_generation_mismatch')
  if (!checklist.includes(EXPECTED_GEN19_RETIREMENT_TARGET.packageId)) unavailable('retirement_plan_package_mismatch')
  if (!doc.includes('Generation 19') || !doc.includes('retirement')) {
    unavailable('retirement_plan_markers_missing')
  }
  if (!checklist.includes('PREDECESSOR_RETIREMENT_EVIDENCE_REQUIRED')) {
    unavailable('pre_arm_checklist_marker_missing')
  }
  return Object.freeze({
    status: 'REVIEWED_RETIREMENT_PLAN_LISTED',
    path: RETIREMENT_PLAN_DOC,
    target: EXPECTED_GEN19_RETIREMENT_TARGET,
  })
}

/**
 * Phase 2 pre-arm assertion. Safe to call with gates false (Phase 1 / ordinary tests).
 * When `requireArmedGatesFalse` is true (default), refuses if Gen 20 native gates are already true
 * without a separate arming review — Phase 1 must stay disarmed.
 */
export async function assertGeneration20PreArmReady({
  retirementEvidence = null,
  requireArmedGatesFalse = true,
} = {}) {
  if (GENERATION !== 20 || WINDOW_ID !== 'a009f2b4-86df-4701-a8bc-1112597e3c42' || PACKAGE_ID !== 'tll-staging-generation-20-credentials/v1') {
    unavailable('package_identity_mismatch')
  }
  if (PREDECESSOR.generation !== 19 || PREDECESSOR.windowId !== EXPECTED_GEN19_RETIREMENT_TARGET.windowId
    || PREDECESSOR.expiresAt !== EXPECTED_GEN19_RETIREMENT_TARGET.expiresAt) {
    unavailable('role_predecessor_mismatch')
  }

  await assertRecoverySuccessorPinsMatchCredentials([17, 18, 19, 20])

  if (requireArmedGatesFalse) {
    if (NATIVE_GENERATION_20_TRANSPORT_ENABLED !== false || NATIVE_GENERATION_20_DATABASE_TRANSPORT_ENABLED !== false) {
      unavailable('native_gates_must_stay_false_until_arming_diff')
    }
  }

  const proven = projectPredecessorRetirementEvidence(retirementEvidence)
  const retirementPlan = assertReviewedGen19RetirementPlanListed()
  if (!proven) unavailable('predecessor_retirement_unproven')

  const nativeGatesArmed = NATIVE_GENERATION_20_TRANSPORT_ENABLED === true
    && NATIVE_GENERATION_20_DATABASE_TRANSPORT_ENABLED === true

  return Object.freeze({
    schema: PRE_ARM_SCHEMA,
    status: 'PRE_ARM_READY',
    generation: GENERATION,
    windowId: WINDOW_ID,
    packageId: PACKAGE_ID,
    predecessor: Object.freeze({ ...PREDECESSOR }),
    predecessorRetirementProven: Boolean(proven),
    reviewedRetirementPlanListed: Boolean(retirementPlan),
    retirementPlan: retirementPlan.path,
    nativeGatesArmed,
    nextAction: nativeGatesArmed
      ? 'ARMED_PHASE_3_REQUIRES_RUN_LIVE_ONCE'
      : proven
        ? 'INDEPENDENT_ARMING_REVIEW'
        : 'PREDECESSOR_RETIREMENT_EVIDENCE_REQUIRED',
  })
}

/** Optional local-only evidence path (implementation-state; never invent remote secrets). */
export const DEFAULT_LOCAL_RETIREMENT_EVIDENCE_PATH =
  'implementation-state/staging/tll-generation-20-predecessor-retirement-evidence.json'
export const RETIREMENT_EVIDENCE_PATH_ENV = 'TLL_GENERATION_20_RETIREMENT_EVIDENCE_PATH'

export function loadRetirementEvidenceFromPath(relative) {
  if (typeof relative !== 'string' || relative.length < 1) unavailable('retirement_evidence_path_empty')
  try {
    return JSON.parse(readFileSync(resolve(root, relative), 'utf8'))
  } catch {
    unavailable('retirement_evidence_unreadable')
  }
}

function loadRetirementEvidenceFromArgv(argv = process.argv) {
  const flag = argv.find((arg) => arg.startsWith('--retirement-evidence='))
  if (!flag) return null
  return loadRetirementEvidenceFromPath(flag.slice('--retirement-evidence='.length))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const retirementEvidence = loadRetirementEvidenceFromArgv()
    const requireArmedGatesFalse = !process.argv.includes('--allow-armed-gates')
    const result = await assertGeneration20PreArmReady({
      retirementEvidence,
      requireArmedGatesFalse,
    })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
