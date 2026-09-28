import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BROKER_RECOVERY_PROCESS_CONTROL_ENABLED, runBoundedDetachedWorker,
  terminateProcessGroup } from '../scripts/staging-provider-broker-recovery-process-control.mjs'

const options = args => ({ executable: process.execPath, args, cwd: process.cwd(),
  env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, proof: 'OFFLINE_TEST_PROOF',
  deadlineMs: 500, stopGraceMs: 500 })
const running = pid => {
  try { return !/^[Z]/.test(execFileSync('/bin/ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' }).trim()) }
  catch { return false }
}

test('process control targets a group, not only its leader', () => {
  assert.equal(BROKER_RECOVERY_PROCESS_CONTROL_ENABLED, false)
  const calls = []
  terminateProcessGroup(12345, (...args) => calls.push(args))
  assert.deepEqual(calls, [[-12345, 'SIGKILL']])
})

test('supervisor bounds a stalled worker startup without a success result', async () => {
  const start = Date.now()
  const result = await runBoundedDetachedWorker({ ...options(['-e', 'setInterval(() => {}, 1000)']),
    deadlineMs: 100 })
  assert.equal(result.status, 'KILLED')
  assert.equal(result.output, null)
  assert.ok(Date.now() - start < 2_000)
})

test('supervisor terminates a harmless worker and its descendant together', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'tll-process-group-')), 'child.pid')
  const program = 'const {spawn}=require("node:child_process");const fs=require("node:fs");'
    + 'const child=spawn("/bin/sleep",["30"],{stdio:"ignore"});'
    + 'fs.writeFileSync(process.argv[1],String(child.pid));setInterval(()=>{},1000)'
  const result = await runBoundedDetachedWorker(options(['-e', program, file]))
  assert.equal(result.status, 'KILLED')
  assert.equal(result.output, null)
  const descendantPid = Number(readFileSync(file, 'utf8'))
  for (let attempt = 0; attempt < 10 && running(descendantPid); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.equal(running(descendantPid), false)
})

test('a normal bounded worker returns only its capped output', async () => {
  const moduleUrl = new URL('../scripts/staging-provider-broker-recovery-process-control.mjs', import.meta.url).href
  const program = `import(${JSON.stringify(moduleUrl)}).then(async m => {`
    + `const release=await m.acceptSupervisorPipe({proof:'OFFLINE_TEST_PROOF'});`
    + `release();process.stdout.write('OK')})`
  const result = await runBoundedDetachedWorker(options(['-e', program]))
  assert.equal(result.status, 'EXITED')
  assert.equal(result.code, 0)
  assert.equal(result.output.toString('utf8'), 'OK')
  result.output.fill(0)
})

test('an interrupted supervisor causes its worker to stop its own process group', async () => {
  const moduleUrl = new URL('../scripts/staging-provider-broker-recovery-process-control.mjs', import.meta.url).href
  const worker = `import(${JSON.stringify(moduleUrl)}).then(async m => {`
    + `await m.acceptSupervisorPipe({proof:'OFFLINE_TEST_PROOF'});`
    + `const {spawn}=await import('node:child_process');const fs=await import('node:fs');`
    + `const child=spawn('/bin/sleep',['30'],{stdio:'ignore'});`
    + `fs.writeFileSync(process.argv[1]+'.tmp',JSON.stringify({worker:process.pid,descendant:child.pid}));`
    + `fs.renameSync(process.argv[1]+'.tmp',process.argv[1]);`
    + `setInterval(()=>{},1000)})`
  const supervisorCode = `import(${JSON.stringify(moduleUrl)}).then(m => m.runBoundedDetachedWorker({`
    + `executable:process.execPath,args:['-e',${JSON.stringify(worker)},process.argv[1]],`
    + `cwd:process.cwd(),env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},`
    + `proof:'OFFLINE_TEST_PROOF',deadlineMs:10000}))`
  for (const interruption of ['SIGTERM', 'SIGINT', 'SIGKILL']) {
    const file = join(mkdtempSync(join(tmpdir(), 'tll-supervisor-loss-')), 'pids.json')
    const supervisor = spawn(process.execPath, ['-e', supervisorCode, file], { stdio: 'ignore' })
    let workerPid
    try {
      for (let attempt = 0; attempt < 100 && !existsSync(file); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      assert.equal(existsSync(file), true)
      const pids = JSON.parse(readFileSync(file, 'utf8'))
      workerPid = pids.worker
      assert.equal(running(workerPid), true)
      supervisor.kill(interruption)
      for (let attempt = 0; attempt < 50 && (running(workerPid) || running(pids.descendant)); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      assert.equal(running(workerPid), false, interruption)
      assert.equal(running(pids.descendant), false, interruption)
    } finally {
      supervisor.kill('SIGKILL')
      if (workerPid) { try { process.kill(-workerPid, 'SIGKILL') } catch {} }
    }
  }
})
