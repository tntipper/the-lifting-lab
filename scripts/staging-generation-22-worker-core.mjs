/** Disabled one-use join of setup, five drained logins and role retirement. */
import { WINDOW_ID } from './staging-generation-22-credentials.mjs'
import { GENERATION, PROJECT_REF } from './staging-generation-22-material.mjs'
import { WORKER_TERMINAL_SCHEMA } from './staging-generation-22-process-supervisor.mjs'

export const STAGING_GENERATION_22_WORKER_CORE_ENABLED = false
const unavailable = () => { throw new Error('Generation 22 worker core unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

export function createStagingGeneration22WorkerCore({ setup, recovery } = {}) {
  if (!STAGING_GENERATION_22_WORKER_CORE_ENABLED
    || typeof setup?.stage !== 'function' || typeof recovery?.recover !== 'function') unavailable()
  let used = false
  return Object.freeze({
    async run({ signal } = {}) {
      if (used || !signal || signal.aborted || typeof signal.addEventListener !== 'function') unavailable()
      used = true
      let staged
      try { staged = await setup.stage({ signal }) }
      catch { return Object.freeze({ status: 'SETUP_RECONCILIATION_REQUIRED' }) }
      if (signal.aborted || !exact(staged, ['status', 'projectRef', 'generation', 'operationCount'])
        || staged.status !== 'SETTINGS_AND_CONNECTIONS_VERIFIED'
        || staged.projectRef !== PROJECT_REF || staged.generation !== GENERATION
        || staged.operationCount !== 22) {
        // A failed or uncertain connection close cannot safely overlap with
        // retirement. The fixed login expiry and separate reconciliation apply.
        return Object.freeze({ status: 'SETUP_RECONCILIATION_REQUIRED' })
      }
      let retired
      try { retired = await recovery.recover({ signal }) }
      catch { return Object.freeze({ status: 'RECOVERY_RECONCILIATION_REQUIRED' }) }
      if (signal.aborted || !exact(retired, ['status', 'projectRef', 'generation'])
        || retired.status !== 'RECOVERY_VERIFIED' || retired.projectRef !== PROJECT_REF
        || retired.generation !== GENERATION) {
        return Object.freeze({ status: 'RECOVERY_RECONCILIATION_REQUIRED' })
      }
      return Object.freeze({ schema: WORKER_TERMINAL_SCHEMA, status: 'DRAINED',
        projectRef: PROJECT_REF, generation: GENERATION, windowId: WINDOW_ID,
        setupStatus: staged.status, recoveryStatus: retired.status })
    },
  })
}
