/** Disabled value-free metadata readback after the six Gen23 setting writes. */
import { EDGE_PASSWORD_NAME, EDGE_READINESS_WINDOW_NAME, PROJECT_REF, VERCEL_PASSWORD_NAMES } from './staging-generation-23-password-material.mjs'
import { HOSTED_BASELINE_VERCEL_TARGET } from './staging-account-hosted-baseline-vercel.mjs'

export const STAGING_GENERATION_23_SETTINGS_READBACK_ENABLED = true
const unavailable = () => { throw Error('Generation 23 settings readback unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const validTarget = (value, name) => exact(value, ['name', 'id', 'branch', 'target', 'classification'])
  && value.name === name && /^[A-Za-z0-9_-]{4,128}$/.test(value.id)
  && value.branch === HOSTED_BASELINE_VERCEL_TARGET.branch
  && value.target === 'preview' && value.classification === 'sensitive'

/** Reads only names, IDs, branch and classification; secret values are write-only. */
export function createStagingGeneration23SettingsReadback({ readVercelTargets, readEdgeNames } = {}) {
  if (!STAGING_GENERATION_23_SETTINGS_READBACK_ENABLED
    || typeof readVercelTargets !== 'function' || typeof readEdgeNames !== 'function') unavailable()
  let used = false
  return Object.freeze({
    async prove({ expectedTargets, signal } = {}) {
      if (used || !signal || signal.aborted || typeof signal.addEventListener !== 'function'
        || !Array.isArray(expectedTargets) || expectedTargets.length !== VERCEL_PASSWORD_NAMES.length
        || !expectedTargets.every((item, index) => validTarget(item, VERCEL_PASSWORD_NAMES[index]))) unavailable()
      used = true
      const observed = await readVercelTargets({ signal })
      if (signal.aborted || !Array.isArray(observed) || observed.length !== expectedTargets.length
        || !observed.every((item, index) => validTarget(item, VERCEL_PASSWORD_NAMES[index])
          && item.id === expectedTargets[index].id)) unavailable()
      const edgeNames = await readEdgeNames({ signal })
      if (signal.aborted || !Array.isArray(edgeNames) || edgeNames.length > 4096
        || edgeNames.some(name => typeof name !== 'string' || !/^[A-Z][A-Z0-9_]{0,255}$/.test(name))
        || new Set(edgeNames).size !== edgeNames.length
        || edgeNames.filter(name => name === EDGE_PASSWORD_NAME).length !== 1
        || edgeNames.filter(name => name === EDGE_READINESS_WINDOW_NAME).length !== 1) unavailable()
      return Object.freeze({ status: 'SETTINGS_METADATA_VERIFIED', projectRef: PROJECT_REF,
        branch: HOSTED_BASELINE_VERCEL_TARGET.branch, vercelCount: observed.length,
        edgeNamePresent: true, valuesReadable: false })
    },
  })
}
