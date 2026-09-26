import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createStagingPreviewGitPublishNativePushPort } from '../scripts/staging-preview-git-publish-native-push.mjs'
import { stagingPreviewGithubCliReady } from '../scripts/staging-preview-git-source-preflight.mjs'

const selectedCommit = 'a'.repeat(40), predecessorCommit = 'b'.repeat(40)
const selection = Object.freeze({ selectedCommit, predecessorCommit, manifestSha256: 'c'.repeat(64) })
const ref = 'refs/heads/codex/tll-integration'
const origin = 'https://github.com/tntipper/the-lifting-lab.git'

test('one fixed Git push uses a scoped GitHub CLI helper and suppresses process output', () => {
  let calls = 0
  const port = createStagingPreviewGitPublishNativePushPort({ preflight: () => true,
    spawn(binary, args, options) {
      calls++
      assert.equal(binary, '/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/bin/git')
      assert.equal(Object.isFrozen(args), true)
      assert.deepEqual(args, ['-c', 'core.hooksPath=/dev/null', '-c', 'credential.helper=',
        '-c', 'credential.https://github.com.helper=!/Users/tobiastipper/.local/bin/gh auth git-credential',
        'push', '--porcelain', '--no-verify', `--force-with-lease=${ref}:${predecessorCommit}`,
        '--', origin, `${selectedCommit}:${ref}`])
      assert.deepEqual(options.stdio, ['ignore', 'ignore', 'ignore'])
      assert.equal(options.timeout, 45_000)
      assert.equal(options.env.GIT_CONFIG_GLOBAL, '/dev/null')
      assert.equal(options.env.GIT_CONFIG_SYSTEM, '/dev/null')
      assert.equal(options.env.GIT_TERMINAL_PROMPT, '0')
      assert.equal(options.env.HOME, '/Users/tobiastipper')
      assert.equal(options.env.GH_CONFIG_DIR, '/Users/tobiastipper/.config/gh')
      assert.equal(options.cwd, resolve(import.meta.dirname, '..'))
      return { status: 0, signal: null, stdout: Buffer.from('untrusted'), stderr: Buffer.from('untrusted') }
    },
  })
  assert.deepEqual(port.push(selection), { status: 'PUSH_DISPATCHED_UNVERIFIED' })
  assert.throws(() => port.push(selection), /push unavailable/)
  assert.equal(calls, 1)
})

test('untrusted selection and failed preflight cannot reach the process', () => {
  for (const candidate of [
    { ...selection, selectedCommit: 'short' }, { ...selection, predecessorCommit: selectedCommit },
    { ...selection, manifestSha256: 'short' }, { ...selection, extra: true },
  ]) {
    let calls = 0
    const port = createStagingPreviewGitPublishNativePushPort({ preflight: () => { calls++; return true },
      spawn: () => { calls++; return { status: 0 } } })
    assert.throws(() => port.push(candidate), /push unavailable/)
    assert.equal(calls, 0)
    assert.throws(() => port.push(selection), /push unavailable/)
  }
  const accessor = { ...selection }
  let reads = 0
  Object.defineProperty(accessor, 'selectedCommit', { get() { reads++; return selectedCommit } })
  assert.throws(() => createStagingPreviewGitPublishNativePushPort({ preflight: () => true,
    spawn: () => assert.fail('no spawn') }).push(accessor), /push unavailable/)
  assert.equal(reads, 0)
  let spawns = 0
  const port = createStagingPreviewGitPublishNativePushPort({ preflight: () => false,
    spawn: () => { spawns++; return { status: 0 } } })
  assert.throws(() => port.push(selection), /push unavailable/)
  assert.equal(spawns, 0)
})

test('uncertain or failed process result consumes the port; remote reconciliation remains external', () => {
  for (const result of [undefined, { status: 1 }, { status: null, signal: 'SIGTERM' },
    { status: null, error: Error('timed out') }]) {
    let spawns = 0
    const port = createStagingPreviewGitPublishNativePushPort({ preflight: () => true,
      spawn: () => { spawns++; return result } })
    assert.throws(() => port.push(selection), /push unavailable/)
    assert.throws(() => port.push(selection), /push unavailable/)
    assert.equal(spawns, 1)
  }
  const port = createStagingPreviewGitPublishNativePushPort({ preflight: () => true,
    spawn: () => { throw Error('unknown dispatch state') } })
  assert.throws(() => port.push(selection), /push unavailable/)
  assert.throws(() => port.push(selection), /push unavailable/)
})

test('GitHub CLI trust preflight is read-only and the port has no direct entry point', () => {
  if (process.platform === 'darwin') assert.equal(stagingPreviewGithubCliReady(), true)
  const source = readFileSync(new URL('../scripts/staging-preview-git-publish-native-push.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /process\.argv|Keychain|\.execute\(|child_process|spawnSync/)
  assert.match(source, /stagingPreviewGithubCliReady/)
  assert.throws(() => createStagingPreviewGitPublishNativePushPort().push(selection), /push unavailable/)
})
