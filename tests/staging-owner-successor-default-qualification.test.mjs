// Full finite rehearsal: node --test tests/staging-owner-successor-default-qualification.test.mjs
// Only HTTP/browser/CLI/credential/toolchain transports are synthetic; all native factories, journals and SQL are actual.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
const dockerAbsent = spawnSync('docker', ['--version'], { timeout: 5000, stdio: 'ignore' }).error?.code === 'ENOENT'
import { createSuccessorDefaultQualificationSource } from './fixtures/owner-successor-default-qualification.mjs'

test('exact policy arms a disposable direct child and constructs every actual default component without factory injection', async () => {
  const copy = createSuccessorDefaultQualificationSource()
  try {
    const { verifyOwnerSuccessorArmingSource, OWNER_SUCCESSOR_SOURCE_SCHEMA } = await copy.import('staging-owner-successor-source-proof.mjs')
    const gates = Object.freeze(Object.fromEntries(Object.entries(copy.policy.gates).map(([path, names]) => [path, Object.freeze(names)])))
    const policy = Object.freeze({ ...copy.policy, schema: OWNER_SUCCESSOR_SOURCE_SCHEMA,
      reviewedBaseSha: copy.proof.sourceCommit, manifestSha256: copy.proof.manifestSha256, gates })
    const runGit = args => Buffer.from(args[0] === 'ls-remote'
      ? `${copy.proof.sourceCommit}\trefs/heads/codex/tll-integration\n` : `${copy.git(args)}${['show', 'diff-tree', 'ls-tree', 'status'].includes(args[0]) ? '' : '\n'}`)
    // Binary commands need their literal trailing NUL/newline; the helper's line runner intentionally trims.
    const { execFileSync } = await import('node:child_process')
    const rawGit = args => args[0] === 'ls-remote' ? runGit(args) : execFileSync('/usr/bin/git', args, {
      cwd: copy.root, env: { PATH: '/usr/bin:/bin', HOME: '/var/empty', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
      stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 })
    const proof = await verifyOwnerSuccessorArmingSource({ runGit: rawGit, policy, root: copy.root, now: Date.now })
    assert.deepEqual(proof, copy.proof)
    const { STAGING_SURFACE_TARGET } = await copy.import('staging-surface-activation-transport.mjs')
    const { createOwnerSuccessorFixedWorkerAssembly } = await copy.import('staging-owner-successor-fixed-worker-assembly.mjs')
    let transportCalls = 0
    const built = createOwnerSuccessorFixedWorkerAssembly({
      credentials: { managementToken: Buffer.from(`sbp_${'a'.repeat(40)}`), vercelToken: Buffer.from('synthetic-vercel'), previewBypass: Buffer.from('synthetic-bypass') },
      sourceProof: proof, expiresAt: proof.expiresAt, now: Date.now,
      fetch: async () => { transportCalls++; throw Error('qualification transport not yet installed') },
      runCli: async () => { transportCalls++; throw Error('qualification CLI not yet installed') },
      checkoutTarget: { name: 'TLL_STAGING_CART_CHECKOUT_HANDOFF_ENABLED', id: 'env_checkout', branch: 'codex/tll-integration', environment: 'preview', classification: 'config' },
      preflight: { requirements: { sourceCommit: proof.sourceCommit, manifestSha256: proof.manifestSha256, observedAt: new Date().toISOString() },
        heldEvidence: { target: STAGING_SURFACE_TARGET, deploymentId: 'dpl_held123', immutableUrl: 'https://the-lifting-held-my-lifting-lab-s-projects.vercel.app', sourceCommit: proof.sourceCommit,
          manifestSha256: proof.manifestSha256, ready: true, createdAt: new Date().toISOString() } },
    })
    try { assert.equal(typeof built.core.run, 'function'); assert.equal(transportCalls, 0) }
    finally { built.dispose() }
  } finally { copy.dispose() }
})


test('actual fixed supervisor and child admit fd3 before exact synthetic credential selectors; external preflight failure remains HOLD', async () => {
  const copy = createSuccessorDefaultQualificationSource()
  const { mkdirSync, writeFileSync, readFileSync, cpSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { execFileSync } = await import('node:child_process')
  try {
    const review = join(copy.root, '.agent/owner-successor/cd4130c8-a8b8-462b-bdbe-5c3e6250a02d')
    mkdirSync(review, { recursive: true, mode: 0o700 })
    writeFileSync(join(review, 'source-review.json'), JSON.stringify({ reviewedBaseSha: copy.proof.sourceCommit, manifestSha256: copy.proof.manifestSha256 }), { mode: 0o600 })
    const fixtures = join(copy.root, 'tests/fixtures'); mkdirSync(fixtures, { recursive: true })
    for (const name of ['owner-successor-default-transport-denial.mjs', 'owner-successor-default-supervisor.mjs']) cpSync(new URL(`fixtures/${name}`, import.meta.url), join(fixtures, name))
    const output = execFileSync(process.execPath, [join(fixtures, 'owner-successor-default-supervisor.mjs')], {
      cwd: copy.root, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 40_000 })
    assert.deepEqual(JSON.parse(output), { status: 'HOLD_RECONCILE', authorization: 'NONE' })
    const events = readFileSync(join(copy.root, 'qualification-transport-events.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
    const spawned = events.find(e => e.event === 'supervisor_spawn'); assert.ok(spawned)
    const reader = events.filter(e => e.event.startsWith('credential_selector:'))
    assert.equal(reader.length, 3); assert.equal(new Set(reader.map(e => e.pid)).size, 1)
    assert.notEqual(reader[0].pid, spawned.pid)
    assert.deepEqual(reader.map(e => e.event), ['credential_selector:Supabase CLI', 'credential_selector:TLL Hosted Baseline Vercel API', 'credential_selector:TLL Hosted Baseline Preview Bypass'])
    const childEvents = events.filter(e => e.pid === reader[0].pid)
    assert.equal(childEvents[0].event, 'git_remote_metadata')
    assert.ok(childEvents.some(e => e.event.startsWith('denied_http:')))
  } finally { copy.dispose() }
})


const actualDefaultOptions = { timeout: 180_000, skip: dockerAbsent ? 'Docker binary absent; full default SQL qualification not executed' : false }
async function waitForOwnedWorkerReaping(copy) {
  const ownershipPath = join(copy.root, '.agent/owner-successor/cd4130c8-a8b8-462b-bdbe-5c3e6250a02d/worker-ownership.json')
  const originalBytes = readFileSync(ownershipPath)
  const { pid, supervisorPid } = JSON.parse(originalBytes)
  assert.ok(Number.isSafeInteger(pid) && pid >= 2 && Number.isSafeInteger(supervisorPid) && supervisorPid >= 2 && pid !== supervisorPid)
  const probes = () => [pid, -pid, supervisorPid].map(target => {
    try { process.kill(target, 0); return { target, state: 'PRESENT' } }
    catch (error) { return { target, state: error.code ?? 'UNKNOWN' } }
  })
  const deadline = Date.now() + 15_000
  let evidence = probes()
  while (evidence.some(probe => probe.state !== 'ESRCH') && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 50))
    evidence = probes()
  }
  assert.deepEqual(readFileSync(ownershipPath), originalBytes, 'waiting must not alter the native ownership lease')
  if (evidence.some(probe => probe.state !== 'ESRCH')) {
    const ps = spawnSync('ps', ['-eo', 'pid,ppid,pgid,stat,comm'], { encoding: 'utf8', timeout: 2000 })
    const ownedRows = (ps.stdout ?? '').split('\n').filter(row => {
      const columns = row.trim().split(/\s+/)
      return [pid, supervisorPid].includes(Number(columns[0])) || Number(columns[2]) === pid
    })
    assert.fail(`owned worker reaping timed out: ${JSON.stringify({ pid, supervisorPid, probes: evidence, ownedRows, psError: ps.error?.code ?? null })}`)
  }
  return evidence
}
async function qualifyDefault(mode, verify) {
  const { createOwnerSuccessorDefaultDatabase } = await import('./fixtures/owner-successor-default-database.mjs')
  const database = await createOwnerSuccessorDefaultDatabase()
  let copy
  const { mkdirSync, writeFileSync, readFileSync, cpSync, readdirSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { execFileSync } = await import('node:child_process')
  try {
    copy = createSuccessorDefaultQualificationSource()
    const review = join(copy.root, '.agent/owner-successor/cd4130c8-a8b8-462b-bdbe-5c3e6250a02d')
    mkdirSync(review, { recursive: true, mode: 0o700 })
    writeFileSync(join(review, 'source-review.json'), JSON.stringify({ reviewedBaseSha: copy.proof.sourceCommit, manifestSha256: copy.proof.manifestSha256 }), { mode: 0o600 })
    writeFileSync(join(copy.root, 'qualification-config.json'), JSON.stringify({ mode, containerName: database.containerName,
      dockerExecutable: execFileSync('/usr/bin/which', ['docker'], { encoding: 'utf8' }).trim(),
      dockerHost: execFileSync('docker', ['context', 'inspect', '--format', '{{(index .Endpoints "docker").Host}}'], { encoding: 'utf8' }).trim() }), { mode: 0o600 })
    const fixtures = join(copy.root, 'tests/fixtures'); mkdirSync(fixtures, { recursive: true })
    for (const name of readdirSync(new URL('fixtures/', import.meta.url)).filter(name => name.startsWith('owner-successor-default-') && name.endsWith('.mjs'))) cpSync(new URL(`fixtures/${name}`, import.meta.url), join(fixtures, name))
    const invoke = (cleanup = false) => {
      try { return { output: execFileSync(process.execPath, cleanup ? ['--import', join(fixtures, 'owner-successor-default-transport-denial.mjs'), join(copy.root, 'scripts/staging-owner-successor-cleanup-entry.mjs')] : [join(fixtures, 'owner-successor-default-supervisor.mjs')], {
        cwd: copy.root, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 150_000 }), signal: null } }
      catch (failure) { return { output: failure.stdout, signal: failure.signal, exitCode: failure.status } }
    }
    const readEvents = () => readFileSync(join(copy.root, 'qualification-transport-events.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
    const observed = invoke(), events = readEvents()
    const result = observed.output?.length ? JSON.parse(observed.output) : null
    const record = JSON.parse(readFileSync(join(review, 'whole-route.json'), 'utf8'))
    await verify({ result, observed, events, record, database, copy, invoke, readEvents })
  } finally { database.dispose(); copy?.dispose() }
}
for (const mode of ['success', 'owner-failure', 'owner-budget']) test(`actual fixed default route: ${mode}; real SQL disable retire final`, actualDefaultOptions, async () => {
  await qualifyDefault(mode, ({ result, events, record, database, copy }) => {
    assert.deepEqual(result, { status: mode === 'success' ? 'STAGING_SEQUENCE_PASS' : 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED', authorization: 'NONE' }, JSON.stringify({ phases: record.phases, finalJournal: existsSync(join(copy.root, '.agent/owner-successor/cd4130c8-a8b8-462b-bdbe-5c3e6250a02d/final-read.json')) ? JSON.parse(readFileSync(join(copy.root, '.agent/owner-successor/cd4130c8-a8b8-462b-bdbe-5c3e6250a02d/final-read.json'), 'utf8')) : null, events: [...events.filter(e => e.event.startsWith('browser_')), ...events.slice(-25)] }))
    assert.equal(database.controls(), 'false,false,false,false,false'); assert.equal(database.inertOwners(), '5')
    assert.equal(database.managed("SELECT count(*) FROM pg_authid WHERE rolname ~ '^tll_(customer|cart|broker|provisional|bridge)_runtime$' AND NOT rolcanlogin AND rolpassword IS NULL AND rolvaliduntil='infinity'::timestamptz"), '5')
    if (mode === 'success') {
      assert.equal(events.filter(e => e.event === 'browser_stack_reload').length, 2)
      assert.ok(events.some(e => e.event === 'browser_click:Connect guest cart'))
    } else if (mode === 'owner-budget') {
      assert.equal(events.filter(e => e.event === 'browser_transport_launch').length, 0)
      assert.equal(record.phases.find(p => p.phase === 'ownerJourney').reason, 'INSUFFICIENT_OWNER_BUDGET')
    }
    for (const alias of ['tll_staging_control_activation', 'tll_owner_successor_control_shutdown', 'tll_owner_successor_recovery_receipt', 'tll_owner_successor_final_check']) assert.ok(events.some(e => e.event === `sql_effect_or_readback:${alias}`), alias)
    assert.equal(record.state, mode === 'success' ? 'PASS' : 'OWNER_FAILURE_SHUTDOWN_VERIFIED')
    const modules = [...new Set(events.filter(e => e.event.startsWith('used_module:')).map(e => e.event.slice(12)))].sort()
    const importedGates = Object.fromEntries(Object.entries(copy.policy.gates).filter(([path]) => modules.includes(path.split('/').at(-1))))
    console.log(JSON.stringify({ qualification: mode, authorization: 'NONE', phases: record.phases.map(p => `${p.phase}:${p.state}`), importedModules: modules, importedGates }))
  })
})
for (const mode of ['lost-setting-reply', 'crash-setup', 'lost-parent', 'cancel-setup']) test(`actual fixed default uncertainty: ${mode}; no reader or effect replay`, actualDefaultOptions, async () => {
  await qualifyDefault(mode, async ({ result, observed, events, record, database, copy, invoke, readEvents }) => {
    if (mode === 'lost-parent') { assert.equal(result, null); assert.equal(observed.signal, 'SIGKILL') }
    else assert.deepEqual(result, { status: 'HOLD_RECONCILE', authorization: 'NONE' }, JSON.stringify({ phases: record.phases, events: [...events.filter(e => e.event.startsWith('browser_')), ...events.slice(-25)] }))
    assert.notEqual(record.state, 'PASS'); assert.equal(database.controls(), 'false,false,false,false,false')
    if (mode === 'lost-setting-reply') assert.ok(events.some(e => e.event === 'accepted_setting_reply_lost'))
    else {
      assert.ok(events.some(e => e.event === 'sql_effect_or_readback:tll_owner_successor_credential_receipt'))
      assert.equal(database.managed("SELECT count(*) FROM pg_roles WHERE rolname ~ '^tll_(customer|cart|broker|provisional|bridge)_runtime$' AND rolcanlogin"), '5')
    }
    if (mode === 'cancel-setup') {
      assert.ok(events.some(e => e.event === 'cancel_parent_before_late_setup_reply'))
      assert.equal(events.some(e => e.event === 'late_setup_reply'), false)
      assert.equal(record.pendingPhase, 'databaseSetup')
      assert.equal(events.some(e => e.event.startsWith('runtime_auth:')), false)
    }
    const readerCount = events.filter(e => e.event.startsWith('credential_selector:')).length
    const effectCount = events.filter(e => e.event.startsWith('sql_effect_or_readback:')).length
    const replay = invoke(); assert.deepEqual(JSON.parse(replay.output), { status: 'HOLD_RECONCILE', authorization: 'NONE' })
    const after = readEvents()
    assert.equal(after.filter(e => e.event.startsWith('credential_selector:')).length, readerCount)
    assert.equal(after.filter(e => e.event.startsWith('sql_effect_or_readback:')).length, effectCount)
    const originalPath = join(copy.root, '.agent/owner-successor/cd4130c8-a8b8-462b-bdbe-5c3e6250a02d/whole-route.json')
    const originalBytes = readFileSync(originalPath)
    // SIGKILL of the parent can return before its orphaned child/group is reaped by init.
    // Admission requires actual ESRCH; never substitute zombie state or edit its lease.
    const reaping = mode === 'lost-parent' ? await waitForOwnedWorkerReaping(copy) : null
    const cleanup = invoke(true), cleanupResult = JSON.parse(cleanup.output)
    if (mode === 'lost-setting-reply') {
      assert.deepEqual(cleanupResult, { status: 'HOLD_RECONCILE', authorization: 'NONE' })
      assert.equal(readEvents().filter(e => e.event.startsWith('credential_selector:')).length, readerCount)
    } else {
      assert.deepEqual(cleanupResult, { status: 'CLEANUP_SEQUENCE_PASS', authorization: 'NONE' }, JSON.stringify(readEvents().slice(-20)))
      assert.equal(database.controls(), 'false,false,false,false,false')
      assert.equal(database.managed("SELECT count(*) FROM pg_authid WHERE rolname ~ '^tll_(customer|cart|broker|provisional|bridge)_runtime$' AND NOT rolcanlogin AND rolpassword IS NULL AND rolvaliduntil='infinity'::timestamptz"), '5')
      const cleanedEvents = readEvents(), cleanedReaderCount = cleanedEvents.filter(e => e.event.startsWith('credential_selector:')).length
      const cleanedEffects = cleanedEvents.filter(e => e.event.startsWith('sql_effect_or_readback:')).length
      assert.deepEqual(JSON.parse(invoke(true).output), { status: 'HOLD_RECONCILE', authorization: 'NONE' })
      assert.equal(readEvents().filter(e => e.event.startsWith('credential_selector:')).length, cleanedReaderCount)
      assert.equal(readEvents().filter(e => e.event.startsWith('sql_effect_or_readback:')).length, cleanedEffects)
    }
    const beforeOrdinaryReplay = readEvents(), settledReaderCount = beforeOrdinaryReplay.filter(e => e.event.startsWith('credential_selector:')).length
    const settledEffects = beforeOrdinaryReplay.filter(e => e.event.startsWith('sql_effect_or_readback:')).length
    assert.deepEqual(JSON.parse(invoke().output), { status: 'HOLD_RECONCILE', authorization: 'NONE' })
    assert.equal(readEvents().filter(e => e.event.startsWith('credential_selector:')).length, settledReaderCount)
    assert.equal(readEvents().filter(e => e.event.startsWith('sql_effect_or_readback:')).length, settledEffects)
    assert.deepEqual(readFileSync(originalPath), originalBytes)
    console.log(JSON.stringify({ qualification: mode, authorization: 'NONE', journalState: record.state, pendingPhase: record.pendingPhase,
      replay: 'DENIED_BEFORE_CREDENTIAL_READER', cleanup: cleanupResult.status, reaping, originalJournal: 'UNCHANGED', ordinaryReplay: 'STILL_DENIED' }))
  })
})
