/** Credential-free process control for the disabled broker recovery runner. */
import { spawn } from 'node:child_process'
import { Socket } from 'node:net'
import { isAbsolute } from 'node:path'

export const BROKER_RECOVERY_PROCESS_CONTROL_ENABLED = false
const unavailable = () => { throw Error('Staging broker recovery process control unavailable') }

export function terminateProcessGroup(pid, kill = process.kill) {
  if (!Number.isSafeInteger(pid) || pid < 2 || typeof kill !== 'function') unavailable()
  kill(-pid, 'SIGKILL')
}

/** The supervisor keeps fd 3 open for the worker's entire lifetime. */
export function acceptSupervisorPipe({ proof, fd = 3 } = {}) {
  if (typeof proof !== 'string' || proof.length < 8 || proof.length > 128
    || !Number.isSafeInteger(fd) || fd < 3) unavailable()
  const expected = Buffer.from(proof, 'utf8'), received = Buffer.alloc(expected.length)
  let size = 0, proven = false, released = false
  const stop = () => { try { terminateProcessGroup(process.pid) } catch { process.exitCode = 1 } }
  return new Promise((resolveProof, rejectProof) => {
    let stream
    try { stream = new Socket({ fd, readable: true, writable: false }) }
    catch { expected.fill(0); received.fill(0); unavailable() }
    stream.on('data', chunk => {
      if (released) { chunk.fill(0); return }
      if (proven || size + chunk.length > received.length) { chunk.fill(0); stop(); return }
      chunk.copy(received, size); size += chunk.length; chunk.fill(0)
      if (size === received.length) {
        proven = received.equals(expected)
        expected.fill(0); received.fill(0)
        if (proven) resolveProof(() => { released = true; stream.destroy() })
        else { rejectProof(Error('Supervisor proof unavailable')); stop() }
      }
    })
    stream.on('end', () => { if (!released) { if (!proven) rejectProof(Error('Supervisor pipe unavailable')); stop() } })
    stream.on('error', () => { if (!released) { if (!proven) rejectProof(Error('Supervisor pipe unavailable')); stop() } })
  })
}

/** A result after a forced stop is never a successful observation. */
export function runBoundedDetachedWorker({ executable, args, cwd, env, proof,
  deadlineMs, maxOutputBytes = 1024, stopGraceMs = 2_000, spawnProcess = spawn } = {}) {
  if (!isAbsolute(executable) || !Array.isArray(args) || args.some(value => typeof value !== 'string')
    || !isAbsolute(cwd) || !env || typeof env !== 'object' || typeof proof !== 'string'
    || proof.length < 8 || proof.length > 128 || !Number.isSafeInteger(deadlineMs)
    || deadlineMs < 1 || deadlineMs > 70_000 || !Number.isSafeInteger(maxOutputBytes)
    || maxOutputBytes < 1 || maxOutputBytes > 4096 || !Number.isSafeInteger(stopGraceMs)
    || stopGraceMs < 1 || stopGraceMs > 5_000 || typeof spawnProcess !== 'function') unavailable()
  return new Promise(resolveResult => {
    let child
    try {
      child = spawnProcess(executable, args, { cwd, env, detached: true,
        stdio: ['ignore', 'pipe', 'ignore', 'pipe'] })
    } catch { resolveResult(Object.freeze({ status: 'UNCERTAIN', code: null, output: null })); return }
    let settled = false, stopping = false, size = 0, deadline, grace
    const chunks = []
    const onSignal = () => { process.exitCode = 1; stop() }
    const onExit = () => { if (!settled) { try { terminateProcessGroup(child.pid) } catch {} } }
    const finish = (code, status) => {
      if (settled) return
      settled = true; clearTimeout(deadline); clearTimeout(grace)
      process.removeListener('SIGINT', onSignal)
      process.removeListener('SIGTERM', onSignal)
      process.removeListener('exit', onExit)
      child.stdout?.removeAllListeners('data')
      child.stdout?.destroy()
      child.stdio?.[3]?.destroy()
      const output = status === 'EXITED' && code === 0 && size <= maxOutputBytes
        ? Buffer.concat(chunks, size) : null
      for (const chunk of chunks) chunk.fill(0)
      resolveResult(Object.freeze({ status, code, output }))
    }
    const stop = () => {
      if (stopping || settled) return
      stopping = true
      try { terminateProcessGroup(child.pid) } catch { try { child.kill('SIGKILL') } catch {} }
      grace = setTimeout(() => {
        try { terminateProcessGroup(child.pid) } catch {}
        child.unref?.()
        finish(null, 'UNCERTAIN')
      }, stopGraceMs)
    }
    deadline = setTimeout(stop, deadlineMs)
    process.on('SIGINT', onSignal)
    process.on('SIGTERM', onSignal)
    process.on('exit', onExit)
    child.stdio?.[3]?.on('error', stop)
    try { child.stdio?.[3]?.write(proof) } catch { stop() }
    child.stdout?.on('data', chunk => {
      if (settled) { chunk.fill(0); return }
      size += chunk.length
      if (size > maxOutputBytes) { chunk.fill(0); stop(); return }
      chunks.push(chunk)
    })
    child.once('error', stop)
    child.once('close', code => {
      if (code !== 0 && !stopping) {
        try { terminateProcessGroup(child.pid) } catch {}
        finish(code, 'KILLED')
      } else finish(code, stopping ? 'KILLED' : 'EXITED')
    })
  })
}
