#!/usr/bin/env node
/**
 * ONLY supported Phase 3 operator entry for Generation 13.
 *
 * Gen 11 and Gen 12 died mid-VERCEL_STAGE because live was started via a
 * short-lived nohup/detached remote shell. This wrapper is the prevention:
 *
 * - Rejects obvious nohup / orphan starts
 * - Sets TLL_LIVE_LONG_SESSION=1
 * - Creates and holds a keepalive file for the whole run
 * - Runs the dedicated live launcher in the foreground
 * - Optionally runs journal-watch --follow as a sibling observer (killed when
 *   the launcher exits)
 * - Writes a secret-free session summary under implementation-state/staging/
 *
 * Usage (foreground Shell with block_until ~45–55 minutes):
 *   node scripts/staging-generation-13-run-live-once.mjs
 *   node scripts/staging-generation-13-run-live-once.mjs --watch-interval 20
 *
 * Do NOT: nohup, background `&` without wait, or Shell block_until_ms: 0.
 */
import { spawn } from 'node:child_process'
import {
  openSync,
  closeSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  KEEPALIVE_PATH_ENV,
  KEEPALIVE_SCHEMA,
  LONG_SESSION_ENV,
} from './staging-generation-13-long-session-contract.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const launcherPath = resolve(here, 'staging-generation-13-live-launcher.mjs')
const journalWatchPath = resolve(here, 'staging-generation-13-journal-watch.mjs')
const summaryDir = resolve(root, 'implementation-state/staging')
const defaultKeepalivePath = resolve('/tmp', `tll-generation-13-live-keepalive-${process.pid}.json`)

function fail(message, code = 2) {
  const error = new Error(message)
  error.code = 'RUN_LIVE_ONCE_REJECTED'
  error.exitCode = code
  throw error
}

function parseArgs(argv) {
  let watchIntervalSec = 0
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--watch-interval') {
      const raw = argv[++i]
      const value = Number(raw)
      if (!Number.isFinite(value) || value < 1 || value > 3600) {
        fail('run-live-once --watch-interval requires seconds in [1, 3600]')
      }
      watchIntervalSec = value
      continue
    }
    if (arg === '--help' || arg === '-h') {
      return { help: true, watchIntervalSec: 0 }
    }
    fail(`run-live-once unknown argument: ${arg}`)
  }
  return { help: false, watchIntervalSec }
}

function readProc(path) {
  try { return readFileSync(path, 'utf8') } catch { return null }
}

/** Reject nohup / orphan starts where detectable. Exported for unit tests. */
export function assertSupportedOperatorEntry({
  ppid = process.ppid,
  env = process.env,
} = {}) {
  if (typeof ppid !== 'number' || ppid <= 1) {
    fail(
      'FATAL: staging-generation-13-run-live-once refused start — process appears orphaned (ppid<=1). '
      + 'Do not use nohup/detached short sessions (Gen 11/12 root cause).',
    )
  }
  if (env.TLL_ALLOW_NOHUP_LIVE === '1') {
    fail(
      'FATAL: staging-generation-13-run-live-once refused start — TLL_ALLOW_NOHUP_LIVE is not permitted for Gen 13.',
    )
  }
  const parentComm = readProc(`/proc/${ppid}/comm`)?.trim()
  const parentCmd = readProc(`/proc/${ppid}/cmdline`)?.replace(/\0/g, ' ').trim()
  const selfCmd = readProc(`/proc/${process.pid}/cmdline`)?.replace(/\0/g, ' ').trim()
  if ((parentComm && /\bnohup\b/i.test(parentComm))
    || (parentCmd && /\bnohup\b/i.test(parentCmd))
    || (selfCmd && /\bnohup\b/i.test(selfCmd))) {
    fail(
      'FATAL: staging-generation-13-run-live-once refused start — nohup detected. '
      + 'Run in a foreground long-lived Shell instead (Gen 11/12 prevention).',
    )
  }
  return Object.freeze({ ok: true, ppid })
}

function createKeepalive(path) {
  const record = {
    schema: KEEPALIVE_SCHEMA,
    holderPid: process.pid,
    generation: 13,
    startedAt: new Date().toISOString(),
    note: 'Held open by staging-generation-13-run-live-once for the whole live window',
  }
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, `${JSON.stringify(record)}\n`, { mode: 0o600 })
  const fd = openSync(path, 'r+')
  return { fd, record }
}

