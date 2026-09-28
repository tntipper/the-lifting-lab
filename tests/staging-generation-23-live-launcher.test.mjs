import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
const path = new URL('../scripts/staging-generation-23-live-launcher.mjs', import.meta.url)
const launcherSource = await readFile(path, 'utf8')
const loadDisabled = () => import(`data:text/javascript;base64,${Buffer.from(launcherSource
  .replace("import { execFileSync } from 'node:child_process'", "const execFileSync = () => { throw Error('unexpected git') }")
  .replace("import { lstatSync } from 'node:fs'", "const lstatSync = () => { throw Error('unexpected file read') }")
  .replace("import { ACTIVE_WINDOW_EXPIRES_AT } from './staging-generation-23-credentials.mjs'", "const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'")
  .replace("import { JOURNAL_PATH as WHOLE_ROUTE_JOURNAL_PATH } from './staging-generation-23-whole-route-journal.mjs'", "const WHOLE_ROUTE_JOURNAL_PATH = '/fixed/test/implementation-state/staging/tll-generation-23-whole-route-v17.json'")
  .replace(/import \{ STAGING_GENERATION_23_PROCESS_BINDING_ENABLED,\s+runBoundedStagingGeneration23WholeWorker \} from '\.\/staging-generation-23-process-binding\.mjs'/,
    "const STAGING_GENERATION_23_PROCESS_BINDING_ENABLED = false; const runBoundedStagingGeneration23WholeWorker = () => { throw Error('unexpected worker') }")
  .replace("const ROOT = resolve(import.meta.dirname, '..')", "const ROOT = '/fixed/test/root'")
  .replace('if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {', 'if (false) {')).toString('base64')}#${Math.random()}`)
const { assessStagingGeneration23LaunchGate, GENERATION_23_LAUNCH_RECORD_NAMES,
  GENERATION_23_LAUNCH_MIN_REMAINING_MS, STAGING_GENERATION_23_LIVE_LAUNCHER_ENABLED,
  priorHoldVerified, runStagingGeneration23LiveOnce } = await loadDisabled()
const now = Date.now()
const expiry = new Date(now + 50 * 60 * 1000).toISOString()
const gate = overrides => assessStagingGeneration23LaunchGate({ branchOk: true,
  recordsUnused: true, expiresAt: expiry, nowMs: now, ...overrides })

test('ordinary parent launcher is OFF before any branch, journal, credential or network read', async () => {
  assert.equal(STAGING_GENERATION_23_LIVE_LAUNCHER_ENABLED, false)
  let spawned = false
  assert.deepEqual(await runStagingGeneration23LiveOnce({ spawnProcess() { spawned = true } }),
    { status: 'STAGING_RUN_DISABLED' })
  assert.equal(spawned, false)
  const child = spawnSync(process.execPath, [fileURLToPath(path)], { encoding: 'utf8', timeout: 2_000,
    env: { PATH: '/usr/bin:/bin', LANG: 'C' } })
  assert.equal(child.status, 1)
  assert.equal(child.stdout, '{"status":"STAGING_RUN_DISABLED"}\n')
})

