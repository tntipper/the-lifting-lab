#!/usr/bin/env node
/** Disabled, separate one-use retirement of the partially installed Gen22 staging logins. */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acceptSupervisorPipe } from './staging-provider-broker-recovery-process-control.mjs'
import { createStagingGeneration22IncidentJournal, INCIDENT_DEADLINE,
  INCIDENT_JOURNAL_PATH } from './staging-generation-22-incident-journal.mjs'
import { ACTIVE_WINDOW_EXPIRES_AT } from './staging-generation-22-credentials.mjs'
import { prepareStagingGeneration22RecoverySql,
  validateStagingGeneration22RecoveryReceipt } from './staging-generation-22-recovery.mjs'
import { postStagingGeneration22RecoverySql } from './staging-generation-22-recovery-query.mjs'
import { postStagingGeneration22ActiveCheck } from './staging-generation-22-active-query.mjs'
import { postStagingGeneration22RetiredCheck } from './staging-generation-22-retired-query.mjs'
import { validateStagingGeneration22ActiveCheck } from './staging-generation-22-active-check.mjs'
import { validateStagingGeneration22RetiredCheck } from './staging-generation-22-retired-check.mjs'
import { readStagingGeneration22Credential } from './staging-generation-22-keychain-reader.mjs'

export const STAGING_GENERATION_22_INCIDENT_RECOVERY_ENABLED = false
export const STAGING_GENERATION_22_INCIDENT_RECOVERY_CLI_ENABLED = false
const PROOF = 'TLL_STAGING_GEN22_INCIDENT_RETIREMENT_V1'
const ENTRY = fileURLToPath(import.meta.url)
const ROOT = resolve(import.meta.dirname, '..')
const MAX_OUTPUT_BYTES = 256
const MAX_RUN_MS = 150_000
const unavailable = () => { throw new Error('Generation 22 incident retirement unavailable') }

/** The child alone owns the Supabase credential and the fresh one-use journal. */
export async function runStagingGeneration22IncidentRecovery({ signal,
  readToken = readStagingGeneration22Credential,
  createJournal = createStagingGeneration22IncidentJournal,
  prepareRecovery = prepareStagingGeneration22RecoverySql,
  validateRecovery = validateStagingGeneration22RecoveryReceipt,
  postActive = postStagingGeneration22ActiveCheck,
  postRecovery = postStagingGeneration22RecoverySql,
  postRetired = postStagingGeneration22RetiredCheck,
  validateActive = validateStagingGeneration22ActiveCheck,
  validateRetired = validateStagingGeneration22RetiredCheck,
  deadline = INCIDENT_DEADLINE } = {}) {
  if (!STAGING_GENERATION_22_INCIDENT_RECOVERY_ENABLED || !signal || signal.aborted
    || typeof signal.addEventListener !== 'function') unavailable()
  const end = Date.parse(deadline)
  const started = Date.now()
  if (!Number.isFinite(end) || end <= started || end - started > 3_600_000) unavailable()
  let token, journal, record
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, Math.min(120_000, end - started))
  const beforeStep = () => { if (controller.signal.aborted || Date.now() >= end) unavailable() }
  try {
    token = await readToken({ selector: 'supabase', signal: controller.signal,
      stopWorkerGroup: () => process.kill(-process.pid, 'SIGKILL') })
    if (!Buffer.isBuffer(token) || !/^sbp_(?:oauth_|v0_)?[a-f0-9]{40}$/.test(token.toString('utf8'))
      || controller.signal.aborted) unavailable()
    journal = createJournal({ path: INCIDENT_JOURNAL_PATH })
    record = journal.claim()
    beforeStep()
    const activeRows = await postActive(ACTIVE_WINDOW_EXPIRES_AT,
      { token, signal: controller.signal })
    validateActive(activeRows, { expiresAt: ACTIVE_WINDOW_EXPIRES_AT })
    beforeStep()
    const packet = prepareRecovery({ expiresAt: ACTIVE_WINDOW_EXPIRES_AT })
    record = journal.dispatch(record)
    const recoveryRows = await postRecovery(packet, { token, signal: controller.signal })
    beforeStep()
    const receipt = validateRecovery(recoveryRows, { expiresAt: ACTIVE_WINDOW_EXPIRES_AT })
    record = journal.confirm(record, receipt.receiptSha256)
    try {
      beforeStep()
      const retiredRows = await postRetired(ACTIVE_WINDOW_EXPIRES_AT,
        { token, signal: controller.signal })
      validateRetired(retiredRows, { expiresAt: ACTIVE_WINDOW_EXPIRES_AT })
      beforeStep()
      return 'RECOVERY_VERIFIED'
    } catch { return 'RETIREMENT_UNVERIFIED' }
  } catch {
    try {
      if (record && ['CLAIMED', 'DISPATCHED'].includes(record.state)) {
        journal.hold(record)
        return 'HOLD_RECONCILE'
      }
    } catch {}
    return 'JOURNAL_UNCERTAIN'
  } finally {
    controller.abort(); clearTimeout(timer)
    signal.removeEventListener('abort', abort)
    token?.fill(0)
  }
}

