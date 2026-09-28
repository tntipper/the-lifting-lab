/** Disabled, injected-only assembly of the fixed staging rotation ports. */
import { PROVIDER_IDENTIFIER, STAGING_PROJECT_REF, STAGING_PROVIDER_TARGET } from './staging-provider-broker-rotation.mjs'
import { createBrokerRecoveryReadBindings } from './staging-provider-broker-recovery-read-bindings.mjs'
import { createStagingAccountHostedBaselineSupabaseBinding } from './staging-account-hosted-baseline-supabase.mjs'
import { createStagingProviderBrokerRestReadiness } from './staging-provider-broker-rest-readiness.mjs'
import { createStagingProviderBrokerVercelRestHost } from './staging-provider-broker-vercel-rest-host.mjs'
import { createStagingProviderBrokerSupabaseRestHost } from './staging-provider-broker-supabase-rest-host.mjs'
import { createStagingProviderBrokerNativeAdapter } from './staging-provider-broker-native-adapter.mjs'
import { createOfficialStagingProviderClient } from './staging-provider-broker-native-binding.mjs'

export const STAGING_BROKER_REST_PORTS_ENABLED = false
const unavailable = () => { throw new Error('Staging broker REST ports unavailable') }
const TOKEN = /^[\x21-\x7e]{8,4096}$/

function freshPhase(phaseJournal, now) {
  if (!phaseJournal || typeof phaseJournal.read !== 'function' || typeof now !== 'function') unavailable()
  const phase = phaseJournal.read()
  if (!phase || phase.schema !== 'tll-staging-provider-broker-phase/v1'
    || phase.projectRef !== STAGING_PROJECT_REF || phase.providerIdentifier !== PROVIDER_IDENTIFIER
    || phase.phase !== 'LAUNCH_STARTED' || phase.outcome !== null || phase.sequence !== 0
    || !Array.isArray(phase.history) || phase.history.length !== 1 || phase.history[0].phase !== 'LAUNCH_STARTED') unavailable()
  const at = Date.parse(phase.history[0].at), current = now()
  if (!Number.isFinite(at) || !Number.isFinite(current) || current < at || current - at > 60_000) unavailable()
}

function validToken(value) {
  return Buffer.isBuffer(value) && TOKEN.test(value.toString('utf8')) && !value.includes(0)
}

/**
 * Call only from runPhasedBrokerRotation.acquirePorts after its durable phase
 * start. The caller transfers the three token buffers; this assembly wipes
 * them on either success or failure. All effects are injected and held off.
 */
export async function createStagingProviderBrokerRestPorts({ phaseJournal, managementToken, vercelToken,
  protectionBypassToken, fetch: fetcher, stopWorkerGroup, execute, now = Date.now,
  createReads = createBrokerRecoveryReadBindings,
  createRoleReader = createStagingAccountHostedBaselineSupabaseBinding,
  createVercel = createStagingProviderBrokerVercelRestHost,
  createSupabase = createStagingProviderBrokerSupabaseRestHost,
  createProviderClient = createOfficialStagingProviderClient } = {}) {
  let reads, roleReader, vercel, supabase, projectSecret
  let management, vercelAccess, bypass, readManagement, readVercel, readBypass, disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    try { vercel?.dispose() } finally {
      try { supabase?.dispose() } finally {
        try { reads?.dispose() } finally {
          try { roleReader?.dispose() } finally {
            projectSecret?.fill(0)
            management?.fill(0); vercelAccess?.fill(0); bypass?.fill(0)
            readManagement?.fill(0); readVercel?.fill(0); readBypass?.fill(0)
          }
        }
      }
    }
  }
  try {
    freshPhase(phaseJournal, now)
    if (!validToken(managementToken) || !validToken(vercelToken) || !validToken(protectionBypassToken)
      || typeof fetcher !== 'function' || typeof stopWorkerGroup !== 'function' || typeof execute !== 'function'
      || [createReads, createRoleReader, createVercel, createSupabase, createProviderClient]
        .some(factory => typeof factory !== 'function')) unavailable()
    management = Buffer.from(managementToken)
    vercelAccess = Buffer.from(vercelToken)
    bypass = Buffer.from(protectionBypassToken)
    readManagement = Buffer.from(management)
    readVercel = Buffer.from(vercelAccess)
    readBypass = Buffer.from(bypass)
    reads = createReads({ fetch: fetcher, managementToken: readManagement,
      vercelToken: readVercel, protectionBypassToken: readBypass })
    readManagement.fill(0); readVercel.fill(0); readBypass.fill(0)
    roleReader = createRoleReader({ fetch: fetcher, managementToken: management })
    vercel = createVercel({ fetch: fetcher, vercelToken: vercelAccess, stopWorkerGroup })
    supabase = createSupabase({ fetch: fetcher, managementToken: management, stopWorkerGroup })
    if (!reads || !roleReader || !vercel || !supabase
      || ['readPinnedPreview', 'readDatabase', 'readSupabaseNames', 'readVercelNames', 'readProvider', 'dispose']
        .some(name => typeof reads[name] !== 'function')
      || typeof roleReader.readProjectSecret !== 'function' || typeof roleReader.dispose !== 'function'
      || [vercel, supabase].some(host => ['stage', 'remove', 'readNames', 'dispose']
        .some(name => typeof host[name] !== 'function'))) unavailable()
    // Keep a reference before the executor's final deadline check. It may
    // reject after the read returns; that key still needs to be wiped.
    const credential = await execute(async signal => {
      projectSecret = await roleReader.readProjectSecret({ signal })
      return projectSecret
    })
    if (credential?.status !== 'COMPLETED' || credential.value !== projectSecret || !Buffer.isBuffer(projectSecret)
      || projectSecret.length < 8 || projectSecret.length > 24_576 || projectSecret.includes(0)) unavailable()
    const readFrozenState = createStagingProviderBrokerRestReadiness({ bindings: reads, now })
    const native = createStagingProviderBrokerNativeAdapter({ target: STAGING_PROVIDER_TARGET, projectSecret,
      createProviderClient: args => createProviderClient({ ...args, fetcher }),
      readFrozenState, vercel, supabase, execute })
    return Object.freeze({ ...native, dispose })
  } catch { try { dispose() } catch {}; unavailable() }
  finally {
    if (Buffer.isBuffer(managementToken)) managementToken.fill(0)
    if (Buffer.isBuffer(vercelToken)) vercelToken.fill(0)
    if (Buffer.isBuffer(protectionBypassToken)) protectionBypassToken.fill(0)
    management?.fill(0); vercelAccess?.fill(0); bypass?.fill(0)
    readManagement?.fill(0); readVercel?.fill(0); readBypass?.fill(0)
  }
}
