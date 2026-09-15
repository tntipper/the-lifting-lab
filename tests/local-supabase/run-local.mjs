#!/usr/bin/env node
// Dedicated disposable Supabase Auth/Storage fixture; never links a cloud project.
import { spawn, execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdir, mkdtemp, rm, access } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const schemaRoot = resolve(process.env.TLL_SCHEMA_ROOT || root)
const project = 'tll-local-integration'
const network = `${project}-net`
const container = `supabase_db_${project}`
const reuse = process.argv.includes('--reuse')
const keep = process.env.TLL_KEEP_LOCAL_SUPABASE === '1'
const state = process.env.TLL_LOCAL_SUPABASE_DIR ? resolve(process.env.TLL_LOCAL_SUPABASE_DIR) : await mkdtemp(join(tmpdir(), 'tll-local-supabase-'))
const ownedState = !process.env.TLL_LOCAL_SUPABASE_DIR
const config = await readFile(join(here, 'config.toml'), 'utf8')
const migration = join(schemaRoot, 'supabase/migrations/202609150001_integrity_boundaries.sql')
await access(migration)
const migrationHash = createHash('sha256').update(await readFile(migration)).digest('hex')
assert.ok(!process.env.SUPABASE_ACCESS_TOKEN && !process.env.SUPABASE_DB_PASSWORD, 'Run without cloud Supabase credentials')
assert.ok(!process.env.SUPABASE_API_PORT && !process.env.SUPABASE_DB_PORT, 'Local ports must not be overridden')
await mkdir(join(state, 'supabase'), { recursive: true, mode: 0o700 })
for (const path of ['.env', '.env.local', 'supabase/.env', 'supabase/.temp/project-ref']) {
  try { await access(join(state, path)); throw new Error(`Refusing unexpected local project file: ${path}`) } catch (error) { if (error.code !== 'ENOENT') throw error }
}
const snapshot = () => execFileSync('docker', ['ps', '--all', '--format', 'json'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
const before = snapshot().filter(item => !item.Names.endsWith(`_${project}`)).map(({ ID, Names, Ports }) => ({ ID, Names, Ports }))
const exists = snapshot().some(item => item.Names.endsWith(`_${project}`))
assert.equal(exists, reuse, reuse ? 'No dedicated project exists to reuse' : 'Dedicated project already exists; use --reuse after checking its state')
if (reuse) assert.equal((await readFile(join(state, 'supabase/config.toml'), 'utf8')).trim(), config.trim(), 'Existing fixture configuration differs')
else await writeFile(join(state, 'supabase/config.toml'), config, { mode: 0o600 })
const log = join(state, 'integration.local.log')
async function run(command, args, { input, visible = false, timeoutMs = 180000 } = {}) {
  const output = visible ? undefined : createWriteStream(log, { flags: 'a', mode: 0o600 })
  try {
    await new Promise((resolvePromise, reject) => {
      const child = spawn(command, args, { detached: true, cwd: root, env: { ...process.env, TLL_LOCAL_SUPABASE_DIR: state }, stdio: ['pipe', visible ? 'inherit' : 'pipe', visible ? 'inherit' : 'pipe'] })
      let diagnostic = ''
      if (output) { child.stdout.pipe(output, { end: false }); child.stderr.pipe(output, { end: false }); child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-4000) }) }
      const deadline = setTimeout(() => { try { process.kill(-child.pid, 'SIGTERM') } catch {} }, timeoutMs)
      const progress = command === 'npx' ? setInterval(() => console.log('Waiting for the dedicated local Supabase command...'), 30000) : undefined
      child.on('error', reject)
      child.on('close', code => {
        clearTimeout(deadline); clearInterval(progress)
        if (code === 0) return resolvePromise()
        if (command !== 'npx' && diagnostic) console.error(diagnostic)
        reject(new Error(`${command} failed or timed out (${code}); local log: ${log}`))
      })
      child.stdin.end(input)
    })
  } finally { if (output) await new Promise(resolvePromise => output.end(resolvePromise)) }
}
const cli = args => run('npx', ['--yes', 'supabase@2.117.0', ...args, '--workdir', state], { timeoutMs: args[0] === 'start' ? 600000 : 60000 })
let created = reuse, completed = false
try {
  if (!reuse) {
    await run('docker', ['network', 'create', '--internal', '--opt', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', '--label', `com.tll.fixture=${project}`, network])
    created = true
    console.log('Starting dedicated local Supabase Auth, Storage and Mailpit fixture; first image download can take several minutes.')
    await cli(['start', '--network-id', network, '--exclude', 'realtime,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'])
  }
  const details = JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))[0]
  assert.equal(details.Config.Labels['com.supabase.cli.project'], project)
  assert.deepEqual(Object.keys(details.NetworkSettings.Networks), [network])
  for (const bindings of Object.values(details.NetworkSettings.Ports ?? {})) for (const binding of bindings ?? []) assert.equal(binding.HostIp, '127.0.0.1')
  const present = execFileSync('docker', ['exec', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-Atc', "select to_regclass('public.tll_local_fixture_marker') is not null"], { encoding: 'utf8' }).trim()
  if (present !== 't') {
    await run('docker', ['exec', container, 'mkdir', '-p', '/tmp/tll-local-fixture'])
    await run('docker', ['cp', join(schemaRoot, 'scripts'), `${container}:/tmp/tll-local-fixture/scripts`])
    await run('docker', ['cp', join(schemaRoot, 'supabase/migrations'), `${container}:/tmp/tll-local-fixture/migrations`])
    await run('docker', ['cp', join(here, 'bootstrap.sql'), `${container}:/tmp/tll-local-fixture/bootstrap.sql`])
    await run('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', `migration_sha256=${migrationHash}`], { input: "set tll.integration_fixture = 'tll-local-integration';\n\\i /tmp/tll-local-fixture/bootstrap.sql\n" })
  }
  const appliedHash = execFileSync('docker', ['exec', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-Atc', 'select migration_sha256 from public.tll_local_fixture_marker'], { encoding: 'utf8' }).trim()
  assert.equal(appliedHash, migrationHash, 'Fixture migration differs; stop it and run a fresh fixture')
  console.log(`Integrity migration SHA256: ${migrationHash}`)
  await run(process.execPath, ['--test', '--test-timeout=180000', join(here, 'auth-storage.test.mjs')], { visible: true })
  completed = true
} finally {
  if (created && !keep) {
    await cli(['stop', '--no-backup'])
    // CLI normally removes its own network; custom fixture network is separate.
    try { execFileSync('docker', ['network', 'rm', network], { stdio: 'ignore' }) } catch {}
  }
  const originalNames = new Set(before.map(item => item.Names))
  const remaining = snapshot().filter(item => originalNames.has(item.Names)).map(({ ID, Names, Ports }) => ({ ID, Names, Ports }))
  assert.deepEqual(remaining, before, 'An unrelated Docker container changed during the fixture run')
  if (keep) console.log(`Dedicated local fixture retained at ${state}; no hosted staging was created.`)
  else if (ownedState && completed) await rm(state, { recursive: true, force: true })
  else if (!completed) console.log(`Failed-run local diagnostics retained privately at ${state}`)
}
