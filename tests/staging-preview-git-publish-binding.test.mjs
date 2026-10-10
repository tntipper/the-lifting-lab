import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createStagingPreviewGitPublishBinding, STAGING_PREVIEW_GIT_PUBLISH_BINDING_NATIVE_ENABLED } from '../scripts/staging-preview-git-publish-binding.mjs'
import { createPreviewGitPublishJournal } from '../scripts/staging-preview-git-publish-journal.mjs'

const root = resolve(import.meta.dirname, '..')
const common = resolve(root, '../audit-code/.git/config')
const worktree = resolve(root, '../audit-code/.git/worktrees/implementation-integration/config.worktree')
const origin = 'https://github.com/tntipper/the-lifting-lab.git'
const branch = 'codex/tll-integration', ref = `refs/heads/${branch}`
const selectedCommit = 'a'.repeat(40), predecessorCommit = 'b'.repeat(40)
const manifest = Buffer.from('committed manifest\n')
const manifestSha256 = createHash('sha256').update(manifest).digest('hex')
const expected = Object.freeze({ selectedCommit, predecessorCommit, manifestSha256 })
const record = (path, key, value) => `file:${path}\0${key}\n${value}\0`
const config = Buffer.from([
  record(common, 'core.repositoryformatversion', '1'), record(common, 'core.filemode', 'true'),
  record(common, 'core.bare', 'false'), record(common, 'core.logallrefupdates', 'true'),
  record(common, 'core.ignorecase', 'true'), record(common, 'core.precomposeunicode', 'true'),
  record(common, 'remote.origin.url', origin),
  record(common, 'remote.origin.fetch', '+refs/heads/main:refs/remotes/origin/main'),
  record(common, 'remote.origin.promisor', 'true'), record(common, 'remote.origin.partialclonefilter', 'blob:none'),
  record(common, 'extensions.worktreeconfig', 'true'), record(common, `branch.${branch}.remote`, 'origin'),
  record(common, `branch.${branch}.merge`, ref), record(worktree, 'core.sparsecheckout', 'false'),
  record(worktree, 'core.sparsecheckoutcone', 'false'), record(worktree, 'index.sparse', 'false'),
].join(''))
const HOLD = { status: 'SOURCE_PUBLICATION_HOLD' }

function fixture({ freshHead = selectedCommit, remoteBefore = predecessorCommit,
  remoteAtPreRead = remoteBefore, remoteAtRecheck = remoteBefore,
  remoteAfter = selectedCommit, freshConfig = config, remoteResponses = {} } = {}) {
  let configReads = 0, headReads = 0, remoteReads = 0
  const calls = []
  const runGit = async (args, maxBuffer) => {
    assert.equal(Object.isFrozen(args), true)
    calls.push(args.join(' '))
    let bytes
    switch (args.join('\0')) {
      case 'config\0--null\0--list\0--show-origin': bytes = Buffer.from(++configReads === 1 ? config : freshConfig); break
      case 'rev-parse\0--show-toplevel': bytes = Buffer.from(`${root}\n`); break
      case 'symbolic-ref\0--quiet\0--short\0HEAD': bytes = Buffer.from(`${branch}\n`); break
      case 'config\0--local\0--get\0remote.origin.url': bytes = Buffer.from(`${origin}\n`); break
      case 'status\0--porcelain=v1\0--untracked-files=no': bytes = Buffer.alloc(0); break
      case 'rev-parse\0HEAD': bytes = Buffer.from(`${++headReads === 1 ? selectedCommit : freshHead}\n`); break
      case `ls-remote\0--heads\0${origin}\0${ref}`: {
        remoteReads++
        const remote = [remoteBefore, remoteAtPreRead, remoteAtRecheck, remoteAfter][remoteReads - 1]
        bytes = Buffer.from(`${remote}\t${ref}\n`)
        if (remoteResponses[remoteReads]) return remoteResponses[remoteReads]
        break
      }
      case `merge-base\0--is-ancestor\0${predecessorCommit}\0${selectedCommit}`:
        bytes = Buffer.alloc(0); break
      case `show\0${selectedCommit}:config/staging-account-activation-manifest.json`:
        bytes = Buffer.from(manifest); break
      default: throw Error(`unexpected read: ${args.join(' ')}`)
    }
    assert.ok(bytes.length <= maxBuffer)
    return { status: 0, stdout: bytes }
  }
  return { runGit, calls, counts: () => ({ configReads, headReads, remoteReads }) }
}

async function withJournal(fn) {
  const directory = fs.mkdtempSync(resolve(tmpdir(), 'tll-publish-binding-'))
  const path = resolve(directory, 'private', 'intent.json')
  const journal = createPreviewGitPublishJournal({ path,
    makeRunId: () => '12345678-1234-4234-8234-123456789abc',
    now: () => Date.parse('2026-09-24T12:00:00.000Z') })
  try { await fn({ journal, path }) } finally { fs.rmSync(directory, { recursive: true, force: true }) }
}

