/** Disabled, secret-free parent boundary for a future one-use Gen22 worker. */
import { ACTIVE_WINDOW_EXPIRES_AT, WINDOW_ID } from './staging-generation-22-credentials.mjs'
import { RECOVERY_WINDOW_EXPIRES_AT } from './staging-generation-22-recovery-journal.mjs'
import { GENERATION, PROJECT_REF } from './staging-generation-22-material.mjs'

export const STAGING_GENERATION_22_PROCESS_SUPERVISOR_ENABLED = false
export const WORKER_TERMINAL_SCHEMA = 'tll-staging-generation-22-worker-terminal/v1'
const MAX_OUTPUT_BYTES = 1_024
const unavailable = () => { throw new Error('Generation 22 process supervisor unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

function validTerminal(value) {
  return exact(value, ['schema', 'status', 'projectRef', 'generation', 'windowId',
    'setupStatus', 'recoveryStatus'])
    && value.schema === WORKER_TERMINAL_SCHEMA && value.status === 'DRAINED'
    && value.projectRef === PROJECT_REF && value.generation === GENERATION
    && value.windowId === WINDOW_ID
    && value.setupStatus === 'SETTINGS_AND_CONNECTIONS_VERIFIED'
    && value.recoveryStatus === 'RECOVERY_VERIFIED'
}

/** spawnWorker must use a separately reviewed fixed detached worker binding. */
export function createStagingGeneration22ProcessSupervisor({ spawnWorker,
  killGroup = (pid, signal) => process.kill(-pid, signal), now = Date.now,
  monotonicNow = globalThis.performance.now.bind(globalThis.performance),
  timeoutMs = 900_000, termGraceMs = 2_000 } = {}) {
  if (!STAGING_GENERATION_22_PROCESS_SUPERVISOR_ENABLED
    || typeof spawnWorker !== 'function' || typeof killGroup !== 'function'
    || typeof now !== 'function' || typeof monotonicNow !== 'function'
    || !Number.isInteger(timeoutMs)
    || timeoutMs < 1 || timeoutMs > 900_000 || !Number.isInteger(termGraceMs)
    || termGraceMs < 1 || termGraceMs > 2_000) unavailable()
  let used = false
  return Object.freeze({
    async supervise({ signal } = {}) {
      if (used || !signal || signal.aborted || typeof signal.addEventListener !== 'function') unavailable()
      used = true
      const startedAt = now(), startedMono = monotonicNow()
      const activeDeadline = Date.parse(ACTIVE_WINDOW_EXPIRES_AT)
      const recoveryDeadline = Date.parse(RECOVERY_WINDOW_EXPIRES_AT)
      if (!Number.isFinite(startedAt) || !Number.isFinite(startedMono)
        || !Number.isFinite(activeDeadline)
        || !Number.isFinite(recoveryDeadline) || startedAt >= activeDeadline
        || recoveryDeadline <= activeDeadline || recoveryDeadline > activeDeadline + 3_600_000) unavailable()
      const duration = Math.min(timeoutMs, recoveryDeadline - startedAt)
      const child = spawnWorker()
      if (!child || !Number.isSafeInteger(child.pid) || child.pid <= 1
        || typeof child.once !== 'function' || typeof child.stdout?.on !== 'function'
        || typeof child.stderr?.on !== 'function') unavailable()
      return new Promise(resolve => {
        let closed = false, terminated = false, outputUnsafe = false, outputBytes = 0
        let groupStopped = false
        let deadlineTimer, killTimer
        const output = []
        const requestStop = () => {
          if (closed || terminated) return
          terminated = true
          try { killGroup(child.pid, 'SIGTERM') } catch {}
          killTimer = setTimeout(() => {
            if (!closed) { try { killGroup(child.pid, 'SIGKILL') } catch {} }
          }, termGraceMs)
        }
        const onOutput = chunk => {
          if (!Buffer.isBuffer(chunk) || outputUnsafe || outputBytes + chunk.length > MAX_OUTPUT_BYTES) {
            outputUnsafe = true
            if (Buffer.isBuffer(chunk)) chunk.fill(0)
            requestStop(); return
          }
          outputBytes += chunk.length
          output.push(Buffer.from(chunk))
          chunk.fill(0)
        }
        const onErrorOutput = chunk => {
          outputUnsafe = true
          if (Buffer.isBuffer(chunk)) chunk.fill(0)
          requestStop()
        }
        const onError = () => { outputUnsafe = true; requestStop() }
        const stopRemainingGroup = () => {
          if (groupStopped) return
          try { killGroup(child.pid, 'SIGKILL'); groupStopped = true }
          catch (error) {
            if (error?.code === 'ESRCH') groupStopped = true
            else outputUnsafe = true
          }
        }
        // A descendant without an inherited pipe can survive leader exit and
        // otherwise be invisible to the child's close event.
        const onExit = () => stopRemainingGroup()
        const onClose = (code, exitSignal) => {
          if (closed) return
          stopRemainingGroup()
          const finishedAt = now(), finishedMono = monotonicNow()
          const withinTime = Number.isFinite(finishedAt) && finishedAt >= startedAt
            && finishedAt < recoveryDeadline && Number.isFinite(finishedMono)
            && finishedMono >= startedMono && finishedMono - startedMono < duration
          if (!withinTime) terminated = true
          closed = true
          clearTimeout(deadlineTimer); clearTimeout(killTimer)
          signal.removeEventListener('abort', requestStop)
          let accepted = false
          const bytes = Buffer.concat(output, outputBytes)
          try {
            if (!terminated && !outputUnsafe && code === 0 && exitSignal == null
              && withinTime) {
              const raw = bytes.toString('utf8').trim()
              const terminal = JSON.parse(raw)
              accepted = validTerminal(terminal) && raw === JSON.stringify(terminal)
            }
          } catch {}
          finally { bytes.fill(0); for (const item of output) item.fill(0) }
          resolve(Object.freeze({ status: accepted ? 'VERIFIED_CONTROLS_DISABLED'
            : 'CHILD_EXIT_RECONCILIATION_REQUIRED', projectRef: PROJECT_REF,
          generation: GENERATION }))
        }
        child.stdout.on('data', onOutput)
        child.stderr.on('data', onErrorOutput)
        child.once('error', onError)
        child.once('exit', onExit)
        child.once('close', onClose)
        signal.addEventListener('abort', requestStop, { once: true })
        if (signal.aborted) requestStop()
        if (!closed) deadlineTimer = setTimeout(requestStop, Math.max(1, duration))
      })
    },
  })
}
