/** Fixed, disabled construction for Gen23's database/provider route. */
import https from 'node:https'
import { createStagingGeneration23DatabaseJournal } from './staging-generation-23-database-journal.mjs'
import { createStagingGeneration23DatabaseHost } from './staging-generation-23-database-host.mjs'
import { createStagingGeneration23ControlEnableHost } from './staging-generation-23-control-enable-host.mjs'
import { createStagingGeneration23RestrictedConnections } from './staging-generation-23-restricted-connections.mjs'
import { createStagingGeneration23ConnectionDiagnostic } from './staging-generation-23-connection-diagnostic.mjs'
import { createStagingGeneration23ProviderJournal, runStagingGeneration23ProviderControl } from './staging-generation-23-provider-control.mjs'
import { createStagingGeneration23ProviderPort } from './staging-generation-23-provider-port.mjs'
import { createStagingAccountHostedBaselineSupabaseBinding } from './staging-account-hosted-baseline-supabase.mjs'
import { createStagingControlActivationNativeAdapter } from './staging-database-native-adapter.mjs'
import { postStagingGeneration23DatabaseSql } from './staging-generation-23-supabase-query.mjs'
import { prepareStagingGeneration23BackendStateSql, validateStagingGeneration23BackendState } from './staging-generation-23-backend-state.mjs'
import { createStagingGeneration23FinalObserver } from './staging-generation-23-final-observer.mjs'
import { createStagingGeneration23FinalJournal } from './staging-generation-23-final-journal.mjs'
import { postStagingGeneration23FinalCheck } from './staging-generation-23-final-query.mjs'
import { validateStagingGeneration23FinalCheck } from './staging-generation-23-final-check.mjs'
import { readPinnedSupabaseCa } from './staging-supabase-ca.mjs'