test('two source checks bracket pre-read; one durable dispatch precedes injected push and reconciliation', async () => {
  assert.equal(STAGING_PREVIEW_GIT_PUBLISH_BINDING_NATIVE_ENABLED, false)
  await withJournal(async ({ journal }) => {
    const source = fixture()
    let pushes = 0
    const binding = createStagingPreviewGitPublishBinding({ runGit: source.runGit, journal,
      push: async selected => {
        pushes++
        assert.equal(source.counts().configReads, 2)
        assert.equal(source.counts().remoteReads, 3)
        assert.equal(journal.read().phase, 'DISPATCH_RECORDED')
        assert.deepEqual(selected, { selectedCommit, predecessorCommit, manifestSha256 })
      },
    })
    assert.deepEqual(await binding.execute(expected), { status: 'SOURCE_PUBLISHED_PREVIEW_UNVERIFIED',
      sourceCommit: selectedCommit, manifestSha256 }, source.calls.join(' | '))
    assert.equal(journal.read().outcome, 'REMOTE_SELECTED')
    assert.deepEqual(await binding.execute(expected), HOLD)
    assert.equal(pushes, 1)
    assert.equal(source.counts().remoteReads, 4)
    assert.equal(source.calls.some(call => call.includes(' push ')), false)
  })
})

test('source or remote drift stops before a journal or push', async () => {
  for (const options of [
    { freshHead: 'd'.repeat(40) },
    { freshConfig: Buffer.from('unreviewed\0') },
    { remoteBefore: 'd'.repeat(40) },
    { remoteAtPreRead: 'd'.repeat(40) },
    { remoteAtRecheck: 'd'.repeat(40) },
  ]) await withJournal(async ({ journal, path }) => {
    const source = fixture(options)
    const result = await createStagingPreviewGitPublishBinding({ runGit: source.runGit, journal,
      push: async () => assert.fail('no push'),
    }).execute(expected)
    assert.deepEqual(result, HOLD)
    assert.equal(fs.existsSync(path), false)
  })
})

test('action-approved commit, predecessor and manifest are pinned before any dispatch', async () => {
  for (const changed of [
    { ...expected, selectedCommit: 'd'.repeat(40) },
    { ...expected, predecessorCommit: 'd'.repeat(40) },
    { ...expected, manifestSha256: 'd'.repeat(64) },
    { ...expected, extra: true },
  ]) await withJournal(async ({ journal, path }) => {
    const source = fixture()
    const binding = createStagingPreviewGitPublishBinding({ runGit: source.runGit, journal,
      push: async () => assert.fail('no push') })
    assert.deepEqual(await binding.execute(changed), HOLD)
    assert.equal(fs.existsSync(path), false)
  })
  await withJournal(async ({ journal, path }) => {
    let getterReads = 0, gitReads = 0
    const accessor = { ...expected }
    Object.defineProperty(accessor, 'selectedCommit', { get() { getterReads++; return selectedCommit } })
    assert.deepEqual(await createStagingPreviewGitPublishBinding({ journal,
      runGit: async () => { gitReads++ }, push: async () => assert.fail('no push'),
    }).execute(accessor), HOLD)
    assert.equal(getterReads, 0)
    assert.equal(gitReads, 0)
    assert.equal(fs.existsSync(path), false)
  })
})

test('remote response decoder holds on nonzero, oversized, malformed or extra refs before dispatch', async () => {
  const invalid = [
    { status: 1, stdout: Buffer.from(`${predecessorCommit}\t${ref}\n`) },
    { status: 0, stdout: Buffer.alloc(4_097) },
    { status: 0, stdout: Buffer.from(`${predecessorCommit}\t${ref}\n${predecessorCommit}\t${ref}\n`) },
    { status: 0, stdout: Buffer.from(`${predecessorCommit}\trefs/heads/main\n`) },
  ]
  for (const response of invalid) await withJournal(async ({ journal, path }) => {
    const source = fixture({ remoteResponses: { 2: response } })
    assert.deepEqual(await createStagingPreviewGitPublishBinding({ runGit: source.runGit, journal,
      push: async () => assert.fail('no push'),
    }).execute(expected), HOLD)
    assert.equal(fs.existsSync(path), false)
  })
})

test('uncertain push and malformed reconciliation are terminal and never retry', async () => {
  for (const response of [
    { status: 1, stdout: Buffer.alloc(0) },
    { status: 0, stdout: Buffer.alloc(4_097) },
    { status: 0, stdout: Buffer.from(`${selectedCommit}\t${ref}\n${selectedCommit}\t${ref}\n`) },
  ]) await withJournal(async ({ journal }) => {
    const source = fixture({ remoteResponses: { 4: response } })
    let pushes = 0
    const binding = createStagingPreviewGitPublishBinding({ runGit: source.runGit, journal,
      push: async () => { pushes++; throw Error('acknowledgement unknown') },
    })
    assert.deepEqual(await binding.execute(expected), HOLD)
    assert.equal(journal.read().outcome, 'REMOTE_UNAVAILABLE')
    assert.deepEqual(await binding.execute(expected), HOLD)
    assert.equal(pushes, 1)
  })
  await withJournal(async ({ journal }) => {
    const source = fixture()
    let pushes = 0
    const result = await createStagingPreviewGitPublishBinding({ runGit: source.runGit, journal,
      push: async () => { pushes++; throw Error('acknowledgement unknown') },
    }).execute(expected)
    assert.equal(result.status, 'SOURCE_PUBLISHED_PREVIEW_UNVERIFIED')
    assert.equal(journal.read().outcome, 'REMOTE_SELECTED')
    assert.equal(pushes, 1)
  })
})

test('missing ports consume the binding and no native process path exists', async () => {
  assert.deepEqual(await createStagingPreviewGitPublishBinding().execute(expected), HOLD)
  const source = fs.readFileSync(new URL('../scripts/staging-preview-git-publish-binding.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /spawnSync|child_process|fetch\(|Keychain|process\.argv/)
})
