/** Offline-only assessment of the Vercel names that Gen22 would install. */
import { assessStagingPreviewEnvironment } from './staging-preview-environment-assessment.mjs'
import { DISABLED_VERCEL_CONFIGURATION, MISSING_VERCEL_SECRET_NAMES } from './staging-generation-22-material.mjs'

export const STAGING_GENERATION_22_PREFLIGHT_ASSESSMENT_ENABLED = false
const GOOD = Object.freeze({ vercel: 'GENERATION_22_NAMES_ABSENT',
  supabase: 'DISABLED_BASELINE_OBSERVED' })
const unavailable = () => { throw Error('Generation 22 preflight assessment unavailable') }
const absentNames = Object.freeze([...MISSING_VERCEL_SECRET_NAMES,
  ...Object.keys(DISABLED_VERCEL_CONFIGURATION)].sort())

/** Receives only the fixed reader's value-free, effective-Preview inventory. */
export function assessStagingGeneration22PreflightVercel({ project, inventory } = {}) {
  // Reuse the existing strict project, repository, branch, entry and duplicate
  // checks. With no required names it validates the envelope without imposing
  // the post-installation expectation that new names are present.
  const envelope = assessStagingPreviewEnvironment({ project, inventory,
    requiredSecrets: [], requiredConfiguration: [] })
  if (envelope.status !== 'NAMES_PRESENT' || absentNames.length !== 20
    || new Set(absentNames).size !== absentNames.length) unavailable()
  const keys = new Set(inventory.entries.map(entry => entry.key))
  const present = absentNames.filter(name => keys.has(name))
  return Object.freeze({ status: present.length ? 'HOLD' : 'GENERATION_22_NAMES_ABSENT',
    projectId: envelope.projectId, branch: envelope.branch,
    requiredAbsentCount: absentNames.length, present: Object.freeze(present) })
}

/** A held or uncertain preflight must fail the command-line stage gate. */
export function stagingGeneration22PreflightExitCode(mode, status) {
  return Object.hasOwn(GOOD, mode) && status === GOOD[mode] ? 0 : 1
}
