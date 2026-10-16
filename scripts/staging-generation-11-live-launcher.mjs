#!/usr/bin/env node
/**
 * Dedicated Generation 11 live launcher.
 *
 * This is the only module allowed to invoke Gen 11 native live work.
 * Ordinary tests must not import or call it. All native/Keychain gates remain
 * false in this package; an arming diff is a separate reviewed change.
 *
 * Dynamic imports of credential-bearing modules are intentional and gated:
 * they must not load unless every native gate is armed.
 */
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import {
  GENERATION,
  PACKAGE_ID,
  PROJECT_REF,
  WINDOW_ID,
} from './staging-generation-11-credentials.mjs'
import {
  executeGeneration11CredentialWindow,
  NATIVE_GENERATION_11_TRANSPORT_ENABLED,
} from './staging-generation-11-transport.mjs'
import { NATIVE_GENERATION_11_DATABASE_TRANSPORT_ENABLED } from './staging-generation-11-database-transport.mjs'
import { createStagingWindowPhaseJournal } from './staging-window-phase-journal.mjs'

export const DEFAULT_PHASE_JOURNAL_PATH = fileURLToPath(
  new URL('../../implementation-state/staging/tll-generation-11-window-phase.json', import.meta.url),
)

const identity = Object.freeze({
  packageId: PACKAGE_ID,
  target: PROJECT_REF,
  generation: GENERATION,
  windowId: WINDOW_ID,
})

function mapTerminalOutcome(result) {
  switch (result?.status) {
    case 'CREDENTIALS_VERIFIED_CONTROLS_DISABLED':
      return 'SUCCESS'
    case 'RECOVERY_VERIFIED':
      return 'RECOVERY_VERIFIED'
    case 'RECOVERY_REQUIRED':
      return 'RECOVERY_REQUIRED'
    case 'STOPPED_BEFORE_DATABASE':
    case 'JOURNAL_CLAIM_REJECTED':
    case 'ENTRY_BASELINE_FAILED':
    case 'NATIVE_TRANSPORT_DISABLED':
      return 'STOPPED_BEFORE_DATABASE'
    default: {
      const _exhaustive = result?.status
      void _exhaustive
      return 'RECOVERY_REQUIRED'
    }
  }
}

function gatesArmed() {
  return NATIVE_GENERATION_11_TRANSPORT_ENABLED === true
    && NATIVE_GENERATION_11_DATABASE_TRANSPORT_ENABLED === true
}

/** Fail-closed native entry. Returns disabled status unless every gate is armed. */
export async function runNativeGeneration11CredentialWindow({
  phaseJournalPath = DEFAULT_PHASE_JOURNAL_PATH,
  phaseJournal = createStagingWindowPhaseJournal({ path: phaseJournalPath }),
} = {}) {
  if (!gatesArmed()) {
    return Object.freeze({
      status: 'NATIVE_TRANSPORT_DISABLED',
      target: PROJECT_REF,
      generation: GENERATION,
      windowId: WINDOW_ID,
      phaseJournalRequired: true,
      nativeTransportEnabled: false,
    })
  }

  let receipt = phaseJournal.start(identity)
  const onPhase = async phase => { receipt = phaseJournal.record(receipt, phase) }

  try {
    // Credential-bearing modules load only after gates are confirmed armed.
    const [
      { stageVercelSecrets, stageSupabaseSecrets, readbackProviderNames, removeVercelSecrets, removeSupabaseSecrets },
      {
        readSupabaseTokenFromKeychain,
        dispatchGeneration11Database,
        recoverGeneration11Database,
        verifyGeneration11EntryBaseline,
        verifyGeneration11ZeroSessions,
      },
      { verifyGeneration6Connections, connectionFailureReport },
      { createStagingPostgresRuntime },
      { readPinnedSupabaseCa },
    ] = await Promise.all([
      import('./staging-generation-6-provider-transport.mjs'),
      import('./staging-generation-11-database-transport.mjs'),
      import('./staging-generation-6-connection-verifier.mjs'),
      import('../lib/server/staging-postgres.ts'),
      import('./staging-supabase-ca.mjs'),
    ])

    const token = readSupabaseTokenFromKeychain()
    const tlsCa = readPinnedSupabaseCa()
    const result = await executeGeneration11CredentialWindow({
      onPhase,
      ports: {
        preflightDatabase: () => verifyGeneration11EntryBaseline({ token }),
        stageVercel: stageVercelSecrets,
        stageSupabase: stageSupabaseSecrets,
        readbackNames: readbackProviderNames,
        dispatchDatabase: sql => dispatchGeneration11Database(sql, { token }),
        verifyConnections: async input => {
          try {
            await verifyGeneration6Connections({ ...input, tlsCa, createRuntime: createStagingPostgresRuntime })
          } catch (error) {
            const projected = Error('Generation-11 connection verification unavailable')
            projected.connectionFailure = connectionFailureReport(error)
            throw projected
          }
          await verifyGeneration11ZeroSessions({ token })
        },
        recoverDatabase: () => recoverGeneration11Database({ token }),
        removeVercel: removeVercelSecrets,
        removeSupabase: removeSupabaseSecrets,
      },
    })
    phaseJournal.finish(receipt, mapTerminalOutcome(result))
    return result
  } catch (error) {
    try { phaseJournal.finish(receipt, 'RECOVERY_REQUIRED') } catch { /* preserve original failure */ }
    throw error
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runNativeGeneration11CredentialWindow()
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    target: result.target,
    generation: result.generation,
    windowId: result.windowId,
    phase: result.phase,
    nextAction: result.nextAction,
  })}\n`)
  if (result.status === 'NATIVE_TRANSPORT_DISABLED') process.exitCode = 0
  else if (result.status !== 'CREDENTIALS_VERIFIED_CONTROLS_DISABLED') process.exitCode = 1
}
