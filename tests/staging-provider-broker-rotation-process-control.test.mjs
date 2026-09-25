import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BROKER_ROTATION_MAX_WORKER_MS, BROKER_ROTATION_PROCESS_CONTROL_ENABLED,
  runBoundedBrokerRotationWorker } from '../scripts/staging-provider-broker-rotation-process-control.mjs'
import { acceptSupervisorPipe } from '../scripts/staging-provider-broker-recovery-process-control.mjs'

const options = args => ({ executable: process.execPath, args, cwd: process.cwd(),
  env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, proof: 'OFFLINE_ROTATION_PROOF',
  deadlineMs: 700, stopGraceMs: 500 })
const running = pid => {
  try { return !/^[Z]/.test(execFileSync('/bin/ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' }).trim()) }
  catch { return false }
}
async function stopped(pid) {
  for (let attempt = 0; attempt < 30 && running(pid); attempt++) await new Promise(resolve => setTimeout(resolve, 20))
  return !running(pid)
}

test('rotation supervisor remains offline and rejects unbounded deadlines', () => {
  assert.equal(BROKER_ROTATION_PROCESS_CONTROL_ENABLED, false)
  assert.equal(BROKER_ROTATION_MAX_WORKER_MS, 1_800_000)
  assert.throws(() => runBoundedBrokerRotationWorker({ ...options([]), deadlineMs: BROKER_ROTATION_MAX_WORKER_MS + 1 }), /unavailable/)
})
test('a stalled worker and its descendant are killed at the whole-process deadline', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'tll-rotation-process-')), 'child.pid')
  const program = 'const {spawn}=require("node:child_process");const fs=require("node:fs");'
    + 'const child=spawn("/bin/sleep",["30"],{stdio:"ignore"});'
    + 'fs.writeFileSync(process.argv[1],String(child.pid));setInterval(()=>{},1000)'
  const result = await runBoundedBrokerRotationWorker(options(['-e', program, file]))
  assert.equal(result.status, 'KILLED'); assert.equal(result.output, null)
  assert.equal(await stopped(Number(readFileSync(file, 'utf8'))), true)
})
test('a successful leader cannot leave an unawaited CLI descendant running', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'tll-rotation-success-')), 'child.pid')
  const moduleUrl = new URL('../scripts/staging-provider-broker-recovery-process-control.mjs', import.meta.url).href
  const program = `import(${JSON.stringify(moduleUrl)}).then(async m => {`
    + `const release=await m.acceptSupervisorPipe({proof:'OFFLINE_ROTATION_PROOF'});`
    + `const {spawn}=await import('node:child_process');const fs=await import('node:fs');`
    + `const child=spawn('/bin/sleep',['30'],{stdio:'ignore'});child.unref();`
    + `fs.writeFileSync(process.argv[1],String(child.pid));release();process.stdout.write('OK')})`
  const result = await runBoundedBrokerRotationWorker(options(['-e', program, file]))
  assert.equal(result.status, 'EXITED'); assert.equal(result.output.toString('utf8'), 'OK')
  result.output.fill(0)
  assert.equal(await stopped(Number(readFileSync(file, 'utf8'))), true)
})
test('an inherited stdout pipe cannot keep a descendant alive after leader exit', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'tll-rotation-inherited-pipe-')), 'child.pid')
  const moduleUrl = new URL('../scripts/staging-provider-broker-recovery-process-control.mjs', import.meta.url).href
  const program = `import(${JSON.stringify(moduleUrl)}).then(async m => {`
    + `const release=await m.acceptSupervisorPipe({proof:'OFFLINE_ROTATION_PROOF'});`
    + `const {spawn}=await import('node:child_process');const fs=await import('node:fs');`
    + `const child=spawn('/bin/sleep',['30'],{stdio:['ignore','inherit','ignore']});child.unref();`
    + `fs.writeFileSync(process.argv[1],String(child.pid));release();process.stdout.write('OK')})`
  const began = Date.now()
  const result = await runBoundedBrokerRotationWorker(options(['-e', program, file]))
  assert.equal(result.status, 'EXITED'); assert.equal(result.output.toString('utf8'), 'OK')
  result.output.fill(0)
  assert.ok(Date.now() - began < 500)
  assert.equal(await stopped(Number(readFileSync(file, 'utf8'))), true)
})
test('worker handshake stays compatible with the existing supervisor-loss watcher', async () => {
  // This short proof checks the shared fd-3 protocol without exercising Keychain or hosts.
  const moduleUrl = new URL('../scripts/staging-provider-broker-recovery-process-control.mjs', import.meta.url).href
  const program = `import(${JSON.stringify(moduleUrl)}).then(async m => {`
    + `const release=await m.acceptSupervisorPipe({proof:'OFFLINE_ROTATION_PROOF'});release();process.stdout.write('READY')})`
  const result = await runBoundedBrokerRotationWorker(options(['-e', program]))
  assert.equal(result.status, 'EXITED'); assert.equal(result.output.toString('utf8'), 'READY')
  result.output.fill(0)
  assert.equal(typeof acceptSupervisorPipe, 'function')
})
test('loss of the supervisor stops the worker and its descendant', async () => {
  const moduleUrl = new URL('../scripts/staging-provider-broker-recovery-process-control.mjs', import.meta.url).href
  const controlUrl = new URL('../scripts/staging-provider-broker-rotation-process-control.mjs', import.meta.url).href
  const worker = `import(${JSON.stringify(moduleUrl)}).then(async m => {`
    + `await m.acceptSupervisorPipe({proof:'OFFLINE_ROTATION_PROOF'});`
    + `const {spawn}=await import('node:child_process');const fs=await import('node:fs');`
    + `const child=spawn('/bin/sleep',['30'],{stdio:'ignore'});`
    + `fs.writeFileSync(process.argv[1],JSON.stringify({worker:process.pid,descendant:child.pid}));`
    + `setInterval(()=>{},1000)})`
  const supervisorCode = `import(${JSON.stringify(controlUrl)}).then(m => m.runBoundedBrokerRotationWorker({`
    + `executable:process.execPath,args:['-e',${JSON.stringify(worker)},process.argv[1]],`
    + `cwd:process.cwd(),env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},`
    + `proof:'OFFLINE_ROTATION_PROOF',deadlineMs:10000}))`
  const file = join(mkdtempSync(join(tmpdir(), 'tll-rotation-supervisor-loss-')), 'pids.json')
  const supervisor = spawn(process.execPath, ['-e', supervisorCode, file], { stdio: 'ignore' })
  let workerPid
  try {
    for (let attempt = 0; attempt < 100 && !existsSync(file); attempt++) await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(existsSync(file), true)
    const pids = JSON.parse(readFileSync(file, 'utf8'))
    workerPid = pids.worker
    supervisor.kill('SIGKILL')
    assert.equal(await stopped(pids.worker), true)
    assert.equal(await stopped(pids.descendant), true)
  } finally {
    supervisor.kill('SIGKILL')
    if (workerPid) { try { process.kill(-workerPid, 'SIGKILL') } catch {} }
  }
})