function runChild(commandPath, args, env) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [commandPath, ...args], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => {
      stdout += chunk
      process.stdout.write(chunk)
    })
    child.stderr.on('data', chunk => {
      stderr += chunk
      process.stderr.write(chunk)
    })
    child.on('error', rejectPromise)
    child.on('close', (code, signal) => {
      resolvePromise({ code: code ?? 1, signal, stdout, stderr, child })
    })
    return child
  })
}

export async function runLiveOnceMain(argv = process.argv.slice(2), {
  env = process.env,
  ppid = process.ppid,
} = {}) {
  const { help, watchIntervalSec } = parseArgs(argv)
  if (help) {
    process.stdout.write(
      'Usage: node scripts/staging-generation-13-run-live-once.mjs [--watch-interval N]\n',
    )
    return { exitCode: 0 }
  }

  assertSupportedOperatorEntry({ ppid, env })

  const keepalivePath = env[KEEPALIVE_PATH_ENV] && env[KEEPALIVE_PATH_ENV].length > 0
    ? resolve(env[KEEPALIVE_PATH_ENV])
    : defaultKeepalivePath

  const keepalive = createKeepalive(keepalivePath)
  const startedAt = new Date().toISOString()
  const childEnv = {
    ...env,
    [LONG_SESSION_ENV]: '1',
    [KEEPALIVE_PATH_ENV]: keepalivePath,
  }

  let launcherResult
  let watchExit = null
  let watchChild = null
  try {
    process.stdout.write(`${JSON.stringify({
      event: 'run-live-once-start',
      generation: 13,
      keepalivePath,
      holderPid: process.pid,
      watchIntervalSec: watchIntervalSec || null,
      launcher: 'scripts/staging-generation-13-live-launcher.mjs',
    })}\n`)

    if (watchIntervalSec > 0) {
      watchChild = spawn(
        process.execPath,
        [journalWatchPath, '--follow', '--interval', String(watchIntervalSec)],
        { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] },
      )
      watchChild.stdout.on('data', chunk => process.stdout.write(chunk))
      watchChild.stderr.on('data', chunk => process.stderr.write(chunk))
      watchChild.on('close', (code, signal) => {
        watchExit = { code: code ?? 0, signal }
      })
    }

    launcherResult = await new Promise((resolvePromise, rejectPromise) => {
      const child = spawn(process.execPath, [launcherPath], {
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', chunk => {
        stdout += chunk
        process.stdout.write(chunk)
      })
      child.stderr.on('data', chunk => {
        stderr += chunk
        process.stderr.write(chunk)
      })
      child.on('error', rejectPromise)
      child.on('close', (code, signal) => {
        resolvePromise({ code: code ?? 1, signal, stdout, stderr })
      })
    })
  } finally {
    if (watchChild && !watchChild.killed) {
      try { watchChild.kill('SIGTERM') } catch { /* ignore */ }
    }
    try { closeSync(keepalive.fd) } catch { /* ignore */ }
  }

  const finishedAt = new Date().toISOString()
  mkdirSync(summaryDir, { recursive: true, mode: 0o700 })
  const summaryPath = resolve(
    summaryDir,
    `tll-generation-13-live-session-${startedAt.replace(/[:.]/g, '-')}.json`,
  )
  const summary = {
    schema: 'tll-generation-13-live-session-summary/v1',
    generation: 13,
    startedAt,
    finishedAt,
    keepalivePath,
    holderPid: process.pid,
    launcherExitCode: launcherResult?.code ?? null,
    launcherSignal: launcherResult?.signal ?? null,
    watchIntervalSec: watchIntervalSec || null,
    watchExitCode: watchExit?.code ?? null,
    notes: [
      'Secret-free summary only.',
      'Gates remain disabled unless a separate reviewed arming diff landed.',
      'Do not replay Gen 11 or Gen 12. Do not arm overnight unattended without a proven supervisor.',
    ],
  }
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 })
  process.stdout.write(`${JSON.stringify({
    event: 'run-live-once-finish',
    summaryPath,
    launcherExitCode: summary.launcherExitCode,
  })}\n`)

  return { exitCode: launcherResult?.code ?? 1, summaryPath, summary }
}

const isDirectRun = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  try {
    const result = await runLiveOnceMain()
    process.exitCode = result.exitCode
  } catch (error) {
    if (error?.code === 'RUN_LIVE_ONCE_REJECTED') {
      process.stderr.write(`${error.message}\n`)
      process.exitCode = error.exitCode ?? 2
    } else {
      throw error
    }
  }
}
