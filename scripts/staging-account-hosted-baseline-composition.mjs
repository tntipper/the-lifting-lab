/**
 * Pure composition for the three disabled hosted-baseline bindings.
 *
 * It owns no credential lookup or network primitive. The same one-shot surface
 * promise supplies both the surface and deployment ports so the baseline never
 * repeats alias, deployment, readiness, or Edge observations.
 */
import { BROKER_SECRET_NAME } from './staging-provider-broker-rotation.mjs'
import { createStagingAccountHostedBaseline } from './staging-account-hosted-baseline.mjs'

export const HOSTED_BASELINE_COMPOSITION_ENABLED = false
export const HOSTED_BASELINE_COMPOSITION_ERROR = 'Staging hosted baseline composition unavailable'

const unavailable = () => { throw new Error(HOSTED_BASELINE_COMPOSITION_ERROR) }
const classifiedUnavailable = code => { const error = new Error(HOSTED_BASELINE_COMPOSITION_ERROR); error.code = code; throw error }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const positiveRepositoryId = value => typeof value === 'number' && Number.isSafeInteger(value) && value > 0

function validateBindings(supabase, vercel, surface) {
  if (!supabase || !vercel || !surface
    || typeof supabase.readDatabase !== 'function' || typeof supabase.readProvider !== 'function'
    || typeof supabase.readEdgeSecretNames !== 'function' || typeof supabase.dispose !== 'function'
    || typeof vercel.readProject !== 'function' || typeof vercel.readPreviewEnvironmentPresence !== 'function'
    || typeof vercel.dispose !== 'function'
    || typeof surface.readBaseline !== 'function' || typeof surface.dispose !== 'function') unavailable()
}

function mergeVercel(project, observedSurface) {
  if (!exact(project, ['target', 'repository']) || !project.repository || typeof project.repository !== 'object'
    || Array.isArray(project.repository) || !positiveRepositoryId(project.repository.repoId)
    || project.repository.provider !== 'github' || project.repository.sourceless !== false
    || !exact(observedSurface, ['surface', 'deployment']) || !observedSurface.deployment
    || typeof observedSurface.deployment !== 'object' || Array.isArray(observedSurface.deployment)) unavailable()
  const deployment = observedSurface.deployment
  const repositoryId = String(project.repository.repoId)
  if (deployment.repositoryId !== repositoryId || deployment.gitProvider !== project.repository.provider) unavailable()
  return Object.freeze({
    projectId: deployment.projectId,
    project: deployment.project,
    teamId: deployment.teamId,
    scope: deployment.scope,
    branch: deployment.branch,
    alias: deployment.alias,
    deploymentId: deployment.deploymentId,
    immutableUrl: deployment.immutableUrl,
    gitSourceCommit: deployment.gitSourceCommit,
    applicationManifestSha256: deployment.applicationManifestSha256,
    repositoryId,
    gitProvider: project.repository.provider,
  })
}

export function createStagingAccountHostedBaselineComposition({ supabase, vercel, surface } = {}) {
  validateBindings(supabase, vercel, surface)
  let consumed = false; let disposed = false
  const disposeBindings = () => {
    if (disposed) return
    disposed = true
    supabase.dispose(); vercel.dispose(); surface.dispose()
  }
  return Object.freeze({
    nativeEnabled: HOSTED_BASELINE_COMPOSITION_ENABLED,
    async observe(input = {}) {
      if (consumed || disposed) unavailable()
      consumed = true
      let coreSignal, abortCore, surfacePromise
      const session = new AbortController()
      const abortSession = () => { if (!session.signal.aborted) session.abort() }
      let firstReadFailure = null
      const failedRead = (code, error) => {
        // The original error may contain a URL, token, or provider response.
        // Retain only this fixed operation label before aborting siblings.
        if (!firstReadFailure && !session.signal.aborted) firstReadFailure = code
        abortSession()
        throw error
      }
      const sessionSignal = childSignal => {
        if (!childSignal || typeof childSignal.addEventListener !== 'function' || childSignal.aborted) unavailable()
        if (coreSignal && coreSignal !== childSignal) unavailable()
        if (!coreSignal) {
          coreSignal = childSignal
          abortCore = abortSession
          coreSignal.addEventListener('abort', abortCore, { once: true })
          if (coreSignal.aborted) abortSession()
        }
        return session.signal
      }
      const call = async (childSignal, code, operation) => {
        const hostedSignal = sessionSignal(childSignal)
        try { return await operation(hostedSignal) } catch (error) { failedRead(code, error) }
      }
      const settleGroup = async (childSignal, operations) => {
        const hostedSignal = sessionSignal(childSignal)
        const pending = operations.map(([code, operation]) => Promise.resolve().then(() => operation(hostedSignal)).catch(error => failedRead(code, error)))
        const results = await Promise.allSettled(pending)
        if (session.signal.aborted || results.some(result => result.status !== 'fulfilled')) unavailable()
        return results.map(result => result.value)
      }
      const readSurfaceOnce = childSignal => {
        const hostedSignal = sessionSignal(childSignal)
        if (!surfacePromise) surfacePromise = Promise.resolve().then(() => surface.readBaseline({ signal: hostedSignal })).catch(error => failedRead('surface_read_unavailable', error))
        return surfacePromise
      }
      try {
        if (!exact(input, ['signal'])) unavailable()
        const { signal } = input
        const baseline = createStagingAccountHostedBaseline({
          readDatabase: ({ signal: childSignal }) => call(childSignal, 'database_read_unavailable', hostedSignal => supabase.readDatabase({ signal: hostedSignal })),
          readProvider: ({ signal: childSignal }) => call(childSignal, 'provider_read_unavailable', hostedSignal => supabase.readProvider({ signal: hostedSignal })),
          readBrokerSecrets: async ({ signal: childSignal }) => {
            const [supabaseNames, vercelPresence] = await settleGroup(childSignal, [
              ['supabase_secret_names_read_unavailable', hostedSignal => supabase.readEdgeSecretNames({ signal: hostedSignal })],
              ['vercel_environment_read_unavailable', hostedSignal => vercel.readPreviewEnvironmentPresence({ signal: hostedSignal })],
            ])
            if (!Array.isArray(supabaseNames) || !vercelPresence || typeof vercelPresence.brokerSecretPresent !== 'boolean') unavailable()
            return Object.freeze({ supabase: supabaseNames, vercel: Object.freeze(vercelPresence.brokerSecretPresent ? [BROKER_SECRET_NAME] : []) })
          },
          readSurface: async ({ signal: childSignal }) => (await readSurfaceOnce(childSignal)).surface,
          readVercel: async ({ signal: childSignal }) => {
            const [project, observedSurface] = await settleGroup(childSignal, [
              ['vercel_project_read_unavailable', hostedSignal => vercel.readProject({ signal: hostedSignal })],
              ['surface_read_unavailable', () => readSurfaceOnce(childSignal)],
            ])
            return mergeVercel(project, observedSurface)
          },
        })
        return await baseline.observe({ signal })
      } catch { classifiedUnavailable(firstReadFailure || 'observation_validation_unavailable') } finally {
        abortSession()
        try { coreSignal?.removeEventListener('abort', abortCore) } catch {}
        disposeBindings()
      }
    },
    dispose: disposeBindings,
  })
}
