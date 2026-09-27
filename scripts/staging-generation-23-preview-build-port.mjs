/** Disabled bridge from the whole Gen23 route to two existing one-use Preview workers. */
import { STAGING_BRANCH, STAGING_SURFACE_TARGET } from './staging-surface-activation-transport.mjs'

export const STAGING_GENERATION_23_PREVIEW_BUILD_PORT_ENABLED = true
const unavailable = () => { throw new Error('Generation 23 Preview build port unavailable') }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

/** runBuild must be the already supervised, journal-owning one-use Preview worker. */
export function createStagingGeneration23PreviewBuildPort({ enabledJournal, heldJournal,
  runBuild, readDeployment } = {}) {
  if (!STAGING_GENERATION_23_PREVIEW_BUILD_PORT_ENABLED || !enabledJournal || !heldJournal
    || enabledJournal === heldJournal || [enabledJournal.read, heldJournal.read, runBuild, readDeployment]
      .some(value => typeof value !== 'function')
    || enabledJournal.read() !== null || heldJournal.read() !== null) unavailable()
  let step = 'READY_ENABLED'
  return Object.freeze({
    async createDeployment(target, request, { signal } = {}) {
      if (!same(target, STAGING_SURFACE_TARGET) || !signal || signal.aborted
        || typeof signal.addEventListener !== 'function'
        || !exact(request, ['branch', 'sourceCommit', 'manifestSha256', 'publicCustomer',
          'publicCart', 'project', 'scope'])
        || request.branch !== STAGING_BRANCH || request.project !== STAGING_SURFACE_TARGET.vercelProject
        || request.scope !== STAGING_SURFACE_TARGET.vercelScope
        || !/^[a-f0-9]{40}$/.test(request.sourceCommit)
        || !/^[a-f0-9]{64}$/.test(request.manifestSha256)
        || typeof request.publicCustomer !== 'boolean'
        || request.publicCustomer !== request.publicCart
        || !['READY_ENABLED', 'READY_HELD'].includes(step)
        || request.publicCustomer !== (step === 'READY_ENABLED')) unavailable()
      const journal = step === 'READY_ENABLED' ? enabledJournal : heldJournal
      if (journal.read() !== null) unavailable()
      // Consume this bridge step before calling the worker. An uncertain POST
      // must never become another attempt through this same port instance.
      const enabled = step === 'READY_ENABLED'
      step = enabled ? 'ENABLE_PENDING' : 'HELD_PENDING'
      const input = Object.freeze({ branch: request.branch, sourceCommit: request.sourceCommit,
        manifestSha256: request.manifestSha256, publicCustomer: request.publicCustomer,
        publicCart: request.publicCart })
      const result = await runBuild({ input, journal, signal })
      const record = journal.read()
      if (!exact(result, ['status', 'deploymentId', 'immutableUrl', 'sourceCommit',
        'manifestSha256', 'customerEnabled', 'cartEnabled'])
        || result.status !== 'PROTECTED_PREVIEW_VERIFIED'
        || !/^dpl_[A-Za-z0-9]+$/.test(result.deploymentId ?? '')
        || !/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(result.immutableUrl ?? '')
        || result.sourceCommit !== input.sourceCommit
        || result.manifestSha256 !== input.manifestSha256
        || result.customerEnabled !== input.publicCustomer
        || result.cartEnabled !== input.publicCart
        || record?.phase !== 'VERIFIED' || record.deploymentId !== result.deploymentId
        || record.sourceCommit !== input.sourceCommit
        || record.manifestSha256 !== input.manifestSha256
        || record.publicCustomer !== input.publicCustomer
        || record.publicCart !== input.publicCart || signal.aborted) unavailable()
      const identity = await readDeployment(target, result.deploymentId, { signal })
      if (!exact(identity, ['target', 'deploymentId', 'immutableUrl', 'sourceCommit',
        'manifestSha256', 'ready', 'createdAt'])
        || !same(identity.target, STAGING_SURFACE_TARGET)
        || identity.deploymentId !== result.deploymentId
        || identity.immutableUrl !== result.immutableUrl
        || identity.sourceCommit !== input.sourceCommit
        || identity.manifestSha256 !== input.manifestSha256
        || identity.ready !== true || !Number.isFinite(Date.parse(identity.createdAt))
        || signal.aborted) unavailable()
      const deployment = { ...identity }
      delete deployment.target
      step = enabled ? 'READY_HELD' : 'COMPLETE'
      return Object.freeze(deployment)
    },
  })
}