test('one-run gate needs the exact branch, unused records and a live one-hour expiry', () => {
  assert.equal(gate(), true)
  assert.equal(gate({ branchOk: false }), false)
  assert.equal(gate({ recordsUnused: false }), false)
  assert.equal(gate({ expiresAt: 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF' }), false)
  assert.equal(gate({ expiresAt: new Date(now + GENERATION_23_LAUNCH_MIN_REMAINING_MS - 1).toISOString() }), false)
  assert.equal(gate({ expiresAt: new Date(now + 60 * 60 * 1000 + 1).toISOString() }), false)
  assert.equal(gate({ expiresAt: '2026-09-27T25:00:00.000Z' }), false)
  assert.equal(gate({ nowMs: NaN }), false)
  assert.equal(new Set(GENERATION_23_LAUNCH_RECORD_NAMES).size, GENERATION_23_LAUNCH_RECORD_NAMES.length)
  assert.ok(GENERATION_23_LAUNCH_RECORD_NAMES.includes('tll-generation-23-whole-route-v17.json'))
  assert.ok(GENERATION_23_LAUNCH_RECORD_NAMES.includes('tll-generation-23-database-retire-v17.json'))
  assert.ok(GENERATION_23_LAUNCH_RECORD_NAMES.includes('tll-generation-23-final-read-v17.json'))
})

test('successor requires an exact preserved prior HOLD file, not a cleared or edited record', () => {
  const bytes = Buffer.from('prior baseline HOLD fixture\n')
  const stat = { isFile: () => true, isSymbolicLink: () => false, nlink: 1, mode: 0o100600, size: bytes.length }
  const expectedSha256 = createHash('sha256').update(bytes).digest('hex')
  assert.equal(priorHoldVerified({ stat, bytes, expectedSha256 }), true)
  assert.equal(priorHoldVerified({ stat, bytes: Buffer.from('altered'), expectedSha256 }), false)
  assert.equal(priorHoldVerified({ stat: { ...stat, mode: 0o100644 }, bytes, expectedSha256 }), false)
  assert.equal(priorHoldVerified({ stat: { ...stat, isSymbolicLink: () => true }, bytes, expectedSha256 }), false)
  assert.equal(priorHoldVerified({ stat, bytes }), false)
})

async function isolatedLauncher(terminal) {
  let source = await readFile(path, 'utf8')
  source = source.replace("import { execFileSync } from 'node:child_process'",
    "const execFileSync = () => 'codex/tll-integration\\n'")
    .replace("import { lstatSync } from 'node:fs'",
      "const lstatSync = () => { const error = Error('absent'); error.code = 'ENOENT'; throw error }")
    .replace("import { ACTIVE_WINDOW_EXPIRES_AT } from './staging-generation-23-credentials.mjs'",
      `const ACTIVE_WINDOW_EXPIRES_AT = ${JSON.stringify(expiry)}`)
    .replace("import { JOURNAL_PATH as WHOLE_ROUTE_JOURNAL_PATH } from './staging-generation-23-whole-route-journal.mjs'",
      "const WHOLE_ROUTE_JOURNAL_PATH = '/fixed/test/implementation-state/staging/tll-generation-23-whole-route-v17.json'")
    .replace(/import \{ STAGING_GENERATION_23_PROCESS_BINDING_ENABLED,\s+runBoundedStagingGeneration23WholeWorker \} from '\.\/staging-generation-23-process-binding\.mjs'/,
      `const STAGING_GENERATION_23_PROCESS_BINDING_ENABLED = true;
       const runBoundedStagingGeneration23WholeWorker = async ({ spawnProcess }) => {
         if (typeof spawnProcess !== 'function') throw Error('missing process seam');
         return { status: ${JSON.stringify(terminal)} }
       }`)
    .replace('export const STAGING_GENERATION_23_LIVE_LAUNCHER_ENABLED = false',
      'export const STAGING_GENERATION_23_LIVE_LAUNCHER_ENABLED = true')
    .replace('recordsUnused: recordsUnused()', 'recordsUnused: true')
    .replace("const ROOT = resolve(import.meta.dirname, '..')", "const ROOT = '/fixed/test/root'")
    .replace('if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {', 'if (false) {')
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${Math.random()}`)
}

test('armed parent invokes the bounded binding exactly once and accepts only hosted success', async () => {
  const { runStagingGeneration23LiveOnce: run } = await isolatedLauncher('VERIFIED_STAGING_WHOLE_PROCESS')
  const spawnProcess = () => { throw Error('the stub binding must own the child') }
  assert.deepEqual(await run({ spawnProcess }), { status: 'VERIFIED_STAGING_WHOLE_PROCESS' })
  assert.deepEqual(await run({ spawnProcess }), { status: 'STAGING_RUN_DISABLED' })
})

test('a rehearsal or uncertain child result is never promoted to hosted success', async () => {
  for (const terminal of ['VERIFIED_LOCAL_WHOLE_PROCESS', 'RECONCILIATION_REQUIRED']) {
    const { runStagingGeneration23LiveOnce: run } = await isolatedLauncher(terminal)
    assert.deepEqual(await run({ spawnProcess() {} }), { status: 'RECONCILIATION_REQUIRED' })
  }
})

test('verified owner journey failure remains distinct from an uncertain shutdown', async () => {
  const { runStagingGeneration23LiveOnce: run } = await isolatedLauncher('OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED')
  assert.deepEqual(await run({ spawnProcess() {} }), { status: 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED' })
})
