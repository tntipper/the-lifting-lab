#!/usr/bin/env node
/** One-shot staging database rehearsal. This module is inert until independently armed. */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStagingWindowPhaseJournal } from './staging-account-hosted-baseline-session.mjs'
import { DB_REHEARSAL_JOURNAL_PATH, runStagingDatabaseRehearsal } from './staging-account-hosted-baseline-db-rehearsal.mjs'

export const NATIVE_DB_REHEARSAL_ENABLED = false
const TARGET = 'qdmvngjwkcsilzmqksme'

function readCredential () {
  const result = spawnSync('/usr/bin/security', ['find-generic-password', '-w', '-s', 'Supabase CLI', '-a', 'supabase'], {
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000, maxBuffer: 4097,
  })
  const output = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.alloc(0)
  try {
    const length = output.at(-1) === 10 ? output.length - 1 : output.length
    if (result.status !== 0 || length < 8 || length > 4096) throw Error('Staging database rehearsal credential unavailable')
    return Buffer.from(output.subarray(0, length))
  } finally { output.fill(0) }
}

export async function runStagingDatabaseRehearsalLiveOnce () {
  if (NATIVE_DB_REHEARSAL_ENABLED !== true) return Object.freeze({ status: 'DB_REHEARSAL_LIVE_DISABLED', target: TARGET })
  return runStagingDatabaseRehearsal({ readCredential, fetch: globalThis.fetch,
    journal: createStagingWindowPhaseJournal({ path: DB_REHEARSAL_JOURNAL_PATH }) })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runStagingDatabaseRehearsalLiveOnce()
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
