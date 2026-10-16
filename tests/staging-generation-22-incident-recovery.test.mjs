import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { runStagingGeneration22IncidentRecovery } from
  '../scripts/staging-generation-22-incident-recovery.mjs'

const source = new URL('../scripts/staging-generation-22-incident-recovery.mjs', import.meta.url)
const scripts = new URL('../scripts/', import.meta.url)
const tokenText = `sbp_${'a'.repeat(40)}`

async function armedFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'tll-gen22-incident-test-'))
  const path = join(directory, 'runner.mjs')
  const code = (await readFile(source, 'utf8'))
    .replace('export const STAGING_GENERATION_22_INCIDENT_RECOVERY_ENABLED = false',
      'export const STAGING_GENERATION_22_INCIDENT_RECOVERY_ENABLED = true')
    .replaceAll("from './", `from '${scripts.href}`)
  await writeFile(path, code)
  return { module: await import(pathToFileURL(path).href), directory }
}

test('incident retirement is disconnected by default and CLI cannot claim a record', async () => {
  await assert.rejects(runStagingGeneration22IncidentRecovery({ signal: new AbortController().signal }),
    /unavailable/)
  const result = spawnSync(process.execPath, [fileURLToPath(source)], { encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
})

test('isolated child uses a new journal path, one Supabase token and erases it', async () => {
  const fixture = await armedFixture()
  try {
    const token = Buffer.from(tokenText)
    const sequence = []
    let state
    const journal = {
      claim() { sequence.push('claim'); state = { state: 'CLAIMED' }; return state },
      dispatch(previous) { assert.equal(previous, state); sequence.push('dispatch'); state = { state: 'DISPATCHED' }; return state },
      confirm(previous, digest) { assert.equal(previous, state); assert.match(digest, /^[a-f0-9]{64}$/)
        sequence.push('confirm'); state = { state: 'FINISHED' }; return state },
      hold() { assert.fail('success must not hold') },
    }
    const result = await fixture.module.runStagingGeneration22IncidentRecovery({
      signal: new AbortController().signal,
      deadline: new Date(Date.now() + 60_000).toISOString(),
      readToken: async ({ selector }) => { assert.equal(selector, 'supabase'); sequence.push('token'); return token },
      createJournal: ({ path }) => {
        assert.match(path, /tll-generation-22-incident-retirement-v1\.json$/)
        assert.doesNotMatch(path, /tll-generation-22-recovery-dispatch-v1\.json$/)
        sequence.push('journal')
        return journal
      },
      postActive: async () => { sequence.push('active'); return [{}] },
      validateActive: () => { sequence.push('active-valid') },
      prepareRecovery: () => { sequence.push('prepare'); return {} },
      postRecovery: async () => { sequence.push('retire'); return [{}] },
      validateRecovery: () => { sequence.push('recovery-valid'); return { receiptSha256: 'b'.repeat(64) } },
      postRetired: async () => { sequence.push('retired'); return [{}] },
      validateRetired: () => { sequence.push('retired-valid') },
    })
    assert.equal(result, 'RECOVERY_VERIFIED')
    assert.deepEqual(sequence, ['token', 'journal', 'claim', 'active', 'active-valid', 'prepare',
      'dispatch', 'retire', 'recovery-valid', 'confirm', 'retired', 'retired-valid'])
    assert.ok(token.every(byte => byte === 0))
  } finally { await rm(fixture.directory, { recursive: true, force: true }) }
})

test('failed token read cannot create or claim an incident journal', async () => {
  const fixture = await armedFixture()
  try {
    const result = await fixture.module.runStagingGeneration22IncidentRecovery({
      signal: new AbortController().signal,
      deadline: new Date(Date.now() + 60_000).toISOString(),
      readToken: async () => { throw Error('prompt timed out') },
      createJournal: () => { assert.fail('journal must not be created') },
    })
    assert.equal(result, 'JOURNAL_UNCERTAIN')
  } finally { await rm(fixture.directory, { recursive: true, force: true }) }
})

test('active proof failure holds before dispatch; uncertain retirement holds after dispatch', async () => {
  const fixture = await armedFixture()
  try {
    for (const failAt of ['active', 'retire']) {
      const token = Buffer.from(tokenText)
      let state, dispatched = false
      const journal = {
        claim() { state = { state: 'CLAIMED' }; return state },
        dispatch() { dispatched = true; state = { state: 'DISPATCHED' }; return state },
        hold(previous) { assert.equal(previous, state); state = { state: 'HOLD' }; return state },
        confirm() { assert.fail('uncertain result must not confirm') },
      }
      const result = await fixture.module.runStagingGeneration22IncidentRecovery({
        signal: new AbortController().signal,
        deadline: new Date(Date.now() + 60_000).toISOString(),
        readToken: async () => token,
        createJournal: () => journal,
        postActive: async () => { if (failAt === 'active') throw Error('active query failed'); return [{}] },
        validateActive: () => {},
        prepareRecovery: () => ({}),
        postRecovery: async () => { throw Error('retirement reply lost') },
      })
      assert.equal(result, 'HOLD_RECONCILE')
      assert.equal(state.state, 'HOLD')
      assert.equal(dispatched, failAt === 'retire')
      assert.ok(token.every(byte => byte === 0))
    }
  } finally { await rm(fixture.directory, { recursive: true, force: true }) }
})

test('confirmed retirement with failed independent proof remains unverified', async () => {
  const fixture = await armedFixture()
  try {
    const token = Buffer.from(tokenText)
    let state
    const result = await fixture.module.runStagingGeneration22IncidentRecovery({
      signal: new AbortController().signal,
      deadline: new Date(Date.now() + 60_000).toISOString(),
      readToken: async () => token,
      createJournal: () => ({
        claim() { state = { state: 'CLAIMED' }; return state },
        dispatch() { state = { state: 'DISPATCHED' }; return state },
        confirm() { state = { state: 'FINISHED' }; return state },
      }),
      postActive: async () => [{}], validateActive: () => {},
      prepareRecovery: () => ({}), postRecovery: async () => [{}],
      validateRecovery: () => ({ receiptSha256: 'c'.repeat(64) }),
      postRetired: async () => { throw Error('read lost') },
    })
    assert.equal(result, 'RETIREMENT_UNVERIFIED')
    assert.equal(state.state, 'FINISHED')
    assert.ok(token.every(byte => byte === 0))
  } finally { await rm(fixture.directory, { recursive: true, force: true }) }
})

function fakeChild() {
  const child = new EventEmitter()
  child.pid = 123456
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.stdio = [null, child.stdout, child.stderr, new PassThrough()]
  child.unref = () => {}
  return child
}

test('parent accepts only the exact successful child terminal', async () => {
  const fixture = await armedFixture()
  try {
    const child = fakeChild()
    const result = fixture.module.superviseStagingGeneration22IncidentRecovery({
      spawnProcess: (_node, args, options) => {
        assert.deepEqual(args.slice(1), ['--child'])
        assert.equal(options.detached, true)
        return child
      },
      killGroup: () => {},
    })
    child.stdout.write(Buffer.from('RECOVERY_VERIFIED\n'))
    child.emit('exit', 0)
    child.emit('close', 0)
    assert.equal(await result, 'RECOVERY_VERIFIED')
  } finally { await rm(fixture.directory, { recursive: true, force: true }) }
})

test('parent returns reconciliation even when an unresponsive child never closes', async () => {
  const fixture = await armedFixture()
  try {
    const child = fakeChild()
    const kills = []
    const started = Date.now()
    const result = await fixture.module.superviseStagingGeneration22IncidentRecovery({
      spawnProcess: () => child,
      killGroup: (_pid, signal) => kills.push(signal),
      timeoutMs: 5,
    })
    assert.equal(result, 'RECONCILIATION_REQUIRED')
    assert.deepEqual(kills, ['SIGTERM', 'SIGKILL'])
    assert.ok(Date.now() - started < 3_000)
  } finally { await rm(fixture.directory, { recursive: true, force: true }) }
})

test('parent rejects output overflow, stderr and spawn failure', async () => {
  const fixture = await armedFixture()
  try {
    for (const fault of ['overflow', 'stderr']) {
      const child = fakeChild()
      const result = fixture.module.superviseStagingGeneration22IncidentRecovery({
        spawnProcess: () => child, killGroup: () => {},
      })
      if (fault === 'overflow') child.stdout.write(Buffer.alloc(257, 65))
      else child.stderr.write(Buffer.from('unexpected stderr'))
      child.emit('exit', 1); child.emit('close', 1)
      assert.equal(await result, 'RECONCILIATION_REQUIRED')
    }
    assert.equal(await fixture.module.superviseStagingGeneration22IncidentRecovery({
      spawnProcess: () => { throw Error('spawn unavailable') },
    }), 'RECONCILIATION_REQUIRED')
  } finally { await rm(fixture.directory, { recursive: true, force: true }) }
})
