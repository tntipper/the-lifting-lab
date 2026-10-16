import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { STAGING_GENERATION_23_PROCESS_BINDING_ENABLED,
  runBoundedStagingGeneration23WholeWorker, GENERATION_23_WHOLE_WORKER_DEADLINE_MS,
} from '../scripts/staging-generation-23-process-binding.mjs'
import { runStagingGeneration23WholeWorker } from '../scripts/staging-generation-23-worker-entry.mjs'
import { GENERATION_23_ORDERLY_ABORT_MS } from '../scripts/staging-generation-23-worker-entry.mjs'

const proof = 'TLL_STAGING_GENERATION_23_WHOLE_SUPERVISOR_V1'
const credentials = () => ({ managementToken: Buffer.from(`sbp_${'a'.repeat(40)}`),
  vercelToken: Buffer.from('local-vercel-token'), previewBypass: Buffer.from('local-preview-bypass') })
const controlUrl = new URL('../scripts/staging-provider-broker-recovery-process-control.mjs', import.meta.url).href
const rotationUrl = new URL('../scripts/staging-provider-broker-rotation-process-control.mjs', import.meta.url).href
const running = pid => {
  try { return !/^[Z]/.test(execFileSync('/bin/ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' }).trim()) }
  catch { return false }
}
async function stopped(pid) {
  for (let n = 0; n < 50 && running(pid); n++) await new Promise(resolve => setTimeout(resolve, 20))
  return !running(pid)
}
async function armedWorker() {
  const source = await readFile(new URL('../scripts/staging-generation-23-worker-entry.mjs', import.meta.url), 'utf8')
  const armed = source.replace('export const STAGING_GENERATION_23_WORKER_ENTRY_ENABLED = false',
    'export const STAGING_GENERATION_23_WORKER_ENTRY_ENABLED = true')
    .replaceAll("from './", `from '${new URL('../scripts/', import.meta.url).href}`)
  return (await import(`data:text/javascript;base64,${Buffer.from(armed).toString('base64')}`)).runStagingGeneration23WholeWorker
}
async function armedReader() {
  const source = await readFile(new URL('../scripts/staging-generation-23-credential-reader.mjs', import.meta.url), 'utf8')
  assert.match(source, /STAGING_GENERATION_23_CREDENTIAL_READER_ENABLED = false/)
  return import(`data:text/javascript;base64,${Buffer.from(source.replace(
    'STAGING_GENERATION_23_CREDENTIAL_READER_ENABLED = false',
    'STAGING_GENERATION_23_CREDENTIAL_READER_ENABLED = true')).toString('base64')}`)
}
async function armedBinding() {
  const source = await readFile(new URL('../scripts/staging-generation-23-process-binding.mjs', import.meta.url), 'utf8')
  const armed = source.replace('export const STAGING_GENERATION_23_PROCESS_BINDING_ENABLED = false',
    'export const STAGING_GENERATION_23_PROCESS_BINDING_ENABLED = true')
    .replace("new URL('./staging-generation-23-worker-entry.mjs', import.meta.url)",
      `new URL(${JSON.stringify(new URL('../scripts/staging-generation-23-worker-entry.mjs', import.meta.url).href)})`)
    .replace("const ROOT = resolve(import.meta.dirname, '..')", `const ROOT = ${JSON.stringify(process.cwd())}`)
    .replaceAll("from './", `from '${new URL('../scripts/', import.meta.url).href}`)
  return (await import(`data:text/javascript;base64,${Buffer.from(armed).toString('base64')}#${Math.random()}`)).runBoundedStagingGeneration23WholeWorker
}

