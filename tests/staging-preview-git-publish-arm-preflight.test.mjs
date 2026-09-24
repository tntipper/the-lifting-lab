import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { verifyStagingPreviewGitPublishArm,
  STAGING_PREVIEW_GIT_PUBLISH_ARM_ROOT } from '../scripts/staging-preview-git-publish-arm-preflight.mjs'

const selectedCommit = 'a'.repeat(40), executionCommit = 'b'.repeat(40)
const branch = 'codex/tll-preview-publish-arm-v1'
const paths = 'config/staging-account-activation-manifest.json\nscripts/staging-preview-git-publish-live-launcher.mjs\n'
const names = paths.trimEnd().split('\n')
const bytes = [Buffer.from('manifest\n'), Buffer.from('launcher\n')]
const tree = Buffer.from(names.map((name, index) => `100644 blob ${String(index + 1).repeat(40)}\t${name}\0`).join(''))
const key = args => args.join('\0')
function fixture(overrides = {}) {
  const values = new Map([
    [['rev-parse', '--show-toplevel'], Buffer.from(`${STAGING_PREVIEW_GIT_PUBLISH_ARM_ROOT}\n`)],
    [['symbolic-ref', '--quiet', '--short', 'HEAD'], Buffer.from(`${branch}\n`)],
    [['status', '--porcelain=v1', '--untracked-files=all'], Buffer.alloc(0)],
    [['rev-parse', 'HEAD'], Buffer.from(`${executionCommit}\n`)],
    [['rev-list', '--parents', '-n', '1', 'HEAD'], Buffer.from(`${executionCommit} ${selectedCommit}\n`)],
    [['diff-tree', '--no-commit-id', '--name-only', '-r', selectedCommit, executionCommit], Buffer.from(paths)],
    [['ls-tree', '-z', executionCommit, '--', ...names], tree],
    [['show', `${executionCommit}:${names[0]}`], Buffer.from(bytes[0])],
    [['show', `${executionCommit}:${names[1]}`], Buffer.from(bytes[1])],
  ].map(([args, value]) => [key(args), value]))
  for (const [command, value] of Object.entries(overrides)) values.set(command, value)
  const calls = []
  return { calls, runGit: async (args, limit) => {
    assert.equal(Object.isFrozen(args), true)
    assert.equal(limit, args[0] === 'show' ? 262_144 : 4_096)
    calls.push(args)
    const result = values.get(key(args))
    if (result === undefined) throw Error('unexpected command')
    return Buffer.isBuffer(result) ? { status: 0, stdout: result } : result
  } }
}

test('clean local-only arming worktree is exactly one commit above the selected source', async () => {
  const source = fixture()
  assert.deepEqual(await verifyStagingPreviewGitPublishArm({ runGit: source.runGit, selectedCommit,
    approvedExecutionCommit: executionCommit, readFile: path => Buffer.from(bytes[names.findIndex(name => path.endsWith(name))]) }),
    { status: 'ARMING_WORKTREE_VERIFIED', executionCommit, sourceCommit: selectedCommit })
  assert.equal(source.calls.length, 9)
  assert.equal(source.calls.some(args => args.includes('push')), false)
})

test('wrong worktree, branch, dirty tree, parent or changed paths hold before publication', async () => {
  const cases = [
    { args: ['rev-parse', '--show-toplevel'], value: Buffer.from('/other\n') },
    { args: ['symbolic-ref', '--quiet', '--short', 'HEAD'], value: Buffer.from('main\n') },
    { args: ['status', '--porcelain=v1', '--untracked-files=all'], value: Buffer.from('?? secret\n') },
    { args: ['rev-parse', 'HEAD'], value: Buffer.from(`${selectedCommit}\n`) },
    { args: ['rev-list', '--parents', '-n', '1', 'HEAD'], value: Buffer.from(`${executionCommit} ${'c'.repeat(40)}\n`) },
    { args: ['rev-list', '--parents', '-n', '1', 'HEAD'], value: Buffer.from(`${executionCommit} ${selectedCommit} ${'c'.repeat(40)}\n`) },
    { args: ['diff-tree', '--no-commit-id', '--name-only', '-r', selectedCommit, executionCommit],
      value: Buffer.from(`${paths}app/page.tsx\n`) },
    { args: ['diff-tree', '--no-commit-id', '--name-only', '-r', selectedCommit, executionCommit],
      value: Buffer.from('scripts/staging-preview-git-publish-live-launcher.mjs\n') },
    { args: ['ls-tree', '-z', executionCommit, '--', ...names],
      value: Buffer.from(`120000 blob ${'c'.repeat(40)}\t${names[0]}\0`) },
    { args: ['show', `${executionCommit}:${names[0]}`], value: Buffer.from('tampered\n') },
  ]
  for (const { args, value } of cases) {
    const source = fixture({ [key(args)]: value })
    assert.deepEqual(await verifyStagingPreviewGitPublishArm({ runGit: source.runGit, selectedCommit,
      approvedExecutionCommit: executionCommit, readFile: path => Buffer.from(bytes[names.findIndex(name => path.endsWith(name))]) }),
      { status: 'ARMING_WORKTREE_HOLD' })
  }
  const failure = fixture({ [key(['rev-list', '--parents', '-n', '1', 'HEAD'])]:
    { status: 1, stdout: Buffer.alloc(0) } })
  assert.deepEqual(await verifyStagingPreviewGitPublishArm({ runGit: failure.runGit, selectedCommit,
    approvedExecutionCommit: executionCommit, readFile: () => Buffer.alloc(0) }),
    { status: 'ARMING_WORKTREE_HOLD' })
})

test('unapproved execution commit or changed local bytes cannot pass', async () => {
  const source = fixture()
  assert.deepEqual(await verifyStagingPreviewGitPublishArm({ runGit: source.runGit, selectedCommit,
    approvedExecutionCommit: 'c'.repeat(40), readFile: () => Buffer.alloc(0) }),
  { status: 'ARMING_WORKTREE_HOLD' })
  const changedFile = fixture()
  assert.deepEqual(await verifyStagingPreviewGitPublishArm({ runGit: changedFile.runGit, selectedCommit,
    approvedExecutionCommit: executionCommit, readFile: () => Buffer.from('changed after commit\n') }),
  { status: 'ARMING_WORKTREE_HOLD' })
})

test('no caller-chosen root, shell, process or network path exists', async () => {
  assert.deepEqual(await verifyStagingPreviewGitPublishArm({ selectedCommit }), { status: 'ARMING_WORKTREE_HOLD' })
  const source = readFileSync(new URL('../scripts/staging-preview-git-publish-arm-preflight.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /spawnSync|child_process|fetch\(|process\.argv|Keychain/)
})
