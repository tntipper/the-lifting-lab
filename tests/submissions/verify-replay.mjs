import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { fixtureTarget } from './fixture.mjs'

const migration = new URL('../../supabase/migrations/202609150002_public_submission_gateway.sql', import.meta.url)
// pg_dump 17 adds a random psql restriction token. Ignore only those directives;
// retain schema, function bodies, grants, data, sequences and all role state.
export function dumpFingerprint(databaseDump, rolesDump) {
  const normalized = databaseDump.replace(/^\\(?:un)?restrict .*(?:\r?\n|$)/gm, '') + rolesDump.replace(/^\\(?:un)?restrict .*(?:\r?\n|$)/gm, '')
  return createHash('sha256').update(normalized).digest('hex')
}
export function verifyReplay(execute = execFileSync, env = process.env) {
  const { container, database } = fixtureTarget(env)
  const call = (args, input) => execute('docker', ['exec', '-i', container, ...args], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 })
  const fingerprint = () => dumpFingerprint(call(['pg_dump', '-U', 'postgres', '-d', database]), call(['pg_dumpall', '-U', 'postgres', '--roles-only']))
  const before = fingerprint()
  let rejected = false
  try { call(['psql', '-X', '-q', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1'], readFileSync(migration, 'utf8')) }
  catch (error) {
    if (!String(error.stderr).includes('Gateway already exists or schema name collides; inspect migration history')) throw new Error('Replay did not fail at the required collision guard', { cause: error })
    rejected = true
  }
  if (!rejected) throw new Error('One-time gateway migration unexpectedly replayed successfully')
  if (before !== fingerprint()) throw new Error('Rejected migration replay changed database or role state')
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) throw new Error('This synthetic check accepts no arguments')
  verifyReplay()
  console.log('PASS: repeat migration rejected at collision guard; database and role dumps unchanged')
}