export const STAGING_GENERATION_23_FIXED_DATABASE_PROVIDER_COMPONENTS_ENABLED = false
const unavailable = () => { throw Error('Generation 23 fixed database/provider components unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const token = value => Buffer.isBuffer(value) && value.length >= 16 && value.length <= 512
  && /^sbp_(?:oauth_|v0_)?[a-f0-9]{40}$/.test(value.toString('utf8'))
const signalOk = signal => signal && !signal.aborted && typeof signal.addEventListener === 'function'

/**
 * All defaults are the fixed, guarded modules. `factories` exists solely for
 * local tests; it cannot supply a different project, endpoint or SQL package.
 */
export function createStagingGeneration23FixedDatabaseProviderComponents({ credentials, sourceCommit,
  fetch: fetcher, factories = {}, request = https.request } = {}) {
  if (!STAGING_GENERATION_23_FIXED_DATABASE_PROVIDER_COMPONENTS_ENABLED
    || !exact(credentials, ['managementToken', 'vercelToken', 'previewBypass'])
    || typeof sourceCommit !== 'string' || !/^[a-f0-9]{40}$/.test(sourceCommit)
    || !token(credentials.managementToken) || typeof fetcher !== 'function' || typeof request !== 'function'
    || !factories || typeof factories !== 'object' || Array.isArray(factories)) unavailable()
  const make = (name, fallback) => factories[name] ?? fallback
  const makeJournal = make('createDatabaseJournal', createStagingGeneration23DatabaseJournal)
  const makeDatabaseHost = make('createDatabaseHost', createStagingGeneration23DatabaseHost)
  const makeControlHost = make('createControlHost', createStagingGeneration23ControlEnableHost)
  const makeRestricted = make('createRestricted', createStagingGeneration23RestrictedConnections)
  const makeProviderJournal = make('createProviderJournal', createStagingGeneration23ProviderJournal)
  const runProvider = make('runProvider', runStagingGeneration23ProviderControl)
  const makeProviderPort = make('createProviderPort', createStagingGeneration23ProviderPort)
  const makeSupabase = make('createSupabase', createStagingAccountHostedBaselineSupabaseBinding)
  const makeActivation = make('createActivation', createStagingControlActivationNativeAdapter)
  const postDatabase = make('postDatabase', postStagingGeneration23DatabaseSql)
  const makeFinalJournal = make('createFinalJournal', createStagingGeneration23FinalJournal)
  const makeFinal = make('createFinal', createStagingGeneration23FinalObserver)
  const postFinal = make('postFinal', postStagingGeneration23FinalCheck)
  const validateFinal = make('validateFinal', validateStagingGeneration23FinalCheck)
  const readCa = make('readCa', readPinnedSupabaseCa)
  if ([makeJournal, makeDatabaseHost, makeControlHost, makeRestricted, makeProviderJournal, runProvider,
    makeProviderPort, makeSupabase, makeActivation, postDatabase, makeFinalJournal, makeFinal,
    postFinal, validateFinal, readCa].some(item => typeof item !== 'function')) unavailable()
  const managementToken = Buffer.from(credentials.managementToken)
  let disposed = false
  const requireLive = signal => { if (disposed || !signalOk(signal)) unavailable() }
  const post = (packet, { action, signal }) => postDatabase(packet, { action, token: managementToken, signal })
  const backendState = async ({ expiresAt, signal }) => {
    requireLive(signal)
    const packet = prepareStagingGeneration23BackendStateSql({ expiresAt })
    const rows = await post(packet, { action: 'READ_STATE', signal })
    const state = validateStagingGeneration23BackendState(rows, { expiresAt })
    return Object.freeze({ projectRef: state.projectRef, controlsEnabled: state.controlsEnabled,
      runtimeSessions: state.runtimeSessions })
  }
  const withProvider = async ({ action, expiresAt, signal }) => {
    requireLive(signal)
    const binding = makeSupabase({ fetch: fetcher, managementToken })
    let projectSecret, port
    try {
      if (!binding || typeof binding.readProjectSecret !== 'function' || typeof binding.dispose !== 'function') unavailable()
      projectSecret = await binding.readProjectSecret({ signal })
      port = makeProviderPort({ projectSecret, fetcher,
        readBackendState: async (_target, { signal: child }) => backendState({ expiresAt, signal: child }) })
      const journal = makeProviderJournal({ action })
      return await runProvider({ action, port, journal, signal })
    } finally {
      try { port?.dispose?.() } catch {}
      projectSecret?.fill?.(0); binding?.dispose?.()
    }
  }
  return Object.freeze({
    components: Object.freeze({
      databaseSetup: { run: input => makeDatabaseHost({ action: 'SETUP', journal: makeJournal({ action: 'SETUP' }), post }).run(input) },
      controlsDisable: { run: input => makeDatabaseHost({ action: 'SHUTDOWN', journal: makeJournal({ action: 'SHUTDOWN' }), post }).run(input) },
      databaseRetire: { run: input => makeDatabaseHost({ action: 'RETIRE', journal: makeJournal({ action: 'RETIRE' }), post }).run(input) },
      restrictedConnections: { async prove(input) {
        requireLive(input?.signal)
        const runtimeModule = await import('../lib/server/staging-postgres.ts')
        const proof = makeRestricted({ createRuntime: runtimeModule.createStagingPostgresRuntime,
          classifyQueryError: runtimeModule.stagingPostgresSqlstate,
          diagnostic: createStagingGeneration23ConnectionDiagnostic({ sourceCommit }), readCa,
          verifyDrained: async ({ expiresAt, signal }) => {
            const state = await backendState({ expiresAt, signal })
            return { status: 'PASS_DRAINED', purposes: 5, projectRef: state.projectRef,
              controlsEnabled: state.controlsEnabled, runtimeSessions: state.runtimeSessions }
          } })
        return proof.prove(input)
      } },
      controlsEnable: { run: input => {
        const journal = makeJournal({ action: 'ACTIVATE' })
        const activation = makeActivation({ readToken: () => Buffer.from(managementToken), request })
        return makeControlHost({ journal, execute: async ({ context, signal }) => {
          requireLive(signal)
          return activation.activate({ context })
        } }).run(input)
      } },
      providerEnable: ({ signal, expiresAt }) => withProvider({ action: 'ENABLE', signal, expiresAt }),
      providerDisable: ({ signal, expiresAt }) => withProvider({ action: 'DISABLE', signal, expiresAt }),
      readRetiredState: async ({ signal } = {}) => {
        requireLive(signal)
        const journal = makeFinalJournal()
        const observer = makeFinal({ readToken: async () => Buffer.from(managementToken),
          post: ({ token, signal: child }) => postFinal({ token, signal: child }),
          validate: validateFinal, journal })
        return observer.observe({ signal })
      },
    }),
    dispose() { if (!disposed) { disposed = true; managementToken.fill(0) } },
  })
}
