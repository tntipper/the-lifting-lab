import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { createStagingGeneration22FixedSpawner,
  GENERATION_22_WORKER_PATH, GENERATION_22_WORKER_PROOF } from '../scripts/staging-generation-22-process-binding.mjs'
import { acceptStagingGeneration22Supervisor } from '../scripts/staging-generation-22-worker-entry.mjs'

const scripts = new URL('../scripts/', import.meta.url)
const root = fileURLToPath(new URL('../', import.meta.url))
async function armedUrls() {
  const binding = (await readFile(new URL('staging-generation-22-process-binding.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_22_PROCESS_BINDING_ENABLED = false',
      'export const STAGING_GENERATION_22_PROCESS_BINDING_ENABLED = true')
    .replace("new URL('./staging-generation-22-worker-entry.mjs', import.meta.url)",
      JSON.stringify(new URL('staging-generation-22-worker-entry.mjs', scripts).href))
    .replace("resolve(import.meta.dirname, '..')", JSON.stringify(root))
  const bindingUrl = `data:text/javascript;base64,${Buffer.from(binding).toString('base64')}`
  const entry = (await readFile(new URL('staging-generation-22-worker-entry.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_22_WORKER_ENTRY_ENABLED = false',
      'export const STAGING_GENERATION_22_WORKER_ENTRY_ENABLED = true')
    .replace("from './staging-provider-broker-recovery-process-control.mjs'",
      `from '${new URL('staging-provider-broker-recovery-process-control.mjs', scripts).href}'`)
    .replace("from './staging-generation-22-process-binding.mjs'", `from '${bindingUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  const entryUrl = `data:text/javascript;base64,${Buffer.from(entry).toString('base64')}`
  return { bindingUrl, entryUrl }
}
async function armedSupervisor() {
  const credentials = (await readFile(new URL('staging-generation-22-credentials.mjs', scripts), 'utf8'))
    .replace("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
      "export const ACTIVE_WINDOW_EXPIRES_AT = '2026-09-26T10:50:00.000Z'")
    .replaceAll("from './", `from '${scripts.href}`)
  const credentialUrl = `data:text/javascript;base64,${Buffer.from(credentials).toString('base64')}`
  const recovery = (await readFile(new URL('staging-generation-22-recovery-journal.mjs', scripts), 'utf8'))
    .replace("export const RECOVERY_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
      "export const RECOVERY_WINDOW_EXPIRES_AT = '2026-09-26T11:30:00.000Z'")
    .replace("from './staging-generation-22-credentials.mjs'", `from '${credentialUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
    .replace('resolve(import.meta.dirname,', `resolve(${JSON.stringify(fileURLToPath(scripts))},`)
  const recoveryUrl = `data:text/javascript;base64,${Buffer.from(recovery).toString('base64')}`
  const source = (await readFile(new URL('staging-generation-22-process-supervisor.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_22_PROCESS_SUPERVISOR_ENABLED = false',
      'export const STAGING_GENERATION_22_PROCESS_SUPERVISOR_ENABLED = true')
    .replace("from './staging-generation-22-credentials.mjs'", `from '${credentialUrl}'`)
    .replace("from './staging-generation-22-recovery-journal.mjs'", `from '${recoveryUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  return (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`))
    .createStagingGeneration22ProcessSupervisor
}
function running(pid) {
  try {
    return !/^[Z]/.test(execFileSync('/bin/ps', ['-o', 'stat=', '-p', String(pid)],
      { encoding: 'utf8' }).trim())
  } catch { return false }
}
async function stopped(pid) {
  for (let attempt = 0; attempt < 50 && running(pid); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  return !running(pid)
}

test('fixed process binding and worker entry are disabled before a spawn or pipe read', () => {
  let spawned = false
  assert.throws(() => createStagingGeneration22FixedSpawner({
    spawnProcess() { spawned = true },
  }), /unavailable/)
  assert.throws(() => acceptStagingGeneration22Supervisor(), /unavailable/)
  assert.equal(spawned, false)
})

test('binding uses only the fixed worker, detached group and secret-free process inputs', async () => {
  const { bindingUrl } = await armedUrls()
  const { createStagingGeneration22FixedSpawner: create } = await import(bindingUrl)
  const child = new EventEmitter()
  child.pid = 49321
  child.stdio = [null, new PassThrough(), new PassThrough(), new PassThrough()]
  child.kill = () => {}
  let spawnOptions
  const stoppedGroups = []
  const spawnWorker = create({ spawnProcess(executable, args, options) {
    spawnOptions = { executable, args, options }
    return child
  }, killGroup(pid) { stoppedGroups.push(pid) } })
  assert.equal(spawnWorker(), child)
  assert.equal(spawnOptions.executable, process.execPath)
  assert.deepEqual(spawnOptions.args, [GENERATION_22_WORKER_PATH])
  assert.deepEqual(spawnOptions.options, {
    cwd: root, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, detached: true,
    stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
  })
  assert.equal(child.stdio[3].read().toString('utf8'), GENERATION_22_WORKER_PROOF)
  assert.equal(child.bindingFault, false)
  await assert.rejects(async () => spawnWorker(), /unavailable/)
  child.stdio[3].emit('error', new Error('synthetic pipe failure'))
  assert.equal(child.bindingFault, true)
  assert.deepEqual(stoppedGroups, [child.pid])
  child.emit('close', 0, null)
  child.stdio[3].emit('error', new Error('late closed-pipe event'))
  assert.deepEqual(stoppedGroups, [child.pid])
})

test('loss of the bound parent stops its real worker group and child helper', async t => {
  const { bindingUrl, entryUrl } = await armedUrls()
  const directory = mkdtempSync(join(tmpdir(), 'tll-gen22-parent-loss-'))
  const marker = join(directory, 'pids.json')
  let workerPid, helperPid
  const fixture = `const [{acceptStagingGeneration22Supervisor:accept},cp,fs]=await Promise.all([`
    + `import(${JSON.stringify(entryUrl)}),import('node:child_process'),import('node:fs')]);`
    + `await accept();const helper=cp.spawn('/bin/sleep',['30'],{stdio:'ignore'});`
    + `await new Promise((resolve,reject)=>{helper.once('spawn',resolve);helper.once('error',reject)});`
    + `fs.writeFileSync(process.argv[1]+'.tmp',JSON.stringify({worker:process.pid,helper:helper.pid}));`
    + `fs.renameSync(process.argv[1]+'.tmp',process.argv[1]);setInterval(()=>{},1000);`
  const parentCode = `const [m,cp]=await Promise.all([import(${JSON.stringify(bindingUrl)}),`
    + `import('node:child_process')]);`
    + `const spawnWorker=m.createStagingGeneration22FixedSpawner({spawnProcess(executable,args,options){`
    + `if(executable!==process.execPath||args.length!==1||args[0]!==m.GENERATION_22_WORKER_PATH`
    + `||options.detached!==true||options.stdio[3]!=='pipe'||Object.keys(options.env).sort().join('|')!=='LANG|PATH')`
    + `throw Error('wrong fixed child binding');`
    + `return cp.spawn(process.execPath,['--input-type=module','-e',${JSON.stringify(fixture)},process.argv[1]],options)}});`
    + `spawnWorker();setInterval(()=>{},1000);`
  const parent = spawn(process.execPath, ['--input-type=module', '-e', parentCode, marker],
    { stdio: 'ignore' })
  t.after(() => {
    parent.kill('SIGKILL')
    if (workerPid) { try { process.kill(-workerPid, 'SIGKILL') } catch {} }
    if (helperPid && running(helperPid)) { try { process.kill(helperPid, 'SIGKILL') } catch {} }
    rmSync(directory, { recursive: true, force: true })
  })
  for (let attempt = 0; attempt < 100 && !existsSync(marker); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.equal(existsSync(marker), true, 'worker must establish its supervisor pipe before test kill')
  const pids = JSON.parse(readFileSync(marker, 'utf8'))
  workerPid = pids.worker; helperPid = pids.helper
  assert.equal(Number.isSafeInteger(workerPid) && workerPid > 1, true)
  assert.equal(Number.isSafeInteger(helperPid) && helperPid > 1, true)
  assert.equal(Number(execFileSync('/bin/ps', ['-o', 'pgid=', '-p', String(workerPid)],
    { encoding: 'utf8' }).trim()), workerPid)
  parent.kill('SIGKILL')
  assert.equal(await stopped(workerPid), true)
  assert.equal(await stopped(helperPid), true)
})

test('hung connection close is contained by the real bound process group', async t => {
  const { bindingUrl, entryUrl } = await armedUrls()
  const { createStagingGeneration22FixedSpawner: createSpawner } = await import(bindingUrl)
  const createSupervisor = await armedSupervisor()
  const directory = mkdtempSync(join(tmpdir(), 'tll-gen22-hung-close-'))
  const marker = join(directory, 'pids.json')
  let workerPid, helperPid
  t.after(() => {
    if (workerPid) { try { process.kill(-workerPid, 'SIGKILL') } catch {} }
    if (helperPid && running(helperPid)) { try { process.kill(helperPid, 'SIGKILL') } catch {} }
    rmSync(directory, { recursive: true, force: true })
  })
  const fixture = `const [{acceptStagingGeneration22Supervisor:accept},cp,fs]=await Promise.all([`
    + `import(${JSON.stringify(entryUrl)}),import('node:child_process'),import('node:fs')]);`
    + `await accept();const helper=cp.spawn('/bin/sleep',['30'],{stdio:'ignore'});`
    + `await new Promise((resolve,reject)=>{helper.once('spawn',resolve);helper.once('error',reject)});`
    + `fs.writeFileSync(process.argv[1]+'.tmp',JSON.stringify({worker:process.pid,helper:helper.pid}));`
    + `fs.renameSync(process.argv[1]+'.tmp',process.argv[1]);`
    + `const runtime={close:()=>new Promise(()=>{})};await runtime.close();`
  const spawnWorker = createSpawner({ spawnProcess(_executable, _args, options) {
    const child = spawn(process.execPath, ['--input-type=module', '-e', fixture, marker], options)
    workerPid = child.pid
    return child
  } })
  const supervisor = createSupervisor({ spawnWorker,
    now: () => Date.parse('2026-09-26T10:00:00.000Z'),
    timeoutMs: 500, termGraceMs: 50 })
  const result = await supervisor.supervise({ signal: new AbortController().signal })
  assert.equal(existsSync(marker), true, 'connection fixture must reach the hung close')
  helperPid = JSON.parse(readFileSync(marker, 'utf8')).helper
  assert.equal(result.status, 'CHILD_EXIT_RECONCILIATION_REQUIRED')
  assert.equal(await stopped(workerPid), true)
  assert.equal(await stopped(helperPid), true)
})
