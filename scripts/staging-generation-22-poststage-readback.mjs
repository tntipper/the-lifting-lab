/** Disabled, injected-only post-stage proof for Gen22 Preview settings. */
import { DISABLED_VERCEL_CONFIGURATION, PROJECT_REF } from './staging-generation-22-material.mjs'
import { assessStagingGeneration22Readback } from './staging-generation-22-readback.mjs'
import { HOSTED_BASELINE_VERCEL_TARGET } from './staging-account-hosted-baseline-vercel.mjs'

export const STAGING_GENERATION_22_POSTSTAGE_READBACK_ENABLED = false
const unavailable = () => { throw new Error('Generation 22 post-stage readback unavailable') }
const ID = /^[A-Za-z0-9_-]{4,128}$/
const names = Object.keys(DISABLED_VERCEL_CONFIGURATION).sort()
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

/** Reader objects and signal are owned by the caller; this module never discovers tokens. */
export function createStagingGeneration22PoststageReadback({ vercel, supabase, config, now = Date.now,
  timeoutMs = 45_000 } = {}) {
  if (!STAGING_GENERATION_22_POSTSTAGE_READBACK_ENABLED || !vercel || !supabase || !config
    || typeof vercel.readProject !== 'function'
    || typeof vercel.readEffectivePreviewEnvironmentInventory !== 'function'
    || supabase.target !== PROJECT_REF || typeof supabase.readEdgeSecretNames !== 'function'
    || typeof config.readDisabled !== 'function' || typeof now !== 'function'
    || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 45_000) unavailable()
  let used = false
  return Object.freeze({
    async prove({ createdControls, signal } = {}) {
      if (used || !signal || signal.aborted || typeof signal.addEventListener !== 'function'
        || !exact(createdControls, names)) unavailable()
      const configIds = {}
      for (const name of names) {
        const receipt = createdControls[name]
        if (!exact(receipt, ['status', 'name', 'id', 'branch', 'target', 'classification'])
          || receipt.status !== 'STAGED' || receipt.name !== name
          || typeof receipt.id !== 'string' || !ID.test(receipt.id)
          || receipt.branch !== HOSTED_BASELINE_VERCEL_TARGET.branch
          || receipt.target !== 'preview' || receipt.classification !== 'config') unavailable()
        configIds[name] = receipt.id
      }
      if (new Set(Object.values(configIds)).size !== names.length) unavailable()
      used = true
      const controller = new AbortController()
      const forwardAbort = () => controller.abort()
      signal.addEventListener('abort', forwardAbort, { once: true })
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let onAbort
      const aborted = new Promise((_, reject) => {
        onAbort = () => reject(new Error('Generation 22 readback expired'))
        controller.signal.addEventListener('abort', onAbort, { once: true })
      })
      const read = operation => Promise.race([Promise.resolve().then(() => {
        if (controller.signal.aborted) unavailable()
        return operation()
      }), aborted])
      const startedAt = now()
      try {
        if (!Number.isFinite(startedAt) || controller.signal.aborted) unavailable()
        const project = await read(() => vercel.readProject({ signal: controller.signal }))
        if (controller.signal.aborted || !exact(project, ['target', 'repository'])
          || JSON.stringify(project.target) !== JSON.stringify(HOSTED_BASELINE_VERCEL_TARGET)
          || !exact(project.repository, ['provider', 'repoId', 'org', 'repo', 'ownerId',
            'productionBranch', 'sourceless'])
          || project.repository.provider !== 'github' || project.repository.repoId !== 1264363509
          || project.repository.org !== HOSTED_BASELINE_VERCEL_TARGET.githubOrg
          || project.repository.repo !== HOSTED_BASELINE_VERCEL_TARGET.githubRepository
          || !Number.isSafeInteger(project.repository.ownerId) || project.repository.ownerId <= 0
          || project.repository.productionBranch !== HOSTED_BASELINE_VERCEL_TARGET.githubProductionBranch
          || typeof project.repository.sourceless !== 'boolean') unavailable()
        const inventory = await read(() => vercel.readEffectivePreviewEnvironmentInventory({ signal: controller.signal }))
        if (controller.signal.aborted) unavailable()
        const edgeNames = await read(() => supabase.readEdgeSecretNames({ signal: controller.signal }))
        if (controller.signal.aborted) unavailable()
        const configValues = []
        for (const name of names) {
          configValues.push(await read(() => config.readDisabled({ name, signal: controller.signal })))
          if (controller.signal.aborted) unavailable()
        }
        const completedAt = now()
        if (!Number.isFinite(completedAt) || completedAt >= startedAt + timeoutMs) unavailable()
        return assessStagingGeneration22Readback({ inventory,
          edgeEvidence: { projectRef: supabase.target, names: edgeNames }, configValues, configIds })
      } catch { unavailable() }
      finally { clearTimeout(timer); signal.removeEventListener('abort', forwardAbort)
        controller.signal.removeEventListener('abort', onAbort) }
    },
  })
}
