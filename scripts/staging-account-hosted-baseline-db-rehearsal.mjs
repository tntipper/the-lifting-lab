import { resolve } from 'node:path'
import { createStagingWindowPhaseJournal, createTrackedHostedBaselineFetch } from './staging-account-hosted-baseline-session.mjs'
import { createStagingAccountHostedBaselineSupabaseBinding } from './staging-account-hosted-baseline-supabase.mjs'

export const DB_REHEARSAL_JOURNAL_PATH = resolve(import.meta.dirname, '../../implementation-state/staging/tll-hosted-baseline-v2-db-rehearsal.json')
export const DB_REHEARSAL_DEADLINE_MS = 60_000
const TARGET = 'qdmvngjwkcsilzmqksme'
const fail = () => { throw Error('Staging database rehearsal unavailable') }

export async function runStagingDatabaseRehearsal ({ readCredential, fetch: fetcher, journal = createStagingWindowPhaseJournal({ path: DB_REHEARSAL_JOURNAL_PATH }),
  setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now } = {}) {
  if (typeof readCredential !== 'function' || typeof fetcher !== 'function' || typeof journal?.read !== 'function'
    || typeof journal.claim !== 'function' || typeof journal.finish !== 'function' || typeof setTimer !== 'function'
    || typeof clearTimer !== 'function' || typeof now !== 'function') fail()
  try { if (journal.read()) return Object.freeze({ status: 'JOURNAL_UNAVAILABLE', target: TARGET }) }
  catch { return Object.freeze({ status: 'JOURNAL_UNAVAILABLE', target: TARGET }) }
  let credential
  try {
    credential = await readCredential()
    if (!Buffer.isBuffer(credential) || credential.length < 8 || credential.length > 4096 || credential.includes(0)) fail()
  } catch {
    credential?.fill?.(0)
    return Object.freeze({ status: 'CREDENTIAL_UNAVAILABLE', target: TARGET })
  }
  let intent
  try { intent = journal.claim() } catch { credential.fill(0); return Object.freeze({ status: 'JOURNAL_UNAVAILABLE', target: TARGET }) }
  const controller = new AbortController()
  const timer = setTimer(() => controller.abort(), DB_REHEARSAL_DEADLINE_MS)
  const tracker = createTrackedHostedBaselineFetch({ fetch: fetcher })
  let binding; let outcome
  try {
    binding = createStagingAccountHostedBaselineSupabaseBinding({ fetch: tracker.fetch, managementToken: credential })
    const receipt = await binding.readDatabase({ signal: controller.signal })
    if (controller.signal.aborted || receipt.status !== 'PASS' || receipt.target !== TARGET) fail()
    outcome = Object.freeze({ state: 'OBSERVATION_RECORDED', status: 'PASS', reasonCodes: [], observationHash: receipt.receiptHash })
  } catch {
    outcome = Object.freeze({ state: 'OBSERVATION_FAILED', status: 'FAILED', reasonCodes: [controller.signal.aborted ? 'deadline_or_abort' : 'database_read_unavailable'], observationHash: null })
  } finally {
    clearTimer(timer)
    controller.abort()
    try { binding?.dispose(); await tracker.settle() }
    catch { outcome = null }
    credential.fill(0)
  }
  if (!outcome) return Object.freeze({ status: 'RECONCILIATION_REQUIRED', target: TARGET })
  const terminal = Object.freeze({ ...intent, state: outcome.state, updatedAt: new Date(now()).toISOString(), status: outcome.status,
    reasonCodes: outcome.reasonCodes, observationHash: outcome.observationHash })
  try { journal.finish(intent, terminal) } catch { return Object.freeze({ status: 'JOURNAL_UNAVAILABLE', target: TARGET }) }
  return Object.freeze({ status: outcome.status, target: TARGET, reasonCodes: outcome.reasonCodes, receiptHash: outcome.observationHash })
}
