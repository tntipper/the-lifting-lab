import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { createStagingGeneration22ProcessSupervisor } from '../scripts/staging-generation-22-process-supervisor.mjs'

const terminal = { schema: 'tll-staging-generation-22-worker-terminal/v1', status: 'DRAINED',
  projectRef: 'qdmvngjwkcsilzmqksme', generation: 22,
  windowId: '9a539def-bf3c-442c-bf06-c4bd1df39543',
  setupStatus: 'SETTINGS_AND_CONNECTIONS_VERIFIED', recoveryStatus: 'RECOVERY_VERIFIED' }
const now = () => Date.parse('2026-09-26T10:00:00.000Z')
async function armed() {
  const scripts = new URL('../scripts/', import.meta.url)
  let credential = await readFile(new URL('staging-generation-22-credentials.mjs', scripts), 'utf8')
  credential = credential.replace("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
    "export const ACTIVE_WINDOW_EXPIRES_AT = '2026-09-26T10:50:00.000Z'")
    .replaceAll("from './", `from '${scripts.href}`)
  const credentialUrl = `data:text/javascript;base64,${Buffer.from(credential).toString('base64')}`
  let recovery = await readFile(new URL('staging-generation-22-recovery-journal.mjs', scripts), 'utf8')
  recovery = recovery.replace("export const RECOVERY_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
    "export const RECOVERY_WINDOW_EXPIRES_AT = '2026-09-26T11:30:00.000Z'")
    .replace("from './staging-generation-22-credentials.mjs'", `from '${credentialUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
    .replace('resolve(import.meta.dirname,', `resolve(${JSON.stringify(fileURLToPath(scripts))},`)
  const recoveryUrl = `data:text/javascript;base64,${Buffer.from(recovery).toString('base64')}`
  let source = await readFile(new URL('staging-generation-22-process-supervisor.mjs', scripts), 'utf8')
  source = source.replace('export const STAGING_GENERATION_22_PROCESS_SUPERVISOR_ENABLED = false',
    'export const STAGING_GENERATION_22_PROCESS_SUPERVISOR_ENABLED = true')
    .replace("from './staging-generation-22-credentials.mjs'", `from '${credentialUrl}'`)
    .replace("from './staging-generation-22-recovery-journal.mjs'", `from '${recoveryUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  return (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`))
    .createStagingGeneration22ProcessSupervisor
}

function child() {
  const value = new EventEmitter()
  value.pid = 49321
  value.stdout = new PassThrough()
  value.stderr = new PassThrough()
  return value
}

test('disabled parent starts no worker', () => {
  let spawned = 0
  assert.throws(() => createStagingGeneration22ProcessSupervisor({
    spawnWorker() { spawned++ },
  }), /unavailable/)
  assert.equal(spawned, 0)
})

test('exact secret-free terminal and zero exit are accepted only after child close', async () => {
  const create = await armed(), worker = child()
  const supervisor = create({ spawnWorker: () => worker, now, timeoutMs: 100,
    killGroup() { throw new Error('unexpected kill') } })
  const pending = supervisor.supervise({ signal: new AbortController().signal })
  worker.stdout.write(Buffer.from(JSON.stringify(terminal) + '\n'))
  let settled = false
  void pending.then(() => { settled = true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(settled, false)
  worker.emit('close', 0, null)
  assert.equal((await pending).status, 'VERIFIED_CONTROLS_DISABLED')
  await assert.rejects(supervisor.supervise({ signal: new AbortController().signal }), /unavailable/)
})

test('child ignoring TERM is KILLed as a group and parent waits for close', async () => {
  const create = await armed(), worker = child(), signals = []
  const supervisor = create({ spawnWorker: () => worker, now, timeoutMs: 5, termGraceMs: 5,
    killGroup(pid, signal) { signals.push([pid, signal]) } })
  const pending = supervisor.supervise({ signal: new AbortController().signal })
  let settled = false
  void pending.then(() => { settled = true })
  await new Promise(resolve => setTimeout(resolve, 30))
  assert.deepEqual(signals, [[worker.pid, 'SIGTERM'], [worker.pid, 'SIGKILL']])
  assert.equal(settled, false)
  worker.emit('close', null, 'SIGKILL')
  assert.equal((await pending).status, 'CHILD_EXIT_RECONCILIATION_REQUIRED')
})

test('backwards wall time cannot accept a child after monotonic budget expires', async () => {
  const create = await armed(), worker = child(), signals = []
  const start = Date.parse('2026-09-26T10:00:00.000Z')
  let wallReads = 0, mono = 0
  const supervisor = create({ spawnWorker: () => worker,
    now: () => wallReads++ === 0 ? start : start - 60_000,
    monotonicNow: () => mono, timeoutMs: 5, termGraceMs: 5,
    killGroup(_pid, signal) { signals.push(signal) } })
  const pending = supervisor.supervise({ signal: new AbortController().signal })
  worker.stdout.write(Buffer.from(JSON.stringify(terminal) + '\n'))
  mono = 100
  await new Promise(resolve => setTimeout(resolve, 30))
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL'])
  worker.emit('close', 0, null)
  assert.equal((await pending).status, 'CHILD_EXIT_RECONCILIATION_REQUIRED')
})

test('abort prevents a late PASS even if the child prints a valid terminal and exits zero', async () => {
  const create = await armed(), worker = child(), parent = new AbortController()
  const signals = []
  const supervisor = create({ spawnWorker: () => worker, now, timeoutMs: 100,
    killGroup(_pid, signal) { signals.push(signal) } })
  const pending = supervisor.supervise({ signal: parent.signal })
  parent.abort()
  worker.stdout.write(Buffer.from(JSON.stringify(terminal) + '\n'))
  worker.emit('close', 0, null)
  assert.equal((await pending).status, 'CHILD_EXIT_RECONCILIATION_REQUIRED')
  assert.deepEqual(signals, ['SIGTERM'])
})

test('oversized and duplicate-key output cannot become a terminal receipt', async () => {
  const create = await armed()
  for (const output of ['X'.repeat(1_025), JSON.stringify(terminal)
    .replace('"status":"DRAINED"', '"status":"DRAINED","status":"DRAINED"')]) {
    const worker = child()
    const supervisor = create({ spawnWorker: () => worker, now, timeoutMs: 100,
      killGroup() {} })
    const pending = supervisor.supervise({ signal: new AbortController().signal })
    worker.stdout.write(Buffer.from(output))
    worker.emit('close', 0, null)
    assert.equal((await pending).status, 'CHILD_EXIT_RECONCILIATION_REQUIRED')
  }
})

test('close failure, bad terminal and secret-bearing output never become success', async () => {
  const create = await armed()
  for (const scenario of ['close-failure', 'wrong-terminal', 'secret-output']) {
    const worker = child(), signals = []
    const supervisor = create({ spawnWorker: () => worker, now, timeoutMs: 100,
      termGraceMs: 5, killGroup(_pid, signal) { signals.push(signal) } })
    const pending = supervisor.supervise({ signal: new AbortController().signal })
    if (scenario === 'wrong-terminal') worker.stdout.write(Buffer.from(JSON.stringify({
      ...terminal, recoveryStatus: 'HOLD_RECONCILE' }) + '\n'))
    if (scenario === 'secret-output') worker.stdout.write(Buffer.from(
      JSON.stringify({ ...terminal, leakedPassword: 'SENTINEL-SECRET' }) + '\n'))
    if (scenario === 'close-failure') worker.stderr.write(Buffer.from('synthetic close failure'))
    await new Promise(resolve => setImmediate(resolve))
    worker.emit('close', scenario === 'wrong-terminal' ? 0 : 1, null)
    assert.equal((await pending).status, 'CHILD_EXIT_RECONCILIATION_REQUIRED')
    if (scenario === 'close-failure') assert.ok(signals.includes('SIGTERM'))
  }
})
