/** Disabled worker core: the durable phase owns credential acquisition. */
import { randomBytes, randomUUID } from 'node:crypto'
import { createBrokerPhaseJournal } from './staging-provider-broker-phase-journal.mjs'
import { createProviderBrokerRotationJournal } from './staging-provider-broker-rotation.mjs'
import { runPhasedBrokerRotation } from './staging-provider-broker-phased-session.mjs'
import { createStagingProviderBrokerRestPorts } from './staging-provider-broker-rest-ports.mjs'

export const STAGING_BROKER_REST_WORKER_CORE_ENABLED = false
const unavailable = () => { throw Error('Staging broker REST worker core unavailable') }
const credentialNames = ['managementToken', 'vercelToken', 'protectionBypassToken']
const exactCredentials = value => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === credentialNames.slice().sort().join('|')
const wipe = value => {
  if (!value || typeof value !== 'object') return
  for (const item of Object.values(value)) if (Buffer.isBuffer(item)) item.fill(0)
}

/** Both durable records must identify one attempt with the same run ID. */
export function createStagingProviderBrokerRestJournals({ phasePath, rotationPath } = {}) {
  const runId = randomUUID()
  return Object.freeze({
    phaseJournal: createBrokerPhaseJournal({ ...(phasePath === undefined ? {} : { path: phasePath }), makeRunId: () => runId }),
    rotationJournal: createProviderBrokerRotationJournal({ ...(rotationPath === undefined ? {} : { path: rotationPath }),
      makeRunId: () => runId }),
  })
}

/**
 * This function has no credential source or live entry point. The caller must
 * supply a bounded, supervised worker and a credential reader that clears any
 * partial results before it rejects. The phase session starts its one-use
 * journal before invoking acquireCredentials.
 */
export async function runStagingProviderBrokerRestWorker({ phaseJournal, rotationJournal,
  acquireCredentials, fetch: fetcher, stopWorkerGroup, execute, now = Date.now,
  generateSecret = randomBytes, createPorts = createStagingProviderBrokerRestPorts } = {}) {
  if (!phaseJournal || !rotationJournal || typeof acquireCredentials !== 'function'
    || typeof fetcher !== 'function' || typeof stopWorkerGroup !== 'function'
    || typeof execute !== 'function' || typeof now !== 'function'
    || typeof generateSecret !== 'function' || typeof createPorts !== 'function') unavailable()
  return runPhasedBrokerRotation({ phaseJournal, rotationJournal, randomBytes: generateSecret, now,
    acquirePorts: async () => {
      let credentials
      try {
        credentials = await acquireCredentials()
        if (!exactCredentials(credentials) || credentialNames.some(name => !Buffer.isBuffer(credentials[name]))) unavailable()
        return await createPorts({ phaseJournal, ...credentials, fetch: fetcher, stopWorkerGroup, execute, now })
      } finally { wipe(credentials) }
    } })
}
