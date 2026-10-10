/** Injected-only staging provider session. The live launcher owns all host effects. */
import { BROKER_SECRET_NAME, PROVIDER_IDENTIFIER, STAGING_PROJECT_REF, STAGING_PROVIDER_TARGET } from './staging-provider-broker-rotation.mjs'
import { disableStagingProviderSupabaseOnly } from './staging-provider-supabase-only-coordinator.mjs'

export const SUPABASE_ONLY_PROVIDER_SESSION_ENABLED = false
const unavailable = () => { throw new Error('Staging provider Supabase-only session unavailable') }
const fixed = status => Object.freeze({ status, target: STAGING_PROVIDER_TARGET, providerIdentifier: PROVIDER_IDENTIFIER })
const validBuffer = value => Buffer.isBuffer(value) && value.length >= 8 && value.length <= 24_576 && !value.includes(0)
const expectedCounts = Object.freeze({ migrations: 15, controlsEnabled: 0, runtimeRoles: 5,
  runtimeSessions: 0, executionEdges: 0, operatorEdges: 5 })

/** Reads and checks disabled staging state before the coordinator can record update intent. */
export async function runSupabaseOnlyProviderSession({ readManagementCredential, openSupabase, makeNativePort,
  execute, journal, phaseJournal } = {}) {
  if ([readManagementCredential, openSupabase, makeNativePort, execute].some(value => typeof value !== 'function')
    || !journal || ['read', 'recordIntent', 'transition'].some(name => typeof journal[name] !== 'function')
    || !phaseJournal || ['read', 'start', 'record', 'finish'].some(name => typeof phaseJournal[name] !== 'function')) unavailable()
  try { if (journal.read() || phaseJournal.read()) return fixed('REPLAY_REJECTED') }
  catch { return fixed('RECONCILIATION_REQUIRED') }

  let managementToken, projectSecret, binding, phase
  try {
    managementToken = await readManagementCredential()
    if (!validBuffer(managementToken)) unavailable()
    binding = openSupabase(managementToken)
    if (!binding || binding.target !== STAGING_PROJECT_REF
      || ['readDatabase', 'readEdgeSecretNames', 'readProjectSecret', 'dispose'].some(name => typeof binding[name] !== 'function')) unavailable()

    const database = await execute(signal => binding.readDatabase({ signal }))
    const receipt = database?.value
    if (database?.status !== 'COMPLETED' || receipt?.status !== 'PASS' || receipt.target !== STAGING_PROJECT_REF
      || !receipt.counts || Object.keys(receipt.counts).sort().join('|') !== Object.keys(expectedCounts).sort().join('|')
      || Object.entries(expectedCounts).some(([name, count]) => receipt.counts[name] !== count)) unavailable()

    const secrets = await execute(signal => binding.readEdgeSecretNames({ signal }))
    if (secrets?.status !== 'COMPLETED' || !Array.isArray(secrets.value)
      || secrets.value.some(name => typeof name !== 'string') || secrets.value.includes(BROKER_SECRET_NAME)) unavailable()

    const key = await execute(signal => binding.readProjectSecret({ signal }))
    projectSecret = key?.value
    if (key?.status !== 'COMPLETED' || !validBuffer(projectSecret)) unavailable()
    binding.dispose(); binding = undefined
    managementToken.fill(0); managementToken = undefined

    const nativePort = makeNativePort({ projectSecret, execute })
    phase = phaseJournal.start()
    phase = phaseJournal.record(phase, 'PREFLIGHT')
    let providerReads = 0
    const port = {
      readProvider: async target => {
        phase = phaseJournal.record(phase, providerReads++ === 0 ? 'PROVIDER_PREREAD' : 'POSTREAD')
        return nativePort.readProvider(target)
      },
      updateProvider: async (target, before) => {
        phase = phaseJournal.record(phase, 'UPDATE_DISPATCH')
        return nativePort.updateProvider(target, before)
      },
    }
    const stagedJournal = {
      read: () => journal.read(),
      recordIntent: digest => {
        const receipt = journal.recordIntent(digest)
        phase = phaseJournal.record(phase, 'INTENT_RECORDED')
        return receipt
      },
      transition: (receipt, state) => {
        const next = journal.transition(receipt, state)
        if (state === 'UPDATE_ACKNOWLEDGED') phase = phaseJournal.record(phase, 'UPDATE_ACKNOWLEDGED')
        return next
      },
    }
    const result = await disableStagingProviderSupabaseOnly({ port, journal: stagedJournal })
    const terminal = result.status === 'NORMALIZED_VERIFIED' ? 'VERIFIED'
      : result.status === 'STOPPED_BEFORE_UPDATE' ? 'STOPPED_BEFORE_UPDATE' : 'RECONCILIATION_REQUIRED'
    phase = phaseJournal.finish(phase, terminal)
    return result
  } catch {
    if (phase?.outcome === null) {
      try { phase = phaseJournal.finish(phase, 'RECONCILIATION_REQUIRED') } catch { /* Preserve the active receipt. */ }
    }
    if (phase) return fixed('RECONCILIATION_REQUIRED')
    try { return fixed(journal.read() || phaseJournal.read() ? 'RECONCILIATION_REQUIRED' : 'STOPPED_BEFORE_UPDATE') }
    catch { return fixed('RECONCILIATION_REQUIRED') }
  } finally {
    try { binding?.dispose() } catch { /* No later update may be attempted. */ }
    managementToken?.fill?.(0)
    projectSecret?.fill?.(0)
  }
}
