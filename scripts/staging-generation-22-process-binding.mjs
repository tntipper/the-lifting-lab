/** Disabled, fixed and credential-free Gen22 child-process binding. */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const STAGING_GENERATION_22_PROCESS_BINDING_ENABLED = false
export const GENERATION_22_WORKER_PROOF = 'TLL_STAGING_GENERATION_22_SUPERVISOR_V1'
export const GENERATION_22_WORKER_PATH = fileURLToPath(
  new URL('./staging-generation-22-worker-entry.mjs', import.meta.url))
const ROOT = resolve(import.meta.dirname, '..')
const unavailable = () => { throw new Error('Generation 22 process binding unavailable') }

/** Return the only worker spawn permitted by the Gen22 parent supervisor. */
export function createStagingGeneration22FixedSpawner({ spawnProcess = spawn,
  killGroup = pid => process.kill(-pid, 'SIGKILL') } = {}) {
  if (!STAGING_GENERATION_22_PROCESS_BINDING_ENABLED
    || typeof spawnProcess !== 'function' || typeof killGroup !== 'function') unavailable()
  let used = false
  return () => {
    if (used) unavailable()
    used = true
    const child = spawnProcess(process.execPath, [GENERATION_22_WORKER_PATH], {
      cwd: ROOT, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, detached: true,
      stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    })
    if (!child || !Number.isSafeInteger(child.pid) || child.pid < 2
      || typeof child.once !== 'function' || typeof child.stdio?.[3]?.write !== 'function'
      || typeof child.stdio[3].on !== 'function') {
      try { child?.kill?.('SIGKILL') } catch {}
      unavailable()
    }
    child.bindingFault = false
    let closed = false
    const stop = () => {
      if (closed) return
      child.bindingFault = true
      try { killGroup(child.pid) } catch { try { child.kill('SIGKILL') } catch {} }
    }
    child.stdio[3].on('error', stop)
    child.once('close', () => { closed = true; child.stdio[3].destroy() })
    try { child.stdio[3].write(GENERATION_22_WORKER_PROOF) } catch { stop() }
    return child
  }
}
