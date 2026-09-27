import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync,
  writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const sourceRoot = resolve(import.meta.dirname, '..')
const env = { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }
const file = 'scripts/staging-generation-22-preflight-live-launcher.mjs'

function isolatedCopy() {
  const parent = mkdtempSync(join(tmpdir(), 'tll-gen22-preflight-arm-'))
  const root = join(parent, 'implementation-integration')
  mkdirSync(root)
  const list = spawnSync('git', ['ls-files', '-z'], { cwd: sourceRoot, maxBuffer: 8_000_000 })
  if (list.status !== 0 || !list.stdout) throw Error('Tracked-source inventory unavailable')
  for (const name of list.stdout.toString('utf8').split('\0').filter(Boolean)) {
    const destination = join(root, name)
    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(join(sourceRoot, name), destination)
  }
  // This new test may be run before its first commit; the manifest still pins it.
  copyFileSync(join(sourceRoot, 'tests/staging-generation-22-preflight-armed-copy.test.mjs'),
    join(root, 'tests/staging-generation-22-preflight-armed-copy.test.mjs'))
  for (const name of ['scripts/staging-generation-23-connection-diagnostic.mjs',
    'tests/staging-generation-23-connection-diagnostic.test.mjs',
    'tests/staging-generation-23-assembled-connections.test.mjs']) {
    const destination = join(root, name)
    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(join(sourceRoot, name), destination)
  }
  symlinkSync(join(sourceRoot, 'node_modules'), join(root, 'node_modules'), 'dir')
  return { parent, root }
}

function armCopy(root, name) {
  const path = join(root, name)
  const source = readFileSync(path, 'utf8')
  const gate = `export const ${name.includes('preflight-live-launcher')
    ? 'STAGING_GENERATION_22_PREFLIGHT_LIVE_LAUNCHER_ENABLED'
    : name.includes('keychain-reader') ? 'STAGING_GENERATION_22_KEYCHAIN_READER_ENABLED'
      : name.includes('baseline-vercel') ? 'HOSTED_BASELINE_VERCEL_BINDING_ENABLED'
        : 'HOSTED_BASELINE_SUPABASE_BINDING_ENABLED'} = false`
  assert.equal(source.split(gate).length, 2)
  writeFileSync(path, source.replace(gate, gate.replace('= false', '= true')))
}

function command(root, script, args = []) {
  return spawnSync(process.execPath, [script, ...args], { cwd: root, env, encoding: 'utf8',
    timeout: 15_000, maxBuffer: 4096 })
}

test('isolated armed preflight reaches each reader while write gates and Keychain helper stay off', { skip: process.platform !== 'darwin' }, () => {
  const { parent, root } = isolatedCopy()
  try {
    for (const name of [file, 'scripts/staging-generation-22-keychain-reader.mjs',
      'scripts/staging-account-hosted-baseline-vercel.mjs',
      'scripts/staging-account-hosted-baseline-supabase.mjs']) armCopy(root, name)
    assert.match(readFileSync(join(root, 'scripts/staging-generation-22-keychain.py'), 'utf8'),
      /^GENERATION_22_KEYCHAIN_ENABLED = False$/m)
    for (const script of ['scripts/staging-account-activation-manifest.mjs',
      'scripts/staging-account-hosted-baseline-manifest.mjs']) {
      const result = command(root, script)
      assert.equal(result.status, 0, `${script}: ${result.stderr}`)
    }
    for (const [manifest, source, section] of [
      ['config/staging-account-activation-manifest.json', file, 'disabledActivationTooling'],
      ['config/staging-account-hosted-baseline-manifest.json', 'scripts/staging-account-hosted-baseline-vercel.mjs', null],
    ]) {
      const data = JSON.parse(readFileSync(join(root, manifest), 'utf8'))
      const pins = section ? data[section].sources : data.sources
      const pin = pins.find(entry => entry.path === source)
      assert.equal(pin?.sha256,
        createHash('sha256').update(readFileSync(join(root, source))).digest('hex'))
    }
    for (const mode of ['vercel', 'supabase']) {
      const result = command(root, file, [mode])
      assert.equal(result.status, 1, `${mode}: ${result.stderr}`)
      assert.deepEqual(JSON.parse(result.stdout), { status: 'RECONCILIATION_REQUIRED',
        target: mode === 'vercel' ? 'prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4' : 'qdmvngjwkcsilzmqksme' })
      const record = join(parent, 'implementation-state/staging', `tll-generation-22-preflight-${mode}-v1.json`)
      assert.equal(JSON.parse(readFileSync(record, 'utf8')).outcome, 'READ_UNAVAILABLE')
    }
    for (const name of ['tll-generation-22-dispatch-v1.json', 'tll-generation-22-recovery-dispatch-v1.json']) {
      assert.equal(existsSync(join(parent, 'implementation-state/staging', name)), false)
    }
  } finally {
    rmSync(parent, { recursive: true, force: true })
  }
})
