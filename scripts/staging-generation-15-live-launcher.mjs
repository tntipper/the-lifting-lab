#!/usr/bin/env node
/**
 * Dedicated Generation 15 live launcher.
 *
 * This is the only module allowed to invoke Gen 15 native live work.
 * Ordinary tests must not import or call it. All native/Keychain gates remain
 * false in this package; an arming diff is a separate reviewed change.
 *
 * Dynamic imports of credential-bearing modules are intentional and gated:
 * they must not load unless every native gate is armed.
 *
 * Baked-in learnings (runtime, not comments-only):
 * - Gen 11/12 short-shell/`nohup` interrupt → long-session contract
 * - Gen 9 omitted CA → `readPinnedSupabaseCa()` into verifier
 * - Gen 13 SCRAM raw≠projected → transport derives from projection.passwords
 * - Gen 13 lost connectionFailure on stdout/summary → evidence helpers
 *
 * --- Gen 11 + Gen 12 interrupted-live ops contract (runtime-enforced) ---
 * Gen 11 and Gen 12 both died mid-VERCEL_STAGE after short-lived nohup/detached
 * remote shells. Comments alone did not prevent the Gen 12 repeat. When gates
 * are armed, this launcher REFUSES native work / journal claim unless:
 *   - TLL_LIVE_LONG_SESSION=1
 *   - TLL_LIVE_KEEPALIVE_PATH points to a keepalive JSON held by the parent
 *     `scripts/staging-generation-15-run-live-once.mjs` for the whole run
 *   - process is not an obvious orphan (ppid<=1) / nohup child
 * When gates are disabled, returns NATIVE_TRANSPORT_DISABLED without requiring
 * the long-session contract (ordinary tests must pass).
 *
 * A later approved live attempt MUST:
 * 1. Start via `scripts/staging-generation-15-run-live-once.mjs` in a long-lived process
 *    foreground Shell (block_until ~45–55 minutes). Do not use short-lived
 *    remote-shell / nohup sessions — that is the Gen 11/12 root cause.
 * 2. Observe progress only via a SEPARATE read-only journal observer
 *    (`assessStagingWindowProgress` / journal-watch `--follow`).
 * 3. Never kill or reconcile while status is `ACTIVE_WITHIN_PHASE_BOUND`.
 * 4. Stop after one attempt; reconcile; disarm; never run `npm test` while armed.
 * 5. Never replay Generation 11/12 (`INTENT_RECORDED`) or Generation 13
 *    (`RECONCILIATION_REQUIRED` / no-replay) or this window once consumed.
 */
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import {
  GENERATION,
  PACKAGE_ID,
  PROJECT_REF,
  WINDOW_ID,
} from './staging-generation-15-credentials.mjs'
import {
  executeGeneration15CredentialWindow,
  NATIVE_GENERATION_15_TRANSPORT_ENABLED,
} from './staging-generation-15-transport.mjs'
import { NATIVE_GENERATION_15_DATABASE_TRANSPORT_ENABLED } from './staging-generation-15-database-transport.mjs'
import { createStagingWindowPhaseJournal } from './staging-window-phase-journal.mjs'
import { assertLongSessionContract } from './staging-generation-15-long-session-contract.mjs'
import {
  persistConnectionFailureEvidence,
  secretFreeLauncherTerminal,
} from './staging-generation-15-connection-failure-evidence.mjs'

export {
  assertLongSessionContract,
  KEEPALIVE_PATH_ENV,
  KEEPALIVE_SCHEMA,
  LONG_SESSION_ENV,
} from './staging-generation-15-long-session-contract.mjs'

export const DEFAULT_PHASE_JOURNAL_PATH = fileURLToPath(
  new URL('../../implementation-state/staging/tll-generation-15-window-phase.json', import.meta.url),
)

