import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createStagingPreviewGitArmNativeReadPort,
  stagingPreviewGitArmReadProcessOptions } from '../scripts/staging-preview-git-publish-arm-native-read.mjs'
import { STAGING_PREVIEW_GIT_PUBLISH_ARM_ROOT } from '../scripts/staging-preview-git-publish-arm-preflight.mjs'
import { stagingPreviewGitExecutableReady } from '../scripts/staging-preview-git-source-preflight.mjs'

const selectedCommit = 'a'.repeat(40), executionCommit = 'b'.repeat(40)
const files = ['config/staging-account-activation-manifest.json',
  'scripts/staging-preview-git-publish-live-launcher.mjs']

test('arming read vectors have fixed root, scrubbed config and no credential helper', () => {
  for (const [args, maxBuffer] of [
    [['rev-parse', '--show-toplevel'], 4_096],
    [['symbolic-ref', '--quiet', '--short', 'HEAD'], 4_096],
    [['status', '--porcelain=v1', '--untracked-files=all'], 4_096],
    [['rev-parse', 'HEAD'], 4_096],
    [['rev-list', '--parents', '-n', '1', 'HEAD'], 4_096],
    [['diff-tree', '--no-commit-id', '--name-only', '-r', selectedCommit, executionCommit], 4_096],
    [['ls-tree', '-z', executionCommit, '--', ...files], 4_096],
    [['show', `${executionCommit}:${files[0]}`], 262_144],
    [['show', `${executionCommit}:${files[1]}`], 262_144],
  ]) {
    const options = stagingPreviewGitArmReadProcessOptions(args, maxBuffer)
    assert.equal(options.cwd, STAGING_PREVIEW_GIT_PUBLISH_ARM_ROOT)
    assert.equal(options.env.HOME, '/var/empty')
    assert.equal(options.env.GIT_CONFIG_GLOBAL, '/dev/null')
    assert.equal(options.env.GIT_CONFIG_SYSTEM, '/dev/null')
    assert.equal(options.env.GIT_NO_REPLACE_OBJECTS, '1')
    assert.equal(options.env.GIT_NO_LAZY_FETCH, '1')
    assert.equal(options.env.GIT_OPTIONAL_LOCKS, '0')
    assert.equal(options.env.GH_CONFIG_DIR, undefined)
    assert.deepEqual(options.stdio, ['ignore', 'pipe', 'ignore'])
  }
  for (const args of [
    ['push', 'origin', 'HEAD'], ['-c', 'credential.helper=!other', 'push'],
    ['ls-tree', '-z', executionCommit, '--', files[1], files[0]],
    ['show', `${executionCommit}:app/page.tsx`],
    ['diff-tree', '--no-commit-id', '--name-only', '-r', 'short', executionCommit],
  ]) assert.throws(() => stagingPreviewGitArmReadProcessOptions(args, 4_096), /arming read unavailable/)
})

test('native arming port dispatches a captured read-only vector and preserves exit status', t => {
  if (!stagingPreviewGitExecutableReady()) return t.skip('pinned native Git unavailable')
  let calls = 0
  const original = ['rev-parse', '--show-toplevel']
  const port = createStagingPreviewGitArmNativeReadPort({ spawn(binary, args, options) {
    calls++
    assert.equal(binary.endsWith('/dependencies/native/git/bin/git'), true)
    assert.deepEqual(args, ['-c', 'core.fsmonitor=false', '-c', 'protocol.allow=never',
      'rev-parse', '--show-toplevel'])
    assert.equal(Object.isFrozen(args), true)
    assert.notEqual(args, original)
    original[0] = 'push'
    assert.equal(options.cwd, STAGING_PREVIEW_GIT_PUBLISH_ARM_ROOT)
    return { status: 1, signal: null, stdout: Buffer.alloc(0) }
  } })
  assert.deepEqual(port.runGit(original, 4_096), { status: 1, stdout: Buffer.alloc(0) })
  assert.equal(calls, 1)
})

