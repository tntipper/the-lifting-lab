#!/usr/bin/env node
/** One-shot staging read-only diagnostic; inert until the reviewed arming diff. */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStagingWindowPhaseJournal } from './staging-account-hosted-baseline-session.mjs'
import { DB_DIAGNOSTIC_JOURNAL_PATH, runStagingDatabaseDiagnostic } from './staging-account-hosted-baseline-db-diagnostic.mjs'

export const NATIVE_DB_DIAGNOSTIC_ENABLED = true
const TARGET = 'qdmvngjwkcsilzmqksme'

function readCredential () {
  const result = spawnSync('/usr/bin/security', ['find-generic-password', '-w', '-s', 'Supabase CLI', '-a', 'supabase'], {
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000, maxBuffer: 4097,
  })
  const output = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.alloc(0)
  try {
    const length = output.at(-1) === 10 ? output.length - 1 : output.length
    if (result.status !== 0 || length < 8 || length > 4096) throw Error('Staging database diagnostic credential unavailable')
    return Buffer.from(output.subarray(0, length))
  } finally { output.fill(0) }
}

export async function runStagingDatabaseDiagnosticLiveOnce () {
  if (NATIVE_DB_DIAGNOSTIC_ENABLED !== true) return Object.freeze({ status: 'DB_DIAGNOSTIC_LIVE_DISABLED', target: TARGET })
  return runStagingDatabaseDiagnostic({ readCredential, fetch: globalThis.fetch,
    journal: createStagingWindowPhaseJournal({ path: DB_DIAGNOSTIC_JOURNAL_PATH }) })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runStagingDatabaseDiagnosticLiveOnce()
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
