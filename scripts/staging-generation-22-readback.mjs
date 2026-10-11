/** Pure post-stage check; receives only scoped metadata and four public OFF values. */
import { HOSTED_BASELINE_VERCEL_TARGET } from './staging-account-hosted-baseline-vercel.mjs'
import { DISABLED_VERCEL_CONFIGURATION, MISSING_SUPABASE_SECRET_NAMES,
  MISSING_VERCEL_SECRET_NAMES, PROJECT_REF } from './staging-generation-22-material.mjs'

export const STAGING_GENERATION_22_READBACK_ENABLED = false
const unavailable = () => { throw new Error('Generation 22 readback unavailable') }
const ID = /^[A-Za-z0-9_-]{4,128}$/
const NAME = /^[A-Z][A-Z0-9_]{0,255}$/
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

export function assessStagingGeneration22Readback({ inventory, edgeEvidence, configValues,
  configIds } = {}) {
  if (!STAGING_GENERATION_22_READBACK_ENABLED || !exact(inventory, ['target', 'environment', 'branch', 'entries'])
    || JSON.stringify(inventory.target) !== JSON.stringify(HOSTED_BASELINE_VERCEL_TARGET)
    || inventory.environment !== 'preview' || inventory.branch !== HOSTED_BASELINE_VERCEL_TARGET.branch
    || !Array.isArray(inventory.entries) || inventory.entries.length > 4_096
    || !exact(edgeEvidence, ['projectRef', 'names']) || edgeEvidence.projectRef !== PROJECT_REF
    || !Array.isArray(edgeEvidence.names) || edgeEvidence.names.length > 4_096
    || edgeEvidence.names.some(name => typeof name !== 'string' || !NAME.test(name))
    || new Set(edgeEvidence.names).size !== edgeEvidence.names.length
    || !edgeEvidence.names.includes(MISSING_SUPABASE_SECRET_NAMES[0])) unavailable()
  const entries = new Map()
  for (const item of inventory.entries) {
    if (!exact(item, ['key', 'type', 'visibility', 'scope']) || !NAME.test(item.key)
      || entries.has(item.key) || !['preview', 'branch'].includes(item.scope)) unavailable()
    entries.set(item.key, item)
  }
  for (const name of MISSING_VERCEL_SECRET_NAMES) {
    const item = entries.get(name)
    if (!item || item.scope !== 'branch' || item.type !== 'sensitive' || item.visibility !== 'secret') unavailable()
  }
  const names = Object.keys(DISABLED_VERCEL_CONFIGURATION).sort()
  if (!exact(configIds, names) || !Array.isArray(configValues) || configValues.length !== names.length
    || new Set(Object.values(configIds)).size !== names.length
    || Object.values(configIds).some(id => typeof id !== 'string' || !ID.test(id))) unavailable()
  const seen = new Set()
  for (const item of configValues) {
    if (!exact(item, ['id', 'key', 'value', 'gitBranch', 'target', 'type', 'visibility', 'decrypted'])
      || !Object.hasOwn(DISABLED_VERCEL_CONFIGURATION, item.key) || seen.has(item.key)
      || item.id !== configIds[item.key] || item.value !== DISABLED_VERCEL_CONFIGURATION[item.key]
      || item.gitBranch !== HOSTED_BASELINE_VERCEL_TARGET.branch
      || !(item.target === 'preview' || (Array.isArray(item.target)
        && item.target.length === 1 && item.target[0] === 'preview'))
      || item.type !== 'encrypted' || item.visibility !== 'config' || item.decrypted !== true) unavailable()
    const listing = entries.get(item.key)
    if (!listing || listing.type !== item.type || listing.visibility !== item.visibility
      || listing.scope !== 'branch') unavailable()
    seen.add(item.key)
  }
  if (seen.size !== names.length) unavailable()
  return Object.freeze({ status: 'DISABLED_SETTINGS_VERIFIED', projectRef: PROJECT_REF,
    branch: HOSTED_BASELINE_VERCEL_TARGET.branch, vercelSecretCount: MISSING_VERCEL_SECRET_NAMES.length,
    disabledControlCount: names.length, edgePasswordNamePresent: true })
}
