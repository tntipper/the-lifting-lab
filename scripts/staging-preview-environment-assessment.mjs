/** Pure, value-free assessment of the fixed staging Preview's required names. */
import { HOSTED_BASELINE_VERCEL_TARGET } from './staging-account-hosted-baseline-vercel.mjs'

export const STAGING_PREVIEW_ENVIRONMENT_ASSESSMENT_ENABLED = false
const REPOSITORY_ID = 1264363509
const NAME = /^[A-Z][A-Z0-9_]{0,255}$/
const unavailable = () => { throw new Error('Staging Preview environment assessment unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

function names(value) {
  if (!Array.isArray(value) || value.length > 128 || value.some(name => typeof name !== 'string' || !NAME.test(name))
    || new Set(value).size !== value.length) unavailable()
  return value
}

export function assessStagingPreviewEnvironment({ project, inventory, requiredSecrets, requiredConfiguration } = {}) {
  if (!exact(project, ['target', 'repository']) || !exact(project.repository,
    ['provider', 'repoId', 'org', 'repo', 'ownerId', 'productionBranch', 'sourceless'])
    || project.repository.provider !== 'github' || project.repository.repoId !== REPOSITORY_ID
    || project.repository.org !== 'tntipper' || project.repository.repo !== 'the-lifting-lab'
    || !exact(inventory, ['target', 'environment', 'branch', 'entries'])
    || inventory.environment !== 'preview' || inventory.branch !== 'codex/tll-integration'
    || JSON.stringify(project.target) !== JSON.stringify(HOSTED_BASELINE_VERCEL_TARGET)
    || JSON.stringify(inventory.target) !== JSON.stringify(HOSTED_BASELINE_VERCEL_TARGET)) unavailable()
  const secrets = names(requiredSecrets), configuration = names(requiredConfiguration)
  if (new Set([...secrets, ...configuration]).size !== secrets.length + configuration.length
    || !Array.isArray(inventory.entries) || inventory.entries.length > 4_096) unavailable()
  const present = new Map()
  for (const entry of inventory.entries) {
    if (!exact(entry, ['key', 'type', 'visibility', 'scope']) || !NAME.test(entry.key)
      || !['plain', 'encrypted', 'secret', 'sensitive', 'system'].includes(entry.type)
      || !['config', 'secret', 'unknown'].includes(entry.visibility)
      || !['preview', 'branch'].includes(entry.scope) || present.has(entry.key)) unavailable()
    present.set(entry.key, entry)
  }
  const missing = [...secrets, ...configuration].filter(name => !present.has(name)).sort()
  const secretClassificationUnproven = secrets.filter(name => present.has(name) && present.get(name).visibility !== 'secret').sort()
  return Object.freeze({ status: missing.length || secretClassificationUnproven.length ? 'HOLD' : 'NAMES_PRESENT',
    projectId: HOSTED_BASELINE_VERCEL_TARGET.projectId, branch: HOSTED_BASELINE_VERCEL_TARGET.branch,
    requiredCount: secrets.length + configuration.length, presentCount: secrets.length + configuration.length - missing.length,
    missing: Object.freeze(missing), secretClassificationUnproven: Object.freeze(secretClassificationUnproven) })
}