/** A credential-free parent limits the whole child process, including Keychain prompts. */
export async function superviseStagingGeneration22IncidentRecovery({ spawnProcess = spawn,
  killGroup = (pid, signal) => process.kill(-pid, signal),
  timeoutMs = MAX_RUN_MS } = {}) {
  if (!STAGING_GENERATION_22_INCIDENT_RECOVERY_ENABLED
    || typeof spawnProcess !== 'function' || typeof killGroup !== 'function'
    || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_RUN_MS) unavailable()
  let child
  try {
    child = spawnProcess(process.execPath, [ENTRY, '--child'], {
      cwd: ROOT, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, detached: true,
      stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    })
    if (!Number.isSafeInteger(child?.pid) || child.pid < 2 || !child?.stdio?.[3]
      || typeof child?.stdout?.on !== 'function' || typeof child?.stderr?.on !== 'function') unavailable()
  } catch {
    try { if (Number.isSafeInteger(child?.pid) && child.pid > 1) killGroup(child.pid, 'SIGKILL') } catch {}
    return 'RECONCILIATION_REQUIRED'
  }
  return new Promise(resolveResult => {
    let stopped = false, closed = false, unsafe = false, bytes = 0, groupStopped = false
    const output = []
    let grace
    const kill = signal => {
      if (groupStopped) return
      try { killGroup(child.pid, signal); if (signal === 'SIGKILL') groupStopped = true }
      catch (error) { if (error?.code === 'ESRCH') groupStopped = true; else unsafe = true }
    }
    const finish = result => {
      if (closed) return
      closed = true; clearTimeout(timer); clearTimeout(grace)
      process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal)
      child.stdout.removeAllListeners('data'); child.stderr.removeAllListeners('data')
      child.stdio[3].destroy(); child.stdout.destroy?.(); child.stderr.destroy?.()
      child.unref?.()
      for (const item of output) item.fill(0)
      output.length = 0
      resolveResult(result)
    }
    const stop = () => {
      if (stopped || closed) return
      stopped = true
      kill('SIGTERM')
      grace = setTimeout(() => { kill('SIGKILL'); finish('RECONCILIATION_REQUIRED') }, 2_000)
    }
    const timer = setTimeout(stop, timeoutMs)
    const onSignal = () => { unsafe = true; stop() }
    process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal)
    child.stdio[3].on('error', () => { unsafe = true; stop() })
    child.stdout.on('data', chunk => {
      if (!Buffer.isBuffer(chunk) || bytes + chunk.length > MAX_OUTPUT_BYTES) {
        chunk?.fill?.(0); unsafe = true; stop(); return
      }
      bytes += chunk.length; output.push(Buffer.from(chunk)); chunk.fill(0)
    })
    child.stderr.on('data', chunk => { chunk?.fill?.(0); unsafe = true; stop() })
    child.once('error', () => { unsafe = true; stop() })
    child.once('exit', () => kill('SIGKILL'))
    child.once('close', code => {
      if (closed) return
      kill('SIGKILL')
      const data = Buffer.concat(output, bytes)
      const status = data.toString('utf8').trim()
      data.fill(0)
      finish(!stopped && !unsafe && code === 0 && status === 'RECOVERY_VERIFIED'
        ? 'RECOVERY_VERIFIED' : 'RECONCILIATION_REQUIRED')
    })
    try { child.stdio[3].write(PROOF) } catch { unsafe = true; stop() }
  })
}

if (process.argv[1] && resolve(process.argv[1]) === ENTRY) {
  if (!STAGING_GENERATION_22_INCIDENT_RECOVERY_CLI_ENABLED
    || (process.argv.length !== 2 && !(process.argv.length === 3 && process.argv[2] === '--child'))) {
    process.exitCode = 1
  } else if (process.argv.length === 2) {
    const result = await superviseStagingGeneration22IncidentRecovery()
    process.stdout.write(`${result}\n`)
    process.exitCode = result === 'RECOVERY_VERIFIED' ? 0 : 1
  } else {
    let release
    const controller = new AbortController()
    const abort = () => controller.abort()
    process.once('SIGTERM', abort); process.once('SIGINT', abort)
    try {
      release = await acceptSupervisorPipe({ proof: PROOF })
      const result = await runStagingGeneration22IncidentRecovery({ signal: controller.signal })
      if (result === 'RECOVERY_VERIFIED') process.stdout.write(`${result}\n`)
      process.exitCode = result === 'RECOVERY_VERIFIED' ? 0 : 1
    } catch { process.exitCode = 1 }
    finally {
      try { release?.() } catch {}
      process.removeListener('SIGTERM', abort); process.removeListener('SIGINT', abort)
    }
  }
}
