import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { selectStagingPreviewGitPublication, stagingPreviewGitPublishConfigAccepted,
  stagingPreviewGitPushCommand, stagingPreviewGitPublishProcessOptions, captureStagingPreviewGitArguments,
  STAGING_PREVIEW_GIT_PUSH_NATIVE_ENABLED } from '../scripts/staging-preview-git-publish-native-contract.mjs'

const root = resolve(import.meta.dirname, '..')
const common = resolve(root, '../audit-code/.git/config')
const worktree = resolve(root, '../audit-code/.git/worktrees/implementation-integration/config.worktree')
const origin = 'https://github.com/tntipper/the-lifting-lab.git'
const branch = 'codex/tll-integration', ref = `refs/heads/${branch}`
const selectedCommit = 'a'.repeat(40), predecessorCommit = 'b'.repeat(40)
const manifest = Buffer.from('{"committed":true}\n')
const key = args => args.join('\0')
const record = (path, name, value) => `file:${path}\0${name}\n${value}\0`
function config(extra = '') {
  return Buffer.from([
    record(common, 'core.repositoryformatversion', '1'), record(common, 'core.filemode', 'true'),
    record(common, 'core.bare', 'false'), record(common, 'core.logallrefupdates', 'true'),
    record(common, 'core.ignorecase', 'true'), record(common, 'core.precomposeunicode', 'true'),
    record(common, 'remote.origin.url', origin),
    record(common, 'remote.origin.fetch', '+refs/heads/main:refs/remotes/origin/main'),
    record(common, 'remote.origin.promisor', 'true'), record(common, 'remote.origin.partialclonefilter', 'blob:none'),
    record(common, 'extensions.worktreeconfig', 'true'),
    record(common, `branch.${branch}.remote`, 'origin'), record(common, `branch.${branch}.merge`, ref),
    record(worktree, 'core.sparsecheckout', 'false'), record(worktree, 'core.sparsecheckoutcone', 'false'),
    record(worktree, 'index.sparse', 'false'), extra,
  ].join(''))
}
function fixture(overrides = {}) {
  const values = new Map([
    [['config', '--null', '--list', '--show-origin'], config()],
    [['rev-parse', '--show-toplevel'], Buffer.from(`${root}\n`)],
    [['symbolic-ref', '--quiet', '--short', 'HEAD'], Buffer.from(`${branch}\n`)],
    [['config', '--local', '--get', 'remote.origin.url'], Buffer.from(`${origin}\n`)],
    [['status', '--porcelain=v1', '--untracked-files=no'], Buffer.alloc(0)],
    [['rev-parse', 'HEAD'], Buffer.from(`${selectedCommit}\n`)],
    [['ls-remote', '--heads', origin, ref], Buffer.from(`${predecessorCommit}\t${ref}\n`)],
    [['merge-base', '--is-ancestor', predecessorCommit, selectedCommit], Buffer.alloc(0)],
    [['show', `${selectedCommit}:config/staging-account-activation-manifest.json`], Buffer.from(manifest)],
  ].map(([args, value]) => [key(args), value]))
  for (const [command, value] of Object.entries(overrides)) values.set(command, value)
  const calls = []
  return { calls, runGit: async (args, limit) => {
    calls.push(args)
    assert.equal(Object.isFrozen(args), true)
    assert.doesNotThrow(() => stagingPreviewGitPublishProcessOptions(args, limit))
    const value = values.get(key(args))
    if (value === undefined) throw Error('unexpected command')
    return Buffer.isBuffer(value) ? { status: 0, stdout: value } : value
  } }
}

test('clean reviewed source selects exact predecessor and immutable manifest digest, without pushing', async () => {
  assert.equal(STAGING_PREVIEW_GIT_PUSH_NATIVE_ENABLED, false)
  const source = fixture()
  const result = await selectStagingPreviewGitPublication({ runGit: source.runGit })
  assert.deepEqual(result, { status: 'PUBLISH_SOURCE_SELECTED', selectedCommit, predecessorCommit,
    manifestSha256: createHash('sha256').update(manifest).digest('hex') })
  assert.equal(source.calls.some(args => args.includes('push')), false)
  assert.deepEqual(source.calls.at(-1), ['show', `${selectedCommit}:config/staging-account-activation-manifest.json`])
})

test('effective config rejects URL rewriting, hooks, helpers, unknown origin, duplicates and missing keys', () => {
  assert.equal(stagingPreviewGitPublishConfigAccepted(config()), true)
  for (const extra of [
    record(common, 'url.https://attacker.example/.insteadOf', origin),
    record(common, 'core.hooksPath', '/tmp/hooks'), record(common, 'credential.helper', 'shell'),
    record(common, 'push.pushOption', 'unexpected'), record('/tmp/other', 'core.filemode', 'true'),
    record(common, 'remote.origin.url', origin),
  ]) assert.equal(stagingPreviewGitPublishConfigAccepted(config(extra)), false)
  assert.equal(stagingPreviewGitPublishConfigAccepted(Buffer.from(config().toString().replace(record(common, `branch.${branch}.merge`, ref), ''))), false)
  assert.equal(stagingPreviewGitPublishConfigAccepted(Buffer.from(config().toString().replace(record(common, 'remote.origin.url', origin), record(common, 'remote.origin.url', 'https://other.example/repo.git')))), false)
})

