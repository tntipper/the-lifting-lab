#!/usr/bin/env node
/**
 * Read-only Generation 12 phase-journal observer.
 *
 * Prints non-secret phase progress via `assessStagingWindowProgress`.
 * Does not import the live launcher, Keychain helpers, or credential-bearing
 * modules. Safe for a separate long-lived observer process while the dedicated
 * launcher runs. Never kill the launcher while status is ACTIVE_WITHIN_PHASE_BOUND.
 *
 * Not part of the ordinary-test native path.
 */
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import { assessStagingWindowProgress, PHASE_DEADLINES_MS } from './staging-window-phase-journal.mjs'

const DEFAULT_PHASE_JOURNAL_PATH = fileURLToPath(
  new URL('../../implementation-state/staging/tll-generation-12-window-phase.json', import.meta.url),
)

const path = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_PHASE_JOURNAL_PATH

function readJournal(journalPath) {
  if (!existsSync(journalPath)) return null
  return Object.freeze(JSON.parse(readFileSync(journalPath, 'utf8')))
}

const record = readJournal(path)
if (!record) {
  process.stdout.write(`${JSON.stringify({
    status: 'NO_JOURNAL',
    path,
    hint: 'Launcher has not claimed the phase journal yet',
  })}\n`)
  process.exitCode = 0
} else {
  const assessment = assessStagingWindowProgress(record)
  const operatorRule = assessment.status === 'ACTIVE_WITHIN_PHASE_BOUND'
    ? 'DO_NOT_KILL_OR_RECONCILE'
    : assessment.status === 'STALE_REQUIRES_RECONCILIATION'
      ? 'STOP_ATTEMPT_AND_RECONCILE_READONLY'
      : 'TERMINAL_OBSERVE_ONLY'
  process.stdout.write(`${JSON.stringify({
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
    path,
    operatorRule,
  })}\n`)
  process.exitCode = 0
}
