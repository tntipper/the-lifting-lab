/** Credential-free, disabled process supervisor for a future one-use staging rotation. */
import { spawn } from 'node:child_process'
import { isAbsolute } from 'node:path'
import { terminateProcessGroup } from './staging-provider-broker-recovery-process-control.mjs'

export const BROKER_ROTATION_PROCESS_CONTROL_ENABLED = false
export const BROKER_ROTATION_MAX_WORKER_MS = 1_800_000
const unavailable = () => { throw Error('Staging broker rotation process control unavailable') }

/**
 * The worker owns its own process group. The existing supervisor pipe watcher
 * inside the worker kills that group if this parent disappears unexpectedly.
 * A clean leader exit also kills any child that escaped its awaited command.
 */
export function runBoundedBrokerRotationWorker({ executable, args, cwd, env, proof,
  deadlineMs, maxOutputBytes = 1024, stopGraceMs = 2_000, spawnProcess = spawn } = {}) {
  if (!isAbsolute(executable) || !Array.isArray(args) || args.some(value => typeof value !== 'string')
    || !isAbsolute(cwd) || !env || typeof env !== 'object' || typeof proof !== 'string'
    || proof.length < 8 || proof.length > 128 || !Number.isSafeInteger(deadlineMs)
    || deadlineMs < 1 || deadlineMs > BROKER_ROTATION_MAX_WORKER_MS
    || !Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > 4096
    || !Number.isSafeInteger(stopGraceMs) || stopGraceMs < 1 || stopGraceMs > 5_000
    || typeof spawnProcess !== 'function') unavailable()
  return new Promise(resolveResult => {
    let child
    try {
      child = spawnProcess(executable, args, { cwd, env, detached: true,
        stdio: ['ignore', 'pipe', 'ignore', 'pipe'] })
    } catch { resolveResult(Object.freeze({ status: 'UNCERTAIN', code: null, output: null })); return }
    let settled = false, stopping = false, size = 0, deadline, grace
    const chunks = []
    const stopGroup = () => {
      try { terminateProcessGroup(child.pid) } catch { try { child.kill('SIGKILL') } catch {} }
    }
    const onSignal = () => { process.exitCode = 1; stop() }
    const onExit = () => { if (!settled) stopGroup() }
    const finish = (code, status) => {
      if (settled) return
      // The leader may have exited while a CLI descendant kept running.
      stopGroup()
      settled = true; clearTimeout(deadline); clearTimeout(grace)
      process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal)
      process.removeListener('exit', onExit)
      child.stdout?.removeAllListeners('data'); child.stdout?.destroy()
      child.stdio?.[3]?.destroy()
      const output = status === 'EXITED' && code === 0 && size <= maxOutputBytes
        ? Buffer.concat(chunks, size) : null
      for (const chunk of chunks) chunk.fill(0)
      resolveResult(Object.freeze({ status, code, output }))
    }
    const stop = () => {
      if (stopping || settled) return
      stopping = true; stopGroup()
      grace = setTimeout(() => {
        stopGroup(); child.unref?.(); finish(null, 'UNCERTAIN')
      }, stopGraceMs)
    }
    deadline = setTimeout(stop, deadlineMs)
    process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal); process.on('exit', onExit)
    child.stdio?.[3]?.on('error', stop)
    try { child.stdio?.[3]?.write(proof) } catch { stop() }
    child.stdout?.on('data', chunk => {
      if (settled) { chunk.fill(0); return }
      size += chunk.length
      if (size > maxOutputBytes) { chunk.fill(0); stop(); return }
      chunks.push(chunk)
    })
    child.once('error', stop)
    // 'close' waits for inherited output pipes held by descendants. Kill the
    // group as soon as the leader exits so those descendants cannot run until
    // the whole-process deadline, then let 'close' drain the final receipt.
    child.once('exit', () => stopGroup())
    child.once('close', code => finish(code, stopping ? 'KILLED' : code === 0 ? 'EXITED' : 'KILLED'))
  })
}
