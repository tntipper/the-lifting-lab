import { execFileSync } from 'node:child_process'
/** Permission errors are not evidence that a worker has stopped. */
export function processRunning(pid, { probe = process.kill, inspect = execFileSync } = {}) {
  const present = () => {
    try { probe(pid, 0); return true } catch (error) { if (error?.code === 'ESRCH') return false; throw error }
  }
  if (!Number.isSafeInteger(pid) || pid < 2) throw Error('Invalid fixture process')
  if (!present()) return false
  let state
  try { state = inspect('/bin/ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
  catch (error) { if (!present()) return false; throw error }
  if (!state) { if (!present()) return false; throw Error('Fixture process state unavailable') }
  return !/^Z/.test(state)
}
