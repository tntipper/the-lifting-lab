import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync,
  writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runStagingGeneration22Parent } from '../scripts/staging-generation-22-parent-launcher.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const networkDeny = fileURLToPath(new URL('./fixtures/staging-generation-22-network-deny.mjs', import.meta.url))

test('repository parent launcher exits disabled before creating a worker', async () => {
  let calls = 0
  await assert.rejects(runStagingGeneration22Parent({ signal: new AbortController().signal,
    createSpawner() { calls++ }, createSupervisor() { calls++ },
  }), /unavailable/)
  assert.equal(calls, 0)
  const path = join(root, 'scripts', 'staging-generation-22-parent-launcher.mjs')
  const child = spawnSync(process.execPath, [path], { encoding: 'utf8', timeout: 3_000,
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' } })
  assert.equal(child.status, 1)
  assert.equal(child.stdout, '')
  assert.equal(child.stderr, '')
})

test('copied parent launcher accepts only the fixed supervisor result shape', async t => {
  const fixture = isolatedSources(t)
  const { runStagingGeneration22Parent: run } = await import(pathToFileURL(join(
    fixture.directory, 'scripts', 'staging-generation-22-parent-launcher.mjs')).href)
  let started = 0
  const result = await run({ signal: new AbortController().signal,
    createSpawner() { return () => { started++ } },
    createSupervisor({ spawnWorker }) { spawnWorker(); return { async supervise() {
      return { status: 'VERIFIED_CONTROLS_DISABLED', projectRef: 'qdmvngjwkcsilzmqksme',
        generation: 22 }
    } } },
  })
  assert.equal(started, 1)
  assert.deepEqual(result, { status: 'VERIFIED_CONTROLS_DISABLED',
    projectRef: 'qdmvngjwkcsilzmqksme', generation: 22 })
  await assert.rejects(run({ signal: new AbortController().signal,
    createSpawner: () => () => {},
    createSupervisor: () => ({ supervise: async () => ({ ...result, unexpected: true }) }),
  }), /unavailable/)
  const cancelled = new AbortController()
  await assert.rejects(run({ signal: cancelled.signal,
    createSpawner: () => () => {},
    createSupervisor: () => ({ async supervise() {
      cancelled.abort()
      return result
    } }),
  }), /unavailable/)
})

test('rehearsal child denies unmocked fetch and socket connections', () => {
  const source = `import net from 'node:net';let denied=0;`
    + `for(const call of [()=>fetch('https://example.invalid'),()=>net.connect(443,'example.invalid')]){`
    + `try{await call()}catch(error){if(error.message==='Generation 22 rehearsal forbids network access')denied++}}`
    + `process.stdout.write(String(denied))`
  const child = spawnSync(process.execPath,
    ['--import', networkDeny, '--input-type=module', '-e', source], {
      encoding: 'utf8', timeout: 5_000,
      env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
    })
  assert.equal(child.status, 0, child.stderr.slice(-1_000))
  assert.equal(child.stdout, '2')
})
const activeFiles = Object.freeze([
  'material', 'credentials', 'journal', 'recovery-journal', 'database-host',
  'vercel-host', 'edge-host', 'vercel-config-host', 'poststage-readback',
  'connection-proof', 'setup-coordinator', 'recovery-host',
  'recovery-coordinator', 'worker-core', 'worker-assembly', 'recovery',
  'active-check', 'retired-check', 'readback', 'worker-entry',
  'process-binding', 'process-supervisor', 'keychain-reader',
  'supabase-query', 'recovery-query', 'active-query', 'retired-query',
  'parent-launcher',
])

function isolatedSources(t) {
  const directory = mkdtempSync(join(tmpdir(), 'tll-gen22-default-process-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  cpSync(join(root, 'scripts'), join(directory, 'scripts'), { recursive: true })
  symlinkSync(join(root, 'lib'), join(directory, 'lib'))
  symlinkSync(join(root, 'config'), join(directory, 'config'))
  symlinkSync(join(root, 'node_modules'), join(directory, 'node_modules'))
  const active = new Date(Date.now() + 30 * 60_000).toISOString().replace(/\.\d{3}Z$/, '.000Z')
  const recovery = new Date(Date.now() + 50 * 60_000).toISOString().replace(/\.\d{3}Z$/, '.000Z')
  for (const name of activeFiles) {
    const path = join(directory, 'scripts', `staging-generation-22-${name}.mjs`)
    let source = readFileSync(path, 'utf8')
    const updated = source.replace(/export const (STAGING_GENERATION_22_[A-Z_]+_ENABLED) = false/,
      'export const $1 = true')
    assert.notEqual(updated, source, `expected one gate in ${name}`)
    source = updated
    if (name === 'credentials') source = source.replace(
      "export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
      `export const ACTIVE_WINDOW_EXPIRES_AT = '${active}'`)
    if (name === 'recovery-journal') source = source.replace(
      "export const RECOVERY_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
      `export const RECOVERY_WINDOW_EXPIRES_AT = '${recovery}'`)
    if (name === 'journal' || name === 'recovery-journal') source = source.replace(
      "'../../implementation-state/staging/", "'../implementation-state/staging/")
    writeFileSync(path, source)
  }
  for (const [name, flag] of [
    ['vercel', 'HOSTED_BASELINE_VERCEL_BINDING_ENABLED'],
    ['supabase', 'HOSTED_BASELINE_SUPABASE_BINDING_ENABLED'],
  ]) {
    const path = join(directory, 'scripts', `staging-account-hosted-baseline-${name}.mjs`)
    const source = readFileSync(path, 'utf8')
    assert.ok(source.includes(`export const ${flag} = false`))
    writeFileSync(path, source.replace(`export const ${flag} = false`, `export const ${flag} = true`))
  }
  return { directory, active, recovery,
    assemblyUrl: pathToFileURL(join(directory, 'scripts', 'staging-generation-22-worker-assembly.mjs')).href }
}

test('real default components stop after one uncertain installation in an isolated process', t => {
  const fixture = isolatedSources(t)
  const source = `import {createStagingGeneration22WorkerAssembly as assemble,FIXED_GENERATION_22_PARTS as fixed}`
    + ` from ${JSON.stringify(fixture.assemblyUrl)};`
    + `let posts=0,fetches=0;const managementToken=Buffer.from('sbp_'+ 'a'.repeat(40));`
    + `const vercelToken=Buffer.from('fixture-vercel-token');`
    + `const parts={...fixed,async postCredential(){posts++;throw Error('reply lost')}};`
    + `const assembly=assemble({managementToken,vercelToken,parts,fetcher:async()=>{fetches++;throw Error('network forbidden')}});`
    + `const result=await assembly.core.run({signal:new AbortController().signal});assembly.dispose();`
    + `managementToken.fill(0);vercelToken.fill(0);`
    + `process.stdout.write(JSON.stringify({status:result.status,posts,fetches}));`
  const child = spawnSync(process.execPath, ['--import', networkDeny, '--input-type=module', '-e', source], {
    cwd: fixture.directory, encoding: 'utf8', timeout: 20_000,
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
  })
  assert.equal(child.status, 0, child.stderr.slice(-1_000))
  assert.deepEqual(JSON.parse(child.stdout), {
    status: 'SETUP_RECONCILIATION_REQUIRED', posts: 1, fetches: 0,
  })
  const record = JSON.parse(readFileSync(join(fixture.directory, 'implementation-state',
    'staging', 'tll-generation-22-dispatch-v1.json'), 'utf8'))
  assert.equal(record.state, 'HOLD')
  assert.equal(record.pending, 'DATABASE_CREDENTIALS')
  const recovery = JSON.parse(readFileSync(join(fixture.directory, 'implementation-state',
    'staging', 'tll-generation-22-recovery-dispatch-v1.json'), 'utf8'))
  assert.equal(recovery.state, 'CLAIMED')
})

test('real default components complete 22 writes, readback, five drained logins and retirement offline', t => {
  const fixture = isolatedSources(t)
  const runner = fileURLToPath(new URL('./fixtures/staging-generation-22-default-success.mjs', import.meta.url))
  const child = spawnSync(process.execPath, ['--import', networkDeny, runner, fixture.directory], {
    cwd: fixture.directory, encoding: 'utf8', timeout: 20_000,
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
  })
  assert.equal(child.status, 0, child.stderr.slice(-1_500))
  assert.deepEqual(JSON.parse(child.stdout), {
    status: 'DRAINED', writes: 22, logins: 5, closes: 5,
    activeBeforeRetirement: true, retirementBeforeFinalRead: true,
    readbackBeforeLogin: true, readbackCompleted: true,
    activeReadCompleted: true, finalReadCompleted: true,
  })
  const setup = JSON.parse(readFileSync(join(fixture.directory, 'implementation-state',
    'staging', 'tll-generation-22-dispatch-v1.json'), 'utf8'))
  const recovery = JSON.parse(readFileSync(join(fixture.directory, 'implementation-state',
    'staging', 'tll-generation-22-recovery-dispatch-v1.json'), 'utf8'))
  assert.equal(setup.state, 'FINISHED')
  assert.equal(recovery.state, 'FINISHED')
})

for (const [mode, expected] of [
  ['lost-middle', { status: 'SETUP_RECONCILIATION_REQUIRED', writes: 4,
    logins: 0, closes: 0, readbackCompleted: false,
    activeReadCompleted: false, finalReadCompleted: false,
    setupState: 'HOLD', recoveryState: 'CLAIMED' }],
  ['lost-retirement', { status: 'RECOVERY_RECONCILIATION_REQUIRED', writes: 22,
    logins: 5, closes: 5, readbackCompleted: true,
    activeReadCompleted: true, finalReadCompleted: false,
    setupState: 'FINISHED', recoveryState: 'HOLD' }],
]) test(`real default components hold after ${mode} without later actions`, t => {
  const fixture = isolatedSources(t)
  const runner = fileURLToPath(new URL('./fixtures/staging-generation-22-default-success.mjs', import.meta.url))
  const child = spawnSync(process.execPath, ['--import', networkDeny, runner, fixture.directory, mode], {
    cwd: fixture.directory, encoding: 'utf8', timeout: 20_000,
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
  })
  assert.equal(child.status, 0, child.stderr.slice(-1_500))
  const result = JSON.parse(child.stdout)
  for (const [key, value] of Object.entries(expected)) {
    if (key.endsWith('State')) continue
    assert.equal(result[key], value, key)
  }
  const setup = JSON.parse(readFileSync(join(fixture.directory, 'implementation-state',
    'staging', 'tll-generation-22-dispatch-v1.json'), 'utf8'))
  const recovery = JSON.parse(readFileSync(join(fixture.directory, 'implementation-state',
    'staging', 'tll-generation-22-recovery-dispatch-v1.json'), 'utf8'))
  assert.equal(setup.state, expected.setupState)
  assert.equal(recovery.state, expected.recoveryState)
})

for (const [mode, expectedStatus, expectedSetup, expectedRecovery] of [
  ['entry-success', 'VERIFIED_CONTROLS_DISABLED', 'FINISHED', 'FINISHED'],
  ['entry-lost-middle', 'CHILD_EXIT_RECONCILIATION_REQUIRED', 'HOLD', 'CLAIMED'],
  ['entry-transport-success', 'VERIFIED_CONTROLS_DISABLED', 'FINISHED', 'FINISHED'],
  ['entry-transport-lost-first', 'CHILD_EXIT_RECONCILIATION_REQUIRED', 'HOLD', 'CLAIMED'],
  ['entry-reader-second-fail', 'CHILD_EXIT_RECONCILIATION_REQUIRED', null, null],
]) test(`fixed parent and child accept ${mode} only after their local proof`, async t => {
  const fixture = isolatedSources(t)
  const runner = fileURLToPath(new URL('./fixtures/staging-generation-22-default-success.mjs', import.meta.url))
  const [{ createStagingGeneration22FixedSpawner: createSpawner,
    GENERATION_22_WORKER_ARGS },
  { createStagingGeneration22ProcessSupervisor: createSupervisor }] = await Promise.all([
    import(pathToFileURL(join(fixture.directory, 'scripts',
      'staging-generation-22-process-binding.mjs')).href),
    import(pathToFileURL(join(fixture.directory, 'scripts',
      'staging-generation-22-process-supervisor.mjs')).href),
  ])
  let workerPid, childStderr = ''
  t.after(() => { if (workerPid) { try { process.kill(-workerPid, 'SIGKILL') } catch {} } })
  const spawnWorker = createSpawner({ spawnProcess(executable, args, options) {
    assert.equal(executable, process.execPath)
    assert.deepEqual(args, GENERATION_22_WORKER_ARGS)
    assert.equal(options.detached, true)
    assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe', 'pipe'])
    assert.deepEqual(options.env, { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' })
    const child = spawn(executable,
      [GENERATION_22_WORKER_ARGS[0], '--import', networkDeny,
        runner, fixture.directory, mode], options)
    child.stderr.on('data', chunk => { childStderr += chunk.toString('utf8').slice(0, 1000) })
    workerPid = child.pid
    return child
  } })
  const supervisor = createSupervisor({ spawnWorker, timeoutMs: 20_000,
    termGraceMs: 100 })
  const result = await supervisor.supervise({ signal: new AbortController().signal })
  const setupPath = join(fixture.directory, 'implementation-state',
    'staging', 'tll-generation-22-dispatch-v1.json')
  const recoveryPath = join(fixture.directory, 'implementation-state',
    'staging', 'tll-generation-22-recovery-dispatch-v1.json')
  if (expectedSetup === null) {
    assert.equal(result.status, expectedStatus, childStderr)
    assert.equal(existsSync(setupPath), false)
    assert.equal(existsSync(recoveryPath), false)
    return
  }
  const setup = JSON.parse(readFileSync(setupPath, 'utf8'))
  const recovery = JSON.parse(readFileSync(recoveryPath, 'utf8'))
  assert.equal(result.status, expectedStatus,
    `${childStderr}\nsetup=${setup.state}/${setup.pending} recovery=${recovery.state}/${recovery.pending}`)
  assert.equal(setup.state, expectedSetup)
  assert.equal(recovery.state, expectedRecovery)
})

for (const [secondToken, expectedSetup] of [
  ['bad', null], ['fixture-vercel-token', 'HOLD'],
]) test(`fixed CLI uses copied Python helper and stops safely with ${secondToken}`, async t => {
  const fixture = isolatedSources(t)
  const entryPath = join(fixture.directory, 'scripts', 'staging-generation-22-worker-entry.mjs')
  const entry = readFileSync(entryPath, 'utf8')
  assert.ok(entry.includes('export const STAGING_GENERATION_22_WORKER_CLI_ENABLED = false'))
  writeFileSync(entryPath, entry.replace('export const STAGING_GENERATION_22_WORKER_CLI_ENABLED = false',
    'export const STAGING_GENERATION_22_WORKER_CLI_ENABLED = true'))
  const securityPath = join(fixture.directory, 'synthetic-security')
  const marker = join(fixture.directory, 'synthetic-helper-calls.txt')
  writeFileSync(securityPath, `#!/bin/sh
if [ "$1" != find-generic-password ] || [ "$2" != -w ] || [ "$3" != -s ] || [ "$5" != -a ]; then exit 9; fi
if [ "$4" = 'Supabase CLI' ] && [ "$6" = supabase ]; then
  printf 'supabase\\n' >> ${JSON.stringify(marker)}
  printf '%s' 'sbp_${'a'.repeat(40)}'
  exit 0
fi
if [ "$4" = 'TLL Hosted Baseline Vercel API' ] && [ "$6" = prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4 ]; then
  printf 'vercel\\n' >> ${JSON.stringify(marker)}
  printf '%s' '${secondToken}'
  exit 0
fi
exit 9
`, { mode: 0o700 })
  chmodSync(securityPath, 0o700)
  const helperPath = join(fixture.directory, 'scripts', 'staging-generation-22-keychain.py')
  const helper = readFileSync(helperPath, 'utf8')
  assert.ok(helper.includes('GENERATION_22_KEYCHAIN_ENABLED = False'))
  assert.ok(helper.includes('"/usr/bin/security"'))
  writeFileSync(helperPath, helper
    .replace('GENERATION_22_KEYCHAIN_ENABLED = False', 'GENERATION_22_KEYCHAIN_ENABLED = True')
    .replace('"/usr/bin/security"', JSON.stringify(securityPath)))
  const [{ createStagingGeneration22FixedSpawner: createSpawner,
    GENERATION_22_WORKER_ARGS },
  { createStagingGeneration22ProcessSupervisor: createSupervisor }] = await Promise.all([
    import(pathToFileURL(join(fixture.directory, 'scripts',
      'staging-generation-22-process-binding.mjs')).href),
    import(pathToFileURL(join(fixture.directory, 'scripts',
      'staging-generation-22-process-supervisor.mjs')).href),
  ])
  let workerPid
  t.after(() => { if (workerPid) { try { process.kill(-workerPid, 'SIGKILL') } catch {} } })
  const spawnWorker = createSpawner({ spawnProcess(executable, args, options) {
    assert.equal(executable, process.execPath)
    assert.deepEqual(args, GENERATION_22_WORKER_ARGS)
    assert.equal(options.detached, true)
    assert.deepEqual(options.env, { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' })
    const child = spawn(executable,
      [args[0], '--import', networkDeny, args[1]], options)
    workerPid = child.pid
    return child
  } })
  const supervisor = createSupervisor({ spawnWorker, timeoutMs: 10_000,
    termGraceMs: 100 })
  const result = await supervisor.supervise({ signal: new AbortController().signal })
  assert.equal(result.status, 'CHILD_EXIT_RECONCILIATION_REQUIRED')
  assert.equal(readFileSync(marker, 'utf8'), 'supabase\nvercel\n')
  const setupPath = join(fixture.directory, 'implementation-state', 'staging',
    'tll-generation-22-dispatch-v1.json')
  if (expectedSetup === null) assert.equal(existsSync(setupPath), false)
  else {
    const setup = JSON.parse(readFileSync(setupPath, 'utf8'))
    assert.equal(setup.state, expectedSetup)
    assert.equal(setup.pending, 'DATABASE_CREDENTIALS')
    const recovery = JSON.parse(readFileSync(join(fixture.directory, 'implementation-state',
      'staging', 'tll-generation-22-recovery-dispatch-v1.json'), 'utf8'))
    assert.equal(recovery.state, 'CLAIMED')
  }
})

test('copied fixed parent CLI reports reconciliation after its disabled child exits', t => {
  const fixture = isolatedSources(t)
  const parentPath = realpathSync(join(fixture.directory, 'scripts',
    'staging-generation-22-parent-launcher.mjs'))
  const source = readFileSync(parentPath, 'utf8')
  assert.ok(source.includes('export const STAGING_GENERATION_22_PARENT_CLI_ENABLED = false'))
  writeFileSync(parentPath, source.replace('export const STAGING_GENERATION_22_PARENT_CLI_ENABLED = false',
    'export const STAGING_GENERATION_22_PARENT_CLI_ENABLED = true'))
  const child = spawnSync(process.execPath, ['--import', networkDeny, parentPath], {
    cwd: fixture.directory, encoding: 'utf8', timeout: 5_000,
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
  })
  assert.equal(child.status, 1, `${child.stdout}\n${child.stderr.slice(-1_000)}`)
  assert.equal(child.stderr, '')
  assert.deepEqual(JSON.parse(child.stdout), {
    status: 'CHILD_EXIT_RECONCILIATION_REQUIRED',
    projectRef: 'qdmvngjwkcsilzmqksme', generation: 22,
  })
  assert.equal(existsSync(join(fixture.directory, 'implementation-state', 'staging',
    'tll-generation-22-dispatch-v1.json')), false)
  const extra = spawnSync(process.execPath, ['--import', networkDeny, parentPath, 'unexpected'], {
    cwd: fixture.directory, encoding: 'utf8', timeout: 5_000,
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
  })
  assert.equal(extra.status, 1)
  assert.equal(extra.stdout, '')
  assert.equal(extra.stderr, '')
})
