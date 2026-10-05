import test from 'node:test'
import assert from 'node:assert/strict'
import { successorFixtureModules } from './fixtures/owner-successor-native-modules.mjs'
import { runOwnerSuccessorInjectedWorker, runFixedOwnerSuccessorWorker } from '../scripts/staging-owner-successor-worker-entry.mjs'
import { runBoundedOwnerSuccessorWorker, validateOwnerSuccessorWorkerTerminal } from '../scripts/staging-owner-successor-process-binding.mjs'
const startedAt = '2030-01-01T12:00:00.000Z', expiresAt = '2030-01-01T13:00:00.000Z'
const at = Date.parse(startedAt) + 60000
const modules = await successorFixtureModules({ startedAt, expiresAt })
const worker = await modules.import('staging-owner-successor-worker-entry.mjs')
const proof = () => ({ status: 'OWNER_SUCCESSOR_SOURCE_VERIFIED', authorization: 'NONE',
  sourceCommit: 'a'.repeat(40), executionCommit: 'b'.repeat(40), manifestSha256: 'c'.repeat(64), startedAt, expiresAt })
const secrets = () => ({ managementToken: Buffer.from(`sbp_${'a'.repeat(40)}`),
  vercelToken: Buffer.from('synthetic-vercel'), previewBypass: Buffer.from('synthetic-bypass') })
