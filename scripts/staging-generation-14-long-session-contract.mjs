/**
 * Generation 14 long-session start contract (secret-free).
 *
 * Extracted from the live launcher so ordinary unit tests can cover refusal
 * paths without importing the native launcher (live-boundary rule).
 *
 * When native gates are armed, the live launcher requires:
 *   - TLL_LIVE_LONG_SESSION=1
 *   - TLL_LIVE_KEEPALIVE_PATH pointing at a keepalive JSON held open by
 *     scripts/staging-generation-14-run-live-once.mjs for the whole run
 *   - process not an obvious orphan (ppid<=1) / nohup child
 *
 * Gen 11 and Gen 12 both died mid-VERCEL_STAGE after short-lived nohup/detached
 * remote shells. Comments alone did not prevent the Gen 12 repeat.
 */
import { openSync, closeSync, readFileSync, existsSync } from 'node:fs'

export const LONG_SESSION_ENV = 'TLL_LIVE_LONG_SESSION'
export const KEEPALIVE_PATH_ENV = 'TLL_LIVE_KEEPALIVE_PATH'
export const KEEPALIVE_SCHEMA = 'tll-live-long-session-keepalive/v1'

function rejectLongSession(message) {
  const error = new Error(message)
  error.code = 'LONG_SESSION_CONTRACT_REJECTED'
  throw error
}

function readParentComm(ppid) {
  try { return readFileSync(`/proc/${ppid}/comm`, 'utf8').trim() } catch { return null }
}

function readParentCmdline(ppid) {
  try { return readFileSync(`/proc/${ppid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim() } catch { return null }
}

/**
 * Hard start contract for armed live runs.
 * Secret-free. Injectable env/ppid/fs for deterministic coverage.
 */
export function assertLongSessionContract({
  env = process.env,
  ppid = process.ppid,
  openSync: open = openSync,
  closeSync: close = closeSync,
  existsSync: exists = existsSync,
  readFileSync: readFile = readFileSync,
  readParentComm: parentComm = readParentComm,
  readParentCmdline: parentCmdline = readParentCmdline,
} = {}) {
  if (env[LONG_SESSION_ENV] !== '1') {
    rejectLongSession(
      'FATAL: Generation 14 live launcher refused start — TLL_LIVE_LONG_SESSION=1 is required when native gates are armed. '
      + 'Use scripts/staging-generation-14-run-live-once.mjs in a long-lived process / foreground Shell (block_until ~45–55m). '
      + 'Short-lived nohup/detached remote shells caused Gen 11 and Gen 12 mid-VERCEL_STAGE deaths.',
    )
  }

  const keepalivePath = env[KEEPALIVE_PATH_ENV]
  if (typeof keepalivePath !== 'string' || keepalivePath.length < 1) {
    rejectLongSession(
      'FATAL: Generation 14 live launcher refused start — TLL_LIVE_KEEPALIVE_PATH must point to a keepalive file held open by the parent run-live-once wrapper for the whole run.',
    )
  }
  if (!exists(keepalivePath)) {
    rejectLongSession(
      'FATAL: Generation 14 live launcher refused start — keepalive path is missing. The parent must hold the keepalive open for the entire live window.',
    )
  }

  let fd
  try {
    fd = open(keepalivePath, 'r')
  } catch {
    rejectLongSession(
      'FATAL: Generation 14 live launcher refused start — keepalive path could not be opened for read.',
    )
  } finally {
    if (fd !== undefined) {
      try { close(fd) } catch { /* ignore */ }
    }
  }

  let record
  try {
    record = JSON.parse(readFile(keepalivePath, 'utf8'))
  } catch {
    rejectLongSession(
      'FATAL: Generation 14 live launcher refused start — keepalive file is not valid JSON.',
    )
  }
  if (!record || typeof record !== 'object' || record.schema !== KEEPALIVE_SCHEMA) {
    rejectLongSession(
      'FATAL: Generation 14 live launcher refused start — keepalive schema mismatch.',
    )
  }
  if (typeof record.holderPid !== 'number' || !Number.isInteger(record.holderPid) || record.holderPid <= 1) {
    rejectLongSession(
      'FATAL: Generation 14 live launcher refused start — keepalive holderPid is invalid.',
    )
  }
  if (typeof ppid !== 'number' || ppid <= 1) {
    rejectLongSession(
      'FATAL: Generation 14 live launcher refused start — process appears orphaned (ppid<=1). '
      + 'Likely nohup/detached parent exit; Gen 11/12 root cause. Use run-live-once in a foreground long session.',
    )
  }
  if (record.holderPid !== ppid) {
    rejectLongSession(
      'FATAL: Generation 14 live launcher refused start — keepalive holderPid does not match process parent. '
      + 'Start only via scripts/staging-generation-14-run-live-once.mjs so the parent holds the keepalive for the whole run.',
    )
  }

  const comm = parentComm(ppid)
  const cmdline = parentCmdline(ppid)
  if ((typeof comm === 'string' && /\bnohup\b/i.test(comm))
    || (typeof cmdline === 'string' && /\bnohup\b/i.test(cmdline))) {
    rejectLongSession(
      'FATAL: Generation 14 live launcher refused start — parent looks like nohup. '
      + 'Nohup/detached short sessions killed Gen 11 and Gen 12 mid-VERCEL_STAGE.',
    )
  }

  return Object.freeze({ ok: true, keepalivePath, holderPid: record.holderPid })
}