test('ordinary Gen23 process source is OFF and starts neither worker nor hosted operation', async () => {
  assert.equal(STAGING_GENERATION_23_PROCESS_BINDING_ENABLED, false)
  await assert.rejects(runBoundedStagingGeneration23WholeWorker(), /unavailable/)
  await assert.rejects(runStagingGeneration23WholeWorker({ signal: new AbortController().signal,
    accept() { throw Error('must not run') }, readCredentials() {}, createWorker() {}, write() {} }), /unavailable/)
  assert.equal(spawnSync(process.execPath, [new URL('../scripts/staging-generation-23-worker-entry.mjs', import.meta.url).pathname],
    { encoding: 'utf8', timeout: 2_000, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' } }).status, 1)
})

test('injected worker needs FD3 proof and emits only the secret-free exact terminal', async () => {
  const run = await armedWorker(), output = []
  const owned = credentials()
  assert.equal(await run({ signal: new AbortController().signal,
    accept() { return () => output.push('released') },
    readCredentials() { return owned },
    createWorker(values) { assert.equal(values, owned); return { core: { run() { return { status: 'PASS_PARTIAL_LOCAL_COMPOSITE' } } },
      dispose() { output.push('disposed') } } },
    write(value) { output.push(value) },
  }), true)
  assert.deepEqual(output, ['disposed', '{"schema":"tll-staging-generation-23-whole-worker-terminal/v1","status":"PASS_PARTIAL_LOCAL_COMPOSITE","generation":23}\n', 'released'])
  assert.equal(Object.values(owned).every(value => value.every(byte => byte === 0)), true)
  assert.equal(await run({ signal: new AbortController().signal, accept() { throw Error('lost parent') },
    readCredentials() { throw Error('must not run') }, createWorker() {}, write() {} }), false)
})

test('child may report verified owner failure only after its worker has disposed', async () => {
  const run = await armedWorker(), output = []
  assert.equal(await run({ signal: new AbortController().signal, accept: () => () => {},
    readCredentials: credentials,
    createWorker: () => ({ core: { run: () => ({ status: 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED' }) },
      dispose: () => { output.push('disposed') } }),
    write: value => output.push(value),
  }), true)
  assert.equal(output[0], 'disposed')
  assert.deepEqual(JSON.parse(output[1]), { schema: 'tll-staging-generation-23-whole-worker-terminal/v1',
    status: 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED', generation: 23 })
})

test('offline three-selector reader feeds only the proved worker and credentials are erased', async () => {
  const run = await armedWorker()
  const { readStagingGeneration23Credentials } = await armedReader()
  const byService = new Map([
    ['Supabase CLI', `sbp_${'a'.repeat(40)}`],
    ['TLL Hosted Baseline Vercel API', 'local-vercel-token'],
    ['TLL Hosted Baseline Preview Bypass', 'local-preview-bypass'],
  ])
  const selectors = [], owned = [], output = []
  const spawnProcess = (_program, args) => {
    selectors.push(args[3])
    const child = new EventEmitter(), stdout = new EventEmitter()
    stdout.destroy = () => {}
    child.stdout = stdout
    child.kill = () => {}
    queueMicrotask(() => {
      stdout.emit('data', Buffer.from(`${byService.get(args[3])}\n`))
      child.emit('close', 0)
    })
    return child
  }
  assert.equal(await run({ signal: new AbortController().signal,
    accept: () => () => {},
    readCredentials: ({ signal }) => readStagingGeneration23Credentials({ signal,
      stopWorkerGroup() { throw Error('unexpected stop') }, spawnProcess }),
    createWorker(values) {
      owned.push(...Object.values(values))
      return { core: { run: () => ({ status: 'PASS_PARTIAL_LOCAL_COMPOSITE' }) }, dispose() {} }
    },
    write: value => output.push(value),
  }), true)
  assert.deepEqual(selectors, [...byService.keys()])
  assert.equal(owned.length, 3)
  assert.equal(owned.every(value => value.every(byte => byte === 0)), true)
  assert.deepEqual(output, ['{"schema":"tll-staging-generation-23-whole-worker-terminal/v1","status":"PASS_PARTIAL_LOCAL_COMPOSITE","generation":23}\n'])
})

test('invalid credentials and failed disposal cannot publish a success terminal', async () => {
  const run = await armedWorker()
  const invalid = credentials(); invalid.previewBypass = Buffer.from('bad value')
  let constructed = false, wrote = false
  assert.equal(await run({ signal: new AbortController().signal, accept: () => () => {},
    readCredentials: () => invalid, createWorker: () => { constructed = true }, write: () => { wrote = true } }), false)
  assert.equal(constructed, false); assert.equal(wrote, false)
  assert.equal(Object.values(invalid).every(value => value.every(byte => byte === 0)), true)
  const valid = credentials()
  assert.equal(await run({ signal: new AbortController().signal, accept: () => () => {},
    readCredentials: () => valid, createWorker: () => ({ core: { run: () => ({ status: 'PASS_PARTIAL_LOCAL_COMPOSITE' }) },
      dispose: () => { throw Error('not erased') } }), write: () => { wrote = true } }), false)
  assert.equal(wrote, false)
  assert.equal(Object.values(valid).every(value => value.every(byte => byte === 0)), true)
})

test('worker requests orderly cancellation before the parent hard stop', async () => {
  assert.equal(GENERATION_23_ORDERLY_ABORT_MS, 3_480_000)
  const run = await armedWorker()
  let aborted = false, wrote = false
  const owned = credentials()
  assert.equal(await run({ deadlineMs: 20, signal: new AbortController().signal,
    accept() { return () => {} },
    readCredentials: () => owned,
    createWorker: () => ({ core: { run({ signal }) { return new Promise(resolve => {
      signal.addEventListener('abort', () => { aborted = true; resolve({ status: 'PASS_PARTIAL_LOCAL_COMPOSITE' }) }, { once: true })
    }) } }, dispose() {} }), write() { wrote = true } }), false)
  assert.equal(aborted, true)
  assert.equal(wrote, false)
  assert.equal(Object.values(owned).every(value => value.every(byte => byte === 0)), true)
})

test('parent accepts one clean exact terminal and never replays the fixed child', async () => {
  const run = await armedBinding()
  await assert.rejects(run({ deadlineMs: 1_000 }), /unavailable/)
  const program = `import(${JSON.stringify(controlUrl)}).then(async m=>{const release=await m.acceptSupervisorPipe({proof:${JSON.stringify(proof)}});release();process.stdout.write('{"schema":"tll-staging-generation-23-whole-worker-terminal/v1","status":"PASS_PARTIAL_LOCAL_COMPOSITE","generation":23}')})`
  const result = await run({ deadlineMs: 1_000, spawnProcess(executable, _args, options) {
    return spawn(executable, ['-e', program], options)
  } })
  assert.deepEqual(result, { status: 'VERIFIED_LOCAL_WHOLE_PROCESS' })
  await assert.rejects(run({ deadlineMs: 1_000 }), /unavailable/)
})

test('parent distinguishes a verified hosted route from local rehearsal', async () => {
  const run = await armedBinding()
  const program = `import(${JSON.stringify(controlUrl)}).then(async m=>{const release=await m.acceptSupervisorPipe({proof:${JSON.stringify(proof)}});release();process.stdout.write('{"schema":"tll-staging-generation-23-whole-worker-terminal/v1","status":"STAGING_SEQUENCE_PASS","generation":23}')})`
  const result = await run({ deadlineMs: 1_000, spawnProcess(executable, _args, options) {
    return spawn(executable, ['-e', program], options)
  } })
  assert.deepEqual(result, { status: 'VERIFIED_STAGING_WHOLE_PROCESS' })
})

test('parent reports a verified owner failure with completed shutdown as a failure', async () => {
  const run = await armedBinding()
  const program = `import(${JSON.stringify(controlUrl)}).then(async m=>{const release=await m.acceptSupervisorPipe({proof:${JSON.stringify(proof)}});release();process.stdout.write('{"schema":"tll-staging-generation-23-whole-worker-terminal/v1","status":"OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED","generation":23}')})`
  const result = await run({ deadlineMs: 1_000, spawnProcess(executable, _args, options) {
    return spawn(executable, ['-e', program], options)
  } })
  assert.deepEqual(result, { status: 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED' })
})

test('Gen23 hard parent kill occurs before one hour and kills a stuck child group', async () => {
  assert.equal(GENERATION_23_WHOLE_WORKER_DEADLINE_MS, 3_598_000)
  const file = join(mkdtempSync(join(tmpdir(), 'tll-gen23-stuck-')), 'child.pid')
  const worker = `import(${JSON.stringify(controlUrl)}).then(async m=>{await m.acceptSupervisorPipe({proof:${JSON.stringify(proof)}});const {spawn}=await import('node:child_process');const fs=await import('node:fs');const c=spawn('/bin/sleep',['30'],{stdio:'ignore'});fs.writeFileSync(process.argv[1],String(c.pid));setInterval(()=>{},1000)})`
  const result = await (await import(rotationUrl)).runBoundedBrokerRotationWorker({
    executable: process.execPath, args: ['-e', worker, file], cwd: process.cwd(),
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, proof, deadlineMs: 250, stopGraceMs: 250,
    strictGroupCleanup: true,
  })
  assert.equal(result.status, 'KILLED')
  assert.equal(await stopped(Number(readFileSync(file, 'utf8'))), true)
})

test('parent loss closes FD3 and kills the worker group before it can publish a terminal', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'tll-gen23-parent-loss-')), 'pids.json')
  const worker = `import(${JSON.stringify(controlUrl)}).then(async m=>{await m.acceptSupervisorPipe({proof:${JSON.stringify(proof)}});const {spawn}=await import('node:child_process');const fs=await import('node:fs');const c=spawn('/bin/sleep',['30'],{stdio:'ignore'});fs.writeFileSync(process.argv[1],JSON.stringify({worker:process.pid,descendant:c.pid}));await new Promise(()=>{});process.stdout.write('unexpected')})`
  const supervisor = spawn(process.execPath, ['-e', `import(${JSON.stringify(rotationUrl)}).then(m=>m.runBoundedBrokerRotationWorker({executable:process.execPath,args:['-e',${JSON.stringify(worker)},process.argv[1]],cwd:process.cwd(),env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},proof:${JSON.stringify(proof)},deadlineMs:10000,strictGroupCleanup:true}))`, file], { stdio: 'ignore' })
  try {
    for (let n = 0; n < 100 && !existsSync(file); n++) await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(existsSync(file), true)
    const pids = JSON.parse(readFileSync(file, 'utf8'))
    supervisor.kill('SIGKILL')
    assert.equal(await stopped(pids.worker), true)
    assert.equal(await stopped(pids.descendant), true)
  } finally { supervisor.kill('SIGKILL') }
})