test('source identity, remote shape, ancestry and dirty tracked tree fail closed before manifest acceptance', async () => {
  const cases = [
    { args: ['config', '--null', '--list', '--show-origin'], value: config(record(common, 'core.hooksPath', '/tmp/hooks')) },
    { args: ['rev-parse', '--show-toplevel'], value: Buffer.from('/other\n') },
    { args: ['symbolic-ref', '--quiet', '--short', 'HEAD'], value: Buffer.from('main\n') },
    { args: ['config', '--local', '--get', 'remote.origin.url'], value: Buffer.from('https://other.example/repo.git\n') },
    { args: ['status', '--porcelain=v1', '--untracked-files=no'], value: Buffer.from(' M app/page.tsx\n') },
    { args: ['rev-parse', 'HEAD'], value: Buffer.from('invalid\n') },
    { args: ['ls-remote', '--heads', origin, ref], value: Buffer.from(`${predecessorCommit}\trefs/heads/main\n`) },
    { args: ['ls-remote', '--heads', origin, ref], value: Buffer.from(`${selectedCommit}\t${ref}\n`) },
    { args: ['merge-base', '--is-ancestor', predecessorCommit, selectedCommit], value: Buffer.from('unexpected\n') },
  ]
  for (const { args, value } of cases) {
    const source = fixture({ [key(args)]: value })
    assert.deepEqual(await selectStagingPreviewGitPublication({ runGit: source.runGit }), { status: 'PUBLISH_SOURCE_HOLD' })
    assert.equal(source.calls.some(call => call[0] === 'show'), false)
  }
  assert.deepEqual(await selectStagingPreviewGitPublication({ runGit: async () => { throw Error('private diagnostic') } }),
    { status: 'PUBLISH_SOURCE_HOLD' })
  const nonAncestor = fixture({ [key(['merge-base', '--is-ancestor', predecessorCommit, selectedCommit])]:
    { status: 1, stdout: Buffer.alloc(0) } })
  assert.deepEqual(await selectStagingPreviewGitPublication({ runGit: nonAncestor.runGit }),
    { status: 'PUBLISH_SOURCE_HOLD' })
})

test('one fixed lease/refspec has no arbitrary URL, force flag, hook execution or extra ref', () => {
  const args = stagingPreviewGitPushCommand({ selectedCommit, predecessorCommit })
  assert.deepEqual(args, ['-c', 'core.hooksPath=/dev/null', '-c', 'credential.helper=',
    '-c', 'credential.https://github.com.helper=!/Users/tobiastipper/.local/bin/gh auth git-credential',
    'push', '--porcelain', '--no-verify',
    `--force-with-lease=${ref}:${predecessorCommit}`, '--', origin, `${selectedCommit}:${ref}`])
  assert.equal(Object.isFrozen(args), true)
  const options = stagingPreviewGitPublishProcessOptions(args, 4_096)
  assert.equal(options.env.GIT_CONFIG_GLOBAL, '/dev/null')
  assert.equal(options.env.GIT_TERMINAL_PROMPT, '0')
  assert.equal(options.env.GIT_NO_LAZY_FETCH, '1')
  assert.equal(options.env.HOME, '/Users/tobiastipper')
  assert.equal(options.env.GH_CONFIG_DIR, '/Users/tobiastipper/.config/gh')
  assert.deepEqual(options.stdio, ['ignore', 'ignore', 'ignore'])
  assert.equal(options.cwd, root)
  for (const changed of [
    [], ['push'],
    [...args.slice(0, 11), 'https://other.example/repo.git', args[12]],
    [...args.slice(0, 12), `+${selectedCommit}:${ref}`],
    [...args.slice(0, 5), 'credential.https://github.com.helper=!/tmp/other', ...args.slice(6)],
    [...args, 'main:main'],
    [...args.slice(0, 3), '--force', ...args.slice(3)],
  ]) assert.throws(() => stagingPreviewGitPublishProcessOptions(changed, 4_096), /Git publication command unavailable/)
  assert.throws(() => stagingPreviewGitPushCommand({ selectedCommit: predecessorCommit, predecessorCommit }), /unavailable/)
  const spoofed = ['push', 'https://unreviewed.invalid/repo.git', 'HEAD:refs/heads/main']
  spoofed.every = () => true
  spoofed.join = () => 'rev-parse\0--show-toplevel'
  assert.equal(captureStagingPreviewGitArguments(spoofed), null)
  assert.throws(() => stagingPreviewGitPublishProcessOptions(spoofed, 4_096), /command unavailable/)
  const accessor = ['rev-parse', '--show-toplevel']
  let reads = 0
  Object.defineProperty(accessor, '0', { enumerable: true, configurable: true, get() { reads++; return 'rev-parse' } })
  assert.equal(captureStagingPreviewGitArguments(accessor), null)
  assert.equal(reads, 0)
})

test('contract has no process, token, fetch or live Git push capability', () => {
  const source = readFileSync(new URL('../scripts/staging-preview-git-publish-native-contract.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /spawnSync|child_process|fetch\(|Keychain|process\.argv/)
})
