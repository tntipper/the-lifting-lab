/** One held Preview built after settings, followed by fixed consumer reads. */
import { STAGING_BRANCH, STAGING_SURFACE_TARGET } from './staging-surface-activation-transport.mjs'

export const STAGING_GENERATION_23_CONSUMER_PROOF_ENABLED = false
const unavailable = () => { throw Error('Generation 23 consumer proof unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const signalOk = signal => signal && !signal.aborted && typeof signal.addEventListener === 'function'

export function createStagingGeneration23ConsumerProof({ journal, diagnostic, runBuild, readDeployment,
  readWebsite, readEdge } = {}) {
  if (!STAGING_GENERATION_23_CONSUMER_PROOF_ENABLED || !journal || typeof journal.read !== 'function'
    || journal.read() !== null || [runBuild, readDeployment, readWebsite, readEdge]
      .some(value => typeof value !== 'function')) unavailable()
  let used = false
  return Object.freeze({
    async prove({ sourceCommit, manifestSha256, signal } = {}) {
      if (used || !signalOk(signal) || !/^[a-f0-9]{40}$/.test(sourceCommit ?? '')
        || !/^[a-f0-9]{64}$/.test(manifestSha256 ?? '')) unavailable()
      used = true
      const input = Object.freeze({ branch: STAGING_BRANCH, sourceCommit, manifestSha256,
        publicCustomer: false, publicCart: false })
      let claimed = false, finished = false
      try {
      if (diagnostic) { diagnostic.claim(sourceCommit); claimed = true }
      // The worker owns the durable one-use POST record. Never retry an
      // uncertain build or silently substitute the old held deployment.
      const built = await runBuild({ input, journal, signal })
      const record = journal.read()
      if (!exact(built, ['status', 'deploymentId', 'immutableUrl', 'sourceCommit',
        'manifestSha256', 'customerEnabled', 'cartEnabled'])
        || built.status !== 'PROTECTED_PREVIEW_VERIFIED'
        || !/^dpl_[A-Za-z0-9]+$/.test(built.deploymentId)
        || !/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(built.immutableUrl)
        || built.sourceCommit !== sourceCommit || built.manifestSha256 !== manifestSha256
        || built.customerEnabled !== false || built.cartEnabled !== false
        || record?.phase !== 'VERIFIED' || record.deploymentId !== built.deploymentId
        || record.sourceCommit !== sourceCommit || record.manifestSha256 !== manifestSha256
        || record.publicCustomer !== false || record.publicCart !== false || signal.aborted) unavailable()
      diagnostic?.verified('preview_build')
      diagnostic?.pending('deployment_identity')
      const identity = await readDeployment(STAGING_SURFACE_TARGET, built.deploymentId, { signal })
      if (!exact(identity, ['target', 'deploymentId', 'immutableUrl', 'sourceCommit',
        'manifestSha256', 'ready', 'createdAt']) || !same(identity.target, STAGING_SURFACE_TARGET)
        || identity.deploymentId !== built.deploymentId || identity.immutableUrl !== built.immutableUrl
        || identity.sourceCommit !== sourceCommit || identity.manifestSha256 !== manifestSha256
        || identity.ready !== true || !Number.isFinite(Date.parse(identity.createdAt)) || signal.aborted) unavailable()
      diagnostic?.verified('deployment_identity')
      diagnostic?.pending('website_request')
      const website = await readWebsite(identity, { signal, diagnostic })
      if (!exact(website, ['status', 'checks', 'deploymentId']) || website.status !== 'PASS'
        || website.deploymentId !== built.deploymentId
        || !exact(website.checks, ['customer', 'cart', 'provisional', 'bridge'])
        || Object.values(website.checks).some(value => value !== 'PASS') || signal.aborted) unavailable()
      diagnostic?.verified('website_response_validation')
      diagnostic?.pending('broker_service_key')
      const edge = await readEdge({ signal, diagnostic })
      if (!exact(edge, ['status']) || edge.status !== 'PASS' || signal.aborted) unavailable()
      diagnostic?.finish(); finished = true
      return Object.freeze({ status: 'CONSUMERS_READY_VERIFIED', deployment: identity })
      } catch (error) {
        if (claimed && !finished) diagnostic?.hold()
        throw error
      }
    },
  })
}
