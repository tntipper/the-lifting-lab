import { homedir, tmpdir } from 'node:os'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createStagingPreviewGitPublishNativePushPort } from '../scripts/staging-preview-git-publish-native-push.mjs'

const selectedCommit = 'a'.repeat(40), predecessorCommit = 'b'.repeat(40)
const selection = Object.freeze({ selectedCommit, predecessorCommit, manifestSha256: 'c'.repeat(64) })
const ref = 'refs/heads/codex/tll-integration'
const origin = 'https://github.com/tntipper/the-lifting-lab.git'

test('one fixed Git push uses a scoped GitHub CLI helper and suppresses process output', () => {
  let calls = 0
  const port = createStagingPreviewGitPublishNativePushPort({ preflight: () => true,
    spawn(binary, args, options) {
      calls++
      assert.equal(binary, resolve(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/bin/git'))
      assert.equal(Object.isFrozen(args), true)
      assert.deepEqual(args, ['-c', 'core.hooksPath=/dev/null', '-c', 'credential.helper=',
        '-c', `credential.https://github.com.helper=!'${resolve(homedir(), '.local/bin/gh').replaceAll("'", "'\\''")}' auth git-credential`,
        'push', '--porcelain', '--no-verify', `--force-with-lease=${ref}:${predecessorCommit}`,
        '--', origin, `${selectedCommit}:${ref}`])
      assert.deepEqual(options.stdio, ['ignore', 'ignore', 'ignore'])
      assert.equal(options.timeout, 45_000)
      assert.equal(options.env.GIT_CONFIG_GLOBAL, '/dev/null')
      assert.equal(options.env.GIT_CONFIG_SYSTEM, '/dev/null')
      assert.equal(options.env.GIT_TERMINAL_PROMPT, '0')
      assert.equal(options.env.HOME, resolve(homedir()))
      assert.equal(options.env.GH_CONFIG_DIR, resolve(homedir(), '.config/gh'))
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

test('GitHub CLI trust preflight is read-only and the port has no direct entry point', async () => {
  // Test the real trust checks with owned bytes; a developer's CLI installation
  // is not a fixture and may legitimately fail the production digest pin.
  const directory = realpathSync(mkdtempSync(resolve(tmpdir(), 'tll-gh-trust-')))
  try {
    const cli = resolve(directory, 'gh'), config = resolve(directory, 'config')
    const hosts = resolve(config, 'hosts.yml'), bytes = Buffer.from('owned offline CLI fixture')
    mkdirSync(config, { mode: 0o700 })
    writeFileSync(cli, bytes, { mode: 0o500 })
    writeFileSync(hosts, 'fixture: no credentials\n', { mode: 0o600 })
    const original = readFileSync(new URL('../scripts/staging-preview-git-source-preflight.mjs', import.meta.url), 'utf8')
    const replacements = [
      ["const githubCli = resolve(homedir(), '.local/bin/gh')", `const githubCli = ${JSON.stringify(cli)}`],
      ["const githubCliConfig = resolve(homedir(), '.config/gh')", `const githubCliConfig = ${JSON.stringify(config)}`],
      ["const githubCliSha256 = 'a38e8ea1b9794a445a1ce746392e36111ca00a3242a6447b49cd4c162cb191a7'",
        `const githubCliSha256 = '${createHash('sha256').update(bytes).digest('hex')}'`],
    ]
    let isolated = original
    for (const [before, after] of replacements) {
      assert.equal(isolated.split(before).length, 2)
      isolated = isolated.replace(before, after)
    }
    const modulePath = resolve(directory, 'preflight.mjs')
    writeFileSync(modulePath, isolated)
    const { stagingPreviewGithubCliReady: ready } = await import(pathToFileURL(modulePath).href)
    assert.equal(ready(), true)
    chmodSync(cli, 0o700)
    writeFileSync(cli, 'changed bytes')
    assert.equal(ready(), false)
    writeFileSync(cli, bytes)
    chmodSync(cli, 0o522)
    assert.equal(ready(), false)
    chmodSync(cli, 0o500)
    assert.equal(ready(), true)
    chmodSync(config, 0o722)
    assert.equal(ready(), false)
    chmodSync(config, 0o700)
    chmodSync(hosts, 0o644)
    assert.equal(ready(), false)
    chmodSync(hosts, 0o600)
    assert.equal(ready(), true)
    unlinkSync(hosts)
    symlinkSync(cli, hosts)
    assert.equal(ready(), false)
    unlinkSync(hosts)
    assert.equal(ready(), false)
  } finally { rmSync(directory, { recursive: true, force: true }) }
  const source = readFileSync(new URL('../scripts/staging-preview-git-publish-native-push.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /process\.argv|Keychain|\.execute\(|child_process|spawnSync/)
  assert.match(source, /stagingPreviewGithubCliReady/)
  assert.throws(() => createStagingPreviewGitPublishNativePushPort().push(selection), /push unavailable/)
})
