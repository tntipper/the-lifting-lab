import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runBoundedBrokerRotationWorker } from '../scripts/staging-provider-broker-rotation-process-control.mjs'

const proof = 'OFFLINE_REST_WORKER_PROOF'
const hostUrl = new URL('../scripts/staging-provider-broker-supabase-rest-host.mjs', import.meta.url).href
const rotationUrl = new URL('../scripts/staging-provider-broker-rotation.mjs', import.meta.url).href
const controlUrl = new URL('../scripts/staging-provider-broker-recovery-process-control.mjs', import.meta.url).href

function running(pid) {
  assert.equal(Number.isSafeInteger(pid) && pid > 1, true, 'process ID must be valid')
  try { return !/^[Z]/.test(execFileSync('/bin/ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' }).trim()) }
  catch (error) { if (error?.status === 1 && !error?.code) return false; throw error }
}

async function stopped(pid) {
  for (let attempt = 0; attempt < 30 && running(pid); attempt++) await new Promise(resolve => setTimeout(resolve, 20))
  return !running(pid)
}

test('an uncertain REST write stops its real worker group and leaves no child running', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'tll-rest-worker-'))
  const marker = join(directory, 'started.json')
  t.after(() => {
    if (existsSync(marker)) {
      try {
        const pids = JSON.parse(readFileSync(marker, 'utf8'))
        if (Number.isSafeInteger(pids.worker) && pids.worker > 1 && running(pids.worker)) process.kill(-pids.worker, 'SIGKILL')
        if (Number.isSafeInteger(pids.child) && pids.child > 1 && running(pids.child)) process.kill(pids.child, 'SIGKILL')
      } catch { /* best-effort cleanup of synthetic processes */ }
    }
    rmSync(directory, { recursive: true, force: true })
  })
  const program = `const [control,host,rotation,fs,children]=await Promise.all([`
    + `import(${JSON.stringify(controlUrl)}),import(${JSON.stringify(hostUrl)}),`
    + `import(${JSON.stringify(rotationUrl)}),import('node:fs'),import('node:child_process')]);`
    + `await control.acceptSupervisorPipe({proof:${JSON.stringify(proof)}});`
    + `const child=children.spawn('/bin/sleep',['30'],{stdio:'ignore'});`
    + `await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)});`
    + `if(!Number.isSafeInteger(child.pid)||child.pid<2)throw Error('child did not start');`
    + `process.kill(child.pid,0);`
    + `const pids={worker:process.pid,child:child.pid};`
    + `fs.writeFileSync(process.argv[1],JSON.stringify({...pids,stopCalled:false}));`
    + `const client=host.createStagingProviderBrokerSupabaseRestHost({`
    + `managementToken:Buffer.from('fixture-supabase-token'),`
    + `fetch:async()=>{throw Error('reply lost after acceptance')},`
    + `stopWorkerGroup:()=>control.terminateProcessGroup(process.pid,(target,sig)=>{`
    + `fs.writeFileSync(process.argv[1],JSON.stringify({...pids,stopCalled:true,killTarget:target,killSignal:sig}));`
    + `process.kill(target,sig)})});`
    + `await client.stage(rotation.STAGING_PROVIDER_TARGET,rotation.BROKER_SECRET_NAME,`
    + `Buffer.from('x'.repeat(48)),{signal:new AbortController().signal});`
    + `process.stdout.write('UNEXPECTED_SUCCESS');`
  const startedAt = Date.now()
  const result = await runBoundedBrokerRotationWorker({ executable: process.execPath,
    args: ['--input-type=module', '-e', program, marker], cwd: process.cwd(),
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, proof, deadlineMs: 5_000, stopGraceMs: 500 })
  assert.equal(result.status, 'KILLED')
  assert.equal(result.output, null)
  assert.ok(Date.now() - startedAt < 4_000, 'host stop must precede the parent deadline')
  const pids = JSON.parse(readFileSync(marker, 'utf8'))
  assert.equal(Number.isSafeInteger(pids.worker) && pids.worker > 1, true)
  assert.equal(Number.isSafeInteger(pids.child) && pids.child > 1, true)
  assert.equal(pids.stopCalled, true, 'REST host must invoke the real group-stop callback')
  assert.equal(pids.killTarget, -pids.worker, 'worker must request a group kill, not a leader-only kill')
  assert.equal(pids.killSignal, 'SIGKILL')
  assert.equal(await stopped(pids.worker), true)
  assert.equal(await stopped(pids.child), true)
})
