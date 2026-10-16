#!/usr/bin/env node
/** Disabled entry point for a future one-use, read-only staging recovery check. */
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { acceptSupervisorPipe, runBoundedDetachedWorker,
  terminateProcessGroup } from './staging-provider-broker-recovery-process-control.mjs'

export const BROKER_RECOVERY_READ_LIVE_ENABLED = false
export const BROKER_RECOVERY_READ_HELPER_PATH = resolve(import.meta.dirname, 'staging-provider-broker-recovery-read-keychain.py')
const disabled = () => Object.freeze({ status: 'BROKER_RECOVERY_READ_LIVE_DISABLED' })
const unavailable = () => { throw Error('Staging broker recovery read launcher unavailable') }

async function checkedCredential(selector, signal) {
  const { spawn } = await import('node:child_process')
  if (!['supabase', 'vercel', 'vercel-bypass'].includes(selector) || signal.aborted) unavailable()
  return new Promise((resolveCredential, rejectCredential) => {
    const child = spawn('/usr/bin/python3', ['-I', '-S', BROKER_RECOVERY_READ_HELPER_PATH, selector], {
      cwd: resolve(import.meta.dirname, '..'), env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    let settled = false, size = 0
    const chunks = []
    const wipe = () => { for (const chunk of chunks) chunk.fill(0); chunks.length = 0 }
    // This function only runs inside the supervised worker process group.
    // Killing that entire group also terminates Python's /usr/bin/security
    // child, so a timed-out Keychain read cannot remain active after abort.
    const stopGroup = () => {
      try { terminateProcessGroup(process.pid) }
      catch { try { child.kill('SIGKILL') } catch {}; process.exitCode = 1 }
    }
    const finish = (success) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      child.stdout?.removeAllListeners('data')
      child.stdout?.destroy()
      const value = success && size >= 8 && size <= 4096 ? Buffer.concat(chunks, size) : null
      wipe()
      if (value && !value.includes(0) && /^[\x21-\x7e]+$/.test(value.toString('utf8'))) resolveCredential(value)
      else { value?.fill(0); rejectCredential(Error('Staging broker recovery credential unavailable')) }
    }
    const abort = () => { stopGroup(); finish(false) }
    const timeout = setTimeout(abort, 15_000)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) { abort(); return }
    child.stdout?.on('data', chunk => {
      if (settled) { chunk.fill(0); return }
      size += chunk.length
      if (size > 4096) { chunk.fill(0); abort(); return }
      chunks.push(chunk)
    })
    child.once('error', () => { stopGroup(); finish(false) })
    child.once('close', code => finish(code === 0 && !signal.aborted))
  })
}

/** The false gate precedes manifest, Keychain and all network access. */
async function runBrokerRecoveryReadLiveOnce() {
  if (BROKER_RECOVERY_READ_LIVE_ENABLED !== true) return disabled()
  if (process.platform !== 'darwin' || typeof globalThis.fetch !== 'function') unavailable()
  const { execFileSync } = await import('node:child_process')
  const { readFileSync } = await import('node:fs')
  const source = readFileSync(BROKER_RECOVERY_READ_HELPER_PATH, 'utf8')
  if (!/^APPROVED_BROKER_RECOVERY_READ = True$/m.test(source)) unavailable()
  execFileSync(process.execPath, [resolve(import.meta.dirname, 'staging-account-activation-manifest.mjs'), '--check'], {
    cwd: resolve(import.meta.dirname, '..'), env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
    stdio: 'ignore', timeout: 5_000,
  })
  const [{ createBrokerPhaseJournal }, { createProviderBrokerRotationJournal },
    { createBrokerRecoveryReadJournal }, { createBrokerRecoveryReadSession },
    { createBrokerRecoveryReadBindings }] = await Promise.all([
    import('./staging-provider-broker-phase-journal.mjs'),
    import('./staging-provider-broker-rotation.mjs'),
    import('./staging-provider-broker-recovery-read-journal.mjs'),
    import('./staging-provider-broker-recovery-read-session.mjs'),
    import('./staging-provider-broker-recovery-read-bindings.mjs'),
  ])
  const phase = createBrokerPhaseJournal(), rotation = createProviderBrokerRotationJournal()
  return createBrokerRecoveryReadSession({
    readPhase: () => phase.read(), readRotation: () => rotation.read(),
    journal: createBrokerRecoveryReadJournal(),
    acquireBindings: async ({ signal }) => {
      let managementToken, vercelToken, protectionBypassToken
      try {
        managementToken = await checkedCredential('supabase', signal)
        vercelToken = await checkedCredential('vercel', signal)
        protectionBypassToken = await checkedCredential('vercel-bypass', signal)
        if (signal.aborted) unavailable()
        return createBrokerRecoveryReadBindings({ fetch: globalThis.fetch,
          managementToken, vercelToken, protectionBypassToken })
      } finally {
        managementToken?.fill(0); vercelToken?.fill(0); protectionBypassToken?.fill(0)
      }
    },
  }).run()
}

const WORKER_PROOF = 'TLL_BROKER_RECOVERY_READ_SUPERVISOR_V1'
const MAX_WORKER_MS = 70_000
async function superviseOnce() {
  const result = await runBoundedDetachedWorker({ executable: process.execPath,
    args: [fileURLToPath(import.meta.url), '--worker'], cwd: resolve(import.meta.dirname, '..'),
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, proof: WORKER_PROOF,
    deadlineMs: MAX_WORKER_MS })
  let status = 'RECONCILIATION_REQUIRED'
  try {
    const parsed = result.status === 'EXITED' && result.code === 0 && result.output
      ? JSON.parse(result.output.toString('utf8')) : null
    if (parsed && Object.keys(parsed).length === 1 && typeof parsed.status === 'string'
      && ['SAFE_HELD_CONFIGURATION_OBSERVED', 'CONFIGURATION_CONSISTENT_SECRET_UNPROVEN',
        'RECONCILIATION_REQUIRED', 'READ_UNAVAILABLE', 'PREVIEW_IDENTITY_CHANGED'].includes(parsed.status)) status = parsed.status
  } catch { /* A partial or unexpected worker reply is uncertain. */ }
  finally { result.output?.fill(0) }
  return Object.freeze({ status })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (BROKER_RECOVERY_READ_LIVE_ENABLED !== true) process.stdout.write(`${JSON.stringify(disabled())}\n`)
    else if (process.argv.length === 2) process.stdout.write(`${JSON.stringify(await superviseOnce())}\n`)
    else if (process.argv.length === 3 && process.argv[2] === '--worker') {
      const releaseSupervisorPipe = await acceptSupervisorPipe({ proof: WORKER_PROOF })
      let result
      try { result = await runBrokerRecoveryReadLiveOnce() }
      finally { releaseSupervisorPipe() }
      process.stdout.write(`${JSON.stringify(result)}\n`)
    } else unavailable()
  } catch { process.stdout.write(`${JSON.stringify({ status: 'RECONCILIATION_REQUIRED' })}\n`); process.exitCode = 1 }
}
