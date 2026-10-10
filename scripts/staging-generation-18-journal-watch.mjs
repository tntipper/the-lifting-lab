#!/usr/bin/env node
/**
 * Read-only Generation 18 phase-journal observer.
 *
 * Prints non-secret phase progress via `assessStagingWindowProgress`.
 * Does not import the live launcher, Keychain helpers, or credential-bearing
 * modules. Safe for a separate long-lived observer process while the dedicated
 * launcher runs. Never kill the launcher while status is ACTIVE_WITHIN_PHASE_BOUND.
 *
 * Default: one-shot JSON line (Gen 12 behaviour preserved).
 * Continuous: `--follow [--interval N]` loops until TERMINAL or
 * STALE_REQUIRES_RECONCILIATION (or Ctrl-C), printing one JSON line per tick.
 *
 * Not part of the ordinary-test native path.
 */
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { assessStagingWindowProgress, PHASE_DEADLINES_MS } from './staging-window-phase-journal.mjs'

const DEFAULT_PHASE_JOURNAL_PATH = fileURLToPath(
  new URL('../../implementation-state/staging/tll-generation-18-window-phase.json', import.meta.url),
)

function parseArgs(argv) {
  let follow = false
  let intervalSec = 20
  const positionals = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--follow') {
      follow = true
      continue
    }
    if (arg === '--interval') {
      const raw = argv[++i]
      const value = Number(raw)
      if (!Number.isFinite(value) || value < 1 || value > 3600) {
        throw new Error('journal-watch --interval requires seconds in [1, 3600]')
      }
      intervalSec = value
      continue
    }
    if (arg.startsWith('-')) {
      throw new Error(`journal-watch unknown flag: ${arg}`)
    }
    positionals.push(arg)
  }
  if (positionals.length > 1) {
    throw new Error('journal-watch accepts at most one journal path')
  }
  return {
    follow,
    intervalSec,
    path: positionals[0] ? resolve(positionals[0]) : DEFAULT_PHASE_JOURNAL_PATH,
  }
}

function readJournal(journalPath) {
  if (!existsSync(journalPath)) return null
  return Object.freeze(JSON.parse(readFileSync(journalPath, 'utf8')))
}

function observeOnce(journalPath) {
  const record = readJournal(journalPath)
  if (!record) {
    return Object.freeze({
      status: 'NO_JOURNAL',
      path: journalPath,
      hint: 'Launcher has not claimed the phase journal yet',
      operatorRule: 'WAIT_FOR_LAUNCHER_OR_CONFIRM_START',
    })
  }
  const assessment = assessStagingWindowProgress(record)
  const operatorRule = assessment.status === 'ACTIVE_WITHIN_PHASE_BOUND'
    ? 'DO_NOT_KILL_OR_RECONCILE'
    : assessment.status === 'STALE_REQUIRES_RECONCILIATION'
      ? 'STOP_ATTEMPT_AND_RECONCILE_READONLY'
      : 'TERMINAL_OBSERVE_ONLY'
  return Object.freeze({
    status: assessment.status,
    phase: assessment.phase,
    outcome: record.outcome,
    elapsedMs: assessment.elapsedMs,
    deadlineMs: assessment.deadlineMs,
    phaseDeadlineMs: PHASE_DEADLINES_MS[record.phase],
    identity: {
      packageId: record.identity?.packageId,
      generation: record.identity?.generation,
      windowId: record.identity?.windowId,
      target: record.identity?.target,
    },
    updatedAt: record.updatedAt,
    path: journalPath,
    operatorRule,
  })
}

function shouldStopFollow(status) {
  return status === 'TERMINAL' || status === 'STALE_REQUIRES_RECONCILIATION'
}

const { follow, intervalSec, path } = parseArgs(process.argv.slice(2))

if (!follow) {
  process.stdout.write(`${JSON.stringify(observeOnce(path))}\n`)
  process.exitCode = 0
} else {
  let stopped = false
  const onStop = () => { stopped = true }
  process.on('SIGINT', onStop)
  process.on('SIGTERM', onStop)
  while (!stopped) {
    const snapshot = observeOnce(path)
    process.stdout.write(`${JSON.stringify({ ...snapshot, follow: true, intervalSec })}\n`)
    if (shouldStopFollow(snapshot.status)) break
    await sleep(intervalSec * 1000)
  }
  process.exitCode = 0
}