test('spoofed argument arrays and push commands cause zero process calls', () => {
  let calls = 0
  const port = createStagingPreviewGitArmNativeReadPort({ spawn: () => { calls++; return { status: 0,
    signal: null, stdout: Buffer.alloc(0) } } })
  const spoofed = ['push', 'origin', 'HEAD']
  spoofed.some = () => false
  spoofed.join = () => 'rev-parse\0--show-toplevel'
  assert.throws(() => port.runGit(spoofed, 4_096), /arming read unavailable/)
  const accessor = ['rev-parse', '--show-toplevel']
  let reads = 0
  Object.defineProperty(accessor, '0', { get() { reads++; return 'rev-parse' } })
  assert.throws(() => port.runGit(accessor, 4_096), /arming read unavailable/)
  assert.equal(reads, 0)
  assert.equal(calls, 0)
})

test('missing partial-clone blobs fail locally with no lazy fetch', t => {
  if (!stagingPreviewGitExecutableReady()) return t.skip('pinned native Git unavailable')
  const directory = fs.mkdtempSync(resolve(tmpdir(), 'tll-arm-no-lazy-'))
  const source = resolve(directory, 'source')
  const partial = resolve(directory, 'partial')
  const binary = '/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/bin/git'
  const localEnv = { PATH: '/usr/bin:/bin', LANG: 'C', HOME: '/var/empty',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_EXEC_PATH: '/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/libexec/git-core' }
  const git = (cwd, args, env = localEnv) => spawnSync(binary, args, { cwd, env,
    stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000, maxBuffer: 4_096 })
  try {
    assert.equal(git(directory, ['init', source]).status, 0)
    assert.equal(git(source, ['config', 'uploadpack.allowFilter', 'true']).status, 0)
    fs.writeFileSync(resolve(source, 'missing.txt'), 'promised blob\n')
    assert.equal(git(source, ['add', 'missing.txt']).status, 0)
    assert.equal(git(source, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      'commit', '-m', 'fixture']).status, 0)
    const cloned = git(directory, ['clone', '--filter=blob:none', '--no-checkout', `file://${source}`, partial])
    assert.equal(cloned.status, 0, cloned.stderr.toString('utf8'))
    const guarded = stagingPreviewGitArmReadProcessOptions(['show',
      `${'a'.repeat(40)}:scripts/staging-preview-git-publish-live-launcher.mjs`], 262_144)
    const marker = resolve(directory, 'helper-invoked')
    const helper = resolve(directory, 'mark-helper')
    fs.writeFileSync(helper, `#!/bin/sh\n/usr/bin/touch '${marker}'\nexit 1\n`, { mode: 0o700 })
    assert.equal(git(partial, ['config', 'remote.origin.url', `ext::${helper}`]).status, 0)
    const blocked = git(partial, ['-c', 'protocol.ext.allow=always', 'show', 'HEAD:missing.txt'],
      { ...guarded.env, GIT_NO_LAZY_FETCH: '1' })
    assert.notEqual(blocked.status, 0)
    assert.equal(fs.existsSync(marker), false)
    const control = git(partial, ['-c', 'protocol.ext.allow=always', 'show', 'HEAD:missing.txt'],
      { ...guarded.env, GIT_NO_LAZY_FETCH: '0' })
    assert.notEqual(control.status, 0)
    assert.equal(fs.existsSync(marker), true)
    assert.equal(git(partial, ['config', 'remote.origin.url', `file://${source}`]).status, 0)
    const localFetch = git(partial, ['-c', 'protocol.file.allow=always', 'show', 'HEAD:missing.txt'],
      { ...guarded.env, GIT_NO_LAZY_FETCH: '0' })
    assert.equal(localFetch.status, 0)
    assert.equal(localFetch.stdout.toString('utf8'), 'promised blob\n')
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('arm port has no push vector, token lookup or live CLI', () => {
  const source = readFileSync(new URL('../scripts/staging-preview-git-publish-arm-native-read.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /Keychain|gh auth|process\.argv|credential\.helper|\.push\(/)
  assert.match(source, /core\.fsmonitor=false/)
  assert.match(source, /GIT_NO_LAZY_FETCH: '1'/)
})