export {
  DEFAULT_CONNECTION_FAILURE_EVIDENCE_PATH,
  persistConnectionFailureEvidence,
  projectSecretFreeConnectionFailure,
  secretFreeLauncherTerminal,
} from './staging-generation-15-connection-failure-evidence.mjs'

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
  return NATIVE_GENERATION_15_TRANSPORT_ENABLED === true
    && NATIVE_GENERATION_15_DATABASE_TRANSPORT_ENABLED === true
}

/** Fail-closed native entry. Returns disabled status unless every gate is armed. */
export async function runNativeGeneration15CredentialWindow({
  phaseJournalPath = DEFAULT_PHASE_JOURNAL_PATH,
  phaseJournal = createStagingWindowPhaseJournal({ path: phaseJournalPath }),
  env = process.env,
  ppid = process.ppid,
  assertLongSession = assertLongSessionContract,
} = {}) {
  // Disabled path must not require the long-session contract (ordinary tests).
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

  // Armed path: refuse before any journal claim / native work if contract missing.
  assertLongSession({ env, ppid })

  let receipt = phaseJournal.start(identity)
  const onPhase = async phase => { receipt = phaseJournal.record(receipt, phase) }

  try {
    // Credential-bearing modules load only after gates are confirmed armed.
    const [
      { stageVercelSecrets, stageSupabaseSecrets, readbackProviderNames, removeVercelSecrets, removeSupabaseSecrets },
      {
        readSupabaseTokenFromKeychain,
        dispatchGeneration15Database,
        recoverGeneration15Database,
        verifyGeneration15EntryBaseline,
        verifyGeneration15ZeroSessions,
      },
      { verifyGeneration6Connections, connectionFailureReport },
      { createStagingPostgresRuntime },
      { readPinnedSupabaseCa },
    ] = await Promise.all([
      import('./staging-generation-6-provider-transport.mjs'),
      import('./staging-generation-15-database-transport.mjs'),
      import('./staging-generation-6-connection-verifier.mjs'),
      import('../lib/server/staging-postgres.ts'),
      import('./staging-supabase-ca.mjs'),
    ])

    const token = readSupabaseTokenFromKeychain()
    const tlsCa = readPinnedSupabaseCa()
    const result = await executeGeneration15CredentialWindow({
      onPhase,
      ports: {
        preflightDatabase: () => verifyGeneration15EntryBaseline({ token }),
        stageVercel: stageVercelSecrets,
        stageSupabase: stageSupabaseSecrets,
        readbackNames: readbackProviderNames,
        dispatchDatabase: sql => dispatchGeneration15Database(sql, { token }),
        verifyConnections: async input => {
          try {
            await verifyGeneration6Connections({ ...input, tlsCa, createRuntime: createStagingPostgresRuntime })
          } catch (error) {
            const projected = Error('Generation-15 connection verification unavailable')
            projected.connectionFailure = connectionFailureReport(error)
            throw projected
          }
          await verifyGeneration15ZeroSessions({ token })
        },
        recoverDatabase: () => recoverGeneration15Database({ token }),
        removeVercel: removeVercelSecrets,
        removeSupabase: removeSupabaseSecrets,
      },
    })
    phaseJournal.finish(receipt, mapTerminalOutcome(result))
    try { persistConnectionFailureEvidence(result) } catch { /* never mask terminal outcome */ }
    return result
  } catch (error) {
    try { phaseJournal.finish(receipt, 'RECOVERY_REQUIRED') } catch { /* preserve original failure */ }
    throw error
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runNativeGeneration15CredentialWindow()
    process.stdout.write(`${JSON.stringify(secretFreeLauncherTerminal(result))}\n`)
    if (result.status === 'NATIVE_TRANSPORT_DISABLED') process.exitCode = 0
    else if (result.status !== 'CREDENTIALS_VERIFIED_CONTROLS_DISABLED') process.exitCode = 1
  } catch (error) {
    if (error?.code === 'LONG_SESSION_CONTRACT_REJECTED') {
      process.stderr.write(`${error.message}\n`)
      process.exitCode = 2
    } else {
      throw error
    }
  }
}