function fixture(overrides = {}) {
  const events = [], credentials = secrets(), controller = new AbortController()
  const options = { signal: controller.signal, now: () => at,
    accept: async () => { events.push('accepted'); return () => events.push('released') },
    readSource: async () => { events.push('source'); return proof() },
    readCredentials: async () => { events.push('credentials'); return credentials },
    createWorker: async () => { events.push('created'); return { core: { run: async () => {
      events.push('run'); return { status: 'LOCAL_SEQUENCE_PASS' } } }, dispose: async () => events.push('disposed') } },
    write: async text => { assert.ok(Object.values(credentials).every(v => v.every(byte => byte === 0)))
      events.push('written'); assert.equal(JSON.parse(text).provenance, 'SYNTHETIC_STUB') }, ...overrides }
  return { options, events, credentials, controller }
}
test('ordinary child and parent gates inspect no supplied inputs and grant no authority', async () => {
  const hostile = new Proxy({}, { get() { assert.fail('OFF input read') } })
  for (const run of [runOwnerSuccessorInjectedWorker, runFixedOwnerSuccessorWorker, runBoundedOwnerSuccessorWorker])
    assert.deepEqual(await run(hostile), { status: 'SUCCESSOR_EXECUTION_DISABLED', authorization: 'NONE' })
})
test('accepted supervisor precedes source and three owned credential buffers; cleanup precedes terminal', async () => {
  const f = fixture(), result = await worker.runOwnerSuccessorInjectedWorker(f.options)
  assert.equal(result.status, 'SYNTHETIC_SEQUENCE_PASS'); assert.equal(result.authorization, 'NONE')
  assert.deepEqual(f.events, ['accepted', 'source', 'credentials', 'created', 'run', 'disposed', 'written', 'released'])
  assert.equal(validateOwnerSuccessorWorkerTerminal(Buffer.from(`${JSON.stringify(result)}\n`), result.identity).status, 'HOLD_RECONCILE')
})
for (const [label, override, expected] of [
  ['missing supervisor', { accept: async () => { throw Error('missing fd3') } }, []],
  ['invalid source', { readSource: async () => ({ status: 'OWNER_SUCCESSOR_SOURCE_HOLD' }) }, ['accepted', 'released']],
]) test(`${label} denies before any credential read`, async () => {
  const f = fixture(override), result = await worker.runOwnerSuccessorInjectedWorker(f.options)
  assert.equal(result.status, 'HOLD_RECONCILE'); assert.deepEqual(f.events, expected)
})
test('invalid credential bytes are erased and no assembly runs', async () => {
  const f = fixture(); f.credentials.vercelToken.fill(0)
  assert.equal((await worker.runOwnerSuccessorInjectedWorker(f.options)).status, 'HOLD_RECONCILE')
  assert.ok(!f.events.includes('created')); assert.ok(Object.values(f.credentials).every(v => v.every(b => b === 0)))
})
test('owner failure still disposes and erases before its contained terminal', async () => {
  const f = fixture({ createWorker: async () => ({ core: { run: async () => ({ status: 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED' }) }, dispose: async () => {} }) })
  assert.equal((await worker.runOwnerSuccessorInjectedWorker(f.options)).status, 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED')
  assert.ok(Object.values(f.credentials).every(v => v.every(b => b === 0)))
})
test('backwards clock and cancellation at late credential settlement deny and erase', async () => {
  for (const cancelled of [true, false]) {
    const f = fixture(); let current = at
    f.options.now = () => current
    f.options.readCredentials = async () => { if (cancelled) f.controller.abort(); else current--; return f.credentials }
    assert.equal((await worker.runOwnerSuccessorInjectedWorker(f.options)).status, 'HOLD_RECONCILE')
    assert.ok(!f.events.includes('created')); assert.ok(Object.values(f.credentials).every(v => v.every(b => b === 0)))
  }
})
test('assembly failure disposes once, erases and never emits a receipt', async () => {
  let disposed = 0
  const f = fixture({ createWorker: async () => ({ core: { run: async () => { throw Error('uncertain') } }, dispose: async () => disposed++ }) })
  assert.equal((await worker.runOwnerSuccessorInjectedWorker(f.options)).status, 'HOLD_RECONCILE')
  assert.equal(disposed, 1); assert.ok(!f.events.includes('written'))
  assert.ok(Object.values(f.credentials).every(v => v.every(b => b === 0)))
})
test('actual supervisor fd3 and exact secure-reader selectors accept synthetic transport bytes', async () => {
  const { mkdtemp, readFile, writeFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { pathToFileURL } = await import('node:url')
  const { runBoundedBrokerRotationWorker } = await import('../scripts/staging-provider-broker-rotation-process-control.mjs')
  const directory = await mkdtemp(join(tmpdir(), 'tll-successor-handshake-'))
  try {
    const credentialPath = join(directory, 'reader.mjs'), childPath = join(directory, 'child.mjs')
    const reader = (await readFile(new URL('../scripts/staging-generation-23-credential-reader.mjs', import.meta.url), 'utf8'))
      .replace('STAGING_GENERATION_23_CREDENTIAL_READER_ENABLED = false', 'STAGING_GENERATION_23_CREDENTIAL_READER_ENABLED = true')
    await writeFile(credentialPath, reader, { mode: 0o600 })
    await writeFile(childPath, `
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { runOwnerSuccessorInjectedWorker, OWNER_SUCCESSOR_SUPERVISOR_PROOF } from '${await modules.url('staging-owner-successor-worker-entry.mjs')}'
import { acceptSupervisorPipe } from '${new URL('../scripts/staging-provider-broker-recovery-process-control.mjs', import.meta.url).href}'
import { readStagingGeneration23Credentials } from '${pathToFileURL(credentialPath).href}'
let accepted = false, selectors = [], chunks = [], owned
const result = await runOwnerSuccessorInjectedWorker({ now: () => ${at}, signal: new AbortController().signal,
  accept: async () => { const release = await acceptSupervisorPipe({ proof: OWNER_SUCCESSOR_SUPERVISOR_PROOF }); accepted = true; return release },
  readSource: async () => (${JSON.stringify(proof())}),
  readCredentials: ({ signal }) => readStagingGeneration23Credentials({ signal, stopWorkerGroup: () => assert.fail('valid reader transport'),
    spawnProcess: (binary, args) => {
      assert.equal(accepted, true); assert.equal(binary, '/usr/bin/security')
      assert.deepEqual(args.slice(0, 3), ['find-generic-password', '-w', '-s'])
      selectors.push([args[3], args[5]])
      const value = args[3] === 'Supabase CLI' ? 'sbp_' + 'a'.repeat(40)
        : args[3] === 'TLL Hosted Baseline Vercel API' ? 'synthetic-vercel' : 'synthetic-bypass'
      const child = new EventEmitter(); child.stdout = new PassThrough(); child.kill = () => assert.fail('valid child')
      setImmediate(() => { const bytes = Buffer.from(value + '\\n'); chunks.push(bytes); child.stdout.write(bytes); child.emit('close', 0) })
      return child
    } }),
  createWorker: async credentials => { owned = credentials; return { core: { run: async () => ({ status: 'LOCAL_SEQUENCE_PASS' }) }, dispose: async () => {} } },
  write: async text => {
    assert.deepEqual(selectors, [['Supabase CLI','supabase'], ['TLL Hosted Baseline Vercel API','prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4'], ['TLL Hosted Baseline Preview Bypass','prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4']])
    assert.ok([...chunks, ...Object.values(owned)].every(b => b.every(v => v === 0)))
    process.stdout.write(text)
  },
})
if (result.status !== 'SYNTHETIC_SEQUENCE_PASS') process.exitCode = 1
`, { mode: 0o600 })
    const result = await runBoundedBrokerRotationWorker({ executable: process.execPath, args: [childPath],
      cwd: directory, env: { PATH: '/usr/bin:/bin', LANG: 'C' }, proof: worker.OWNER_SUCCESSOR_SUPERVISOR_PROOF,
      deadlineMs: 5000, maxOutputBytes: 1024, strictGroupCleanup: true })
    assert.equal(result.status, 'EXITED'); assert.equal(result.code, 0)
    const terminal = JSON.parse(result.output.toString()); result.output.fill(0)
    assert.equal(terminal.status, 'SYNTHETIC_SEQUENCE_PASS'); assert.equal(terminal.authorization, 'NONE')
  } finally { await rm(directory, { recursive: true, force: true }) }
})
test('extended supervisor ceiling remains limited to the exact reviewed worker/proof pairs', async () => {
  const { resolve } = await import('node:path')
  const { runBoundedBrokerRotationWorker, MAX_REVIEWED_EXTENDED_WORKER_MS } = await import('../scripts/staging-provider-broker-rotation-process-control.mjs')
  const { OWNER_SUCCESSOR_WORKER_PATH } = await import('../scripts/staging-owner-successor-process-binding.mjs')
  const common = { executable: process.execPath, cwd: resolve('.'), env: { PATH: '/usr/bin:/bin' },
    deadlineMs: 2000, deadlineCeilingMs: MAX_REVIEWED_EXTENDED_WORKER_MS,
    strictGroupCleanup: true, spawnProcess: () => assert.fail('invalid pair cannot spawn') }
  for (const input of [
    { args: [OWNER_SUCCESSOR_WORKER_PATH], proof: 'TLL_STAGING_GENERATION_23_WHOLE_SUPERVISOR_V1' },
    { args: ['/tmp/unreviewed-worker.mjs'], proof: worker.OWNER_SUCCESSOR_SUPERVISOR_PROOF },
    { args: [OWNER_SUCCESSOR_WORKER_PATH, '--extra'], proof: worker.OWNER_SUCCESSOR_SUPERVISOR_PROOF },
    { args: [OWNER_SUCCESSOR_WORKER_PATH], proof: worker.OWNER_SUCCESSOR_SUPERVISOR_PROOF, strictGroupCleanup: false },
  ]) assert.throws(() => runBoundedBrokerRotationWorker({ ...common, ...input }), /unavailable/)
})
test('parent rejects invalid or backwards terminal clocks and erases synthetic transport receipts', async () => {
  const { mkdtemp, readFile, writeFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { pathToFileURL } = await import('node:url')
  const context = await modules.import('staging-owner-successor-native-context.mjs')
  const identity = context.ownerSuccessorSourceIdentity(proof(), at)
  const directory = await mkdtemp(join(tmpdir(), 'tll-parent-clock-unit-'))
  const originalClock = Date.now
  const stub = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  try {
    for (const [index, bad] of [NaN, Infinity, at - 1].entries()) {
      let current = at
      Date.now = () => current
      const bytes = Buffer.from(JSON.stringify({ schema: worker.OWNER_SUCCESSOR_TERMINAL_SCHEMA,
        authorization: 'NONE', provenance: 'FIXED_NATIVE_PORTS', status: 'STAGING_SEQUENCE_PASS', identity }) + '\n')
      // Synthetic process/source transport receipts exercise only the parent
      // clock gate; they do not qualify any native composition or authority.
      globalThis.__tllClockFixture = { finish() { current = bad; return { status: 'EXITED', code: 0, output: bytes } } }
      let source = (await readFile(new URL('../scripts/staging-owner-successor-process-binding.mjs', import.meta.url), 'utf8'))
        .replace('OWNER_SUCCESSOR_NATIVE_PROCESS_BINDING_ENABLED = false', 'OWNER_SUCCESSOR_NATIVE_PROCESS_BINDING_ENABLED = true')
      const replacements = {
        './staging-provider-broker-rotation-process-control.mjs': stub('export const MAX_REVIEWED_EXTENDED_WORKER_MS=3598000; export async function runBoundedBrokerRotationWorker(){return globalThis.__tllClockFixture.finish()}'),
        './staging-owner-successor-source-proof.mjs': stub(`export async function readOwnerSuccessorArmingSourceFixed(){return ${JSON.stringify(proof())}}`),
        './staging-owner-successor-native-context.mjs': await modules.url('staging-owner-successor-native-context.mjs'),
        './staging-owner-successor-sql-context.mjs': await modules.url('staging-owner-successor-sql-context.mjs'),
        './staging-owner-successor-worker-entry.mjs': stub(`export const OWNER_SUCCESSOR_CLEANUP_SUPERVISOR_PROOF=${JSON.stringify(worker.OWNER_SUCCESSOR_CLEANUP_SUPERVISOR_PROOF)}; export const OWNER_SUCCESSOR_SUPERVISOR_PROOF=${JSON.stringify(worker.OWNER_SUCCESSOR_SUPERVISOR_PROOF)}; export const OWNER_SUCCESSOR_TERMINAL_SCHEMA=${JSON.stringify(worker.OWNER_SUCCESSOR_TERMINAL_SCHEMA)}; export function readOwnerSuccessorReviewHandoff(){return {reviewedBaseSha:'${'a'.repeat(40)}',manifestSha256:'${'c'.repeat(64)}'}}`),
      }
      for (const [from, to] of Object.entries(replacements)) source = source.replace(`from '${from}'`, `from '${to}'`)
      const path = join(directory, `parent-${index}.mjs`); await writeFile(path, source, { mode: 0o600 })
      const parent = await import(pathToFileURL(path).href)
      assert.deepEqual(await parent.runBoundedOwnerSuccessorWorker(), { status: 'HOLD_RECONCILE', authorization: 'NONE' })
      assert.ok(bytes.every(byte => byte === 0)); delete globalThis.__tllClockFixture
    }
  } finally { Date.now = originalClock; delete globalThis.__tllClockFixture; await rm(directory, { recursive: true, force: true }) }
})

test('actual rich core result projects only the fixed terminal and unknown results stay held', async () => {
  for (const status of ['LOCAL_SEQUENCE_PASS', 'HOLD_RECONCILE']) {
    const f = fixture({ createWorker: async () => ({ core: { run: async () => ({ status,
      completedPhases: 13, elapsedMs: 100, timeline: [{ phase: 'finalReadback', status: 'VERIFIED' }] }) }, dispose: async () => {} }) })
    const result = await worker.runOwnerSuccessorInjectedWorker(f.options)
    assert.equal(result.status, status === 'LOCAL_SEQUENCE_PASS' ? 'SYNTHETIC_SEQUENCE_PASS' : 'HOLD_RECONCILE')
    assert.equal(Object.hasOwn(result, 'timeline'), false)
    assert.equal(f.events.includes('written'), status === 'LOCAL_SEQUENCE_PASS')
  }
})

test('ordinary synthetic injection cannot choose cleanup-only status', async () => {
  const f = fixture({ cleanup: true, native: true, createWorker: async () => ({
    core: { run: async () => ({ status: 'CLEANUP_SEQUENCE_PASS' }) }, dispose: async () => {} }) })
  assert.equal((await worker.runOwnerSuccessorInjectedWorker(f.options)).status, 'HOLD_RECONCILE')
  assert.ok(!f.events.includes('written'))
})
