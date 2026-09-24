import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createStagingPreviewGitPublishNativeReadPort } from '../scripts/staging-preview-git-publish-native-read.mjs'
import { stagingPreviewGitPublishConfigAccepted, stagingPreviewGitPushCommand } from '../scripts/staging-preview-git-publish-native-contract.mjs'
import { stagingPreviewGitExecutableReady, stagingPreviewGitHttpsHelperReady } from '../scripts/staging-preview-git-source-preflight.mjs'

const root = resolve(import.meta.dirname, '..')
const ancestor = '84b5e6bd4c20c72cde7c0493db885f82f037ec27'
const fixedOrigin = 'https://github.com/tntipper/the-lifting-lab.git'
const fixedRef = 'refs/heads/codex/tll-integration'

test('pinned native read port observes the exact checkout and allowed effective configuration', t => {
  if (!stagingPreviewGitExecutableReady() || !stagingPreviewGitHttpsHelperReady()) {
    return t.skip('pinned native Git is unavailable on this host')
  }
  const port = createStagingPreviewGitPublishNativeReadPort()
  const top = port.runGit(['rev-parse', '--show-toplevel'], 4_096)
  assert.equal(top.status, 0)
  assert.equal(top.stdout.toString('utf8'), `${root}\n`)
  const config = port.runGit(['config', '--null', '--list', '--show-origin'], 65_536)
  assert.equal(config.status, 0)
  assert.equal(stagingPreviewGitPublishConfigAccepted(config.stdout), true)
  config.stdout.fill(0)
})

test('real merge-base non-ancestry retains exit status 1 with empty stdout', t => {
  if (!stagingPreviewGitExecutableReady() || !stagingPreviewGitHttpsHelperReady()) {
    return t.skip('pinned native Git is unavailable on this host')
  }
  const port = createStagingPreviewGitPublishNativeReadPort()
  const head = port.runGit(['rev-parse', 'HEAD'], 4_096).stdout.toString('utf8').trim()
  assert.match(head, /^[a-f0-9]{40}$/)
  assert.notEqual(head, ancestor)
  const valid = port.runGit(['merge-base', '--is-ancestor', ancestor, head], 4_096)
  assert.equal(valid.status, 0)
  assert.equal(valid.stdout.length, 0)
  const reversed = port.runGit(['merge-base', '--is-ancestor', head, ancestor], 4_096)
  assert.equal(reversed.status, 1)
  assert.equal(reversed.stdout.length, 0)
})

test('native read port rejects push, substituted remote and unreviewed command before execution', () => {
  const port = createStagingPreviewGitPublishNativeReadPort()
  const sha = 'a'.repeat(40), predecessor = 'b'.repeat(40)
  assert.throws(() => port.runGit(stagingPreviewGitPushCommand({ selectedCommit: sha,
    predecessorCommit: predecessor }), 4_096), /read unavailable/)
  assert.throws(() => port.runGit(['ls-remote', '--heads', 'https://other.example/repo.git', fixedRef], 4_096), /command unavailable/)
  assert.throws(() => port.runGit(['push', fixedOrigin, `${sha}:${fixedRef}`], 4_096), /read unavailable/)
  assert.throws(() => port.runGit(['status', '--porcelain'], 4_096), /command unavailable/)
})

test('overridden methods and accessors cannot turn validation into a different spawned command', () => {
  let spawns = 0
  const port = createStagingPreviewGitPublishNativeReadPort({ spawn: () => { spawns++; return {
    status: 0, stdout: Buffer.from(`${root}\n`), signal: null,
  } } })
  const spoofed = ['push', 'https://unreviewed.invalid/repo.git', 'HEAD:refs/heads/main']
  spoofed.includes = () => false
  spoofed.every = () => true
  spoofed.join = () => 'rev-parse\0--show-toplevel'
  assert.throws(() => port.runGit(spoofed, 4_096), /read unavailable/)
  const accessor = ['rev-parse', '--show-toplevel']
  let reads = 0
  Object.defineProperty(accessor, '1', { enumerable: true, configurable: true, get() { reads++; return '--show-toplevel' } })
  assert.throws(() => port.runGit(accessor, 4_096), /read unavailable/)
  assert.equal(reads, 0)
  assert.equal(spawns, 0)

  const mutable = ['rev-parse', '--show-toplevel']
  const result = createStagingPreviewGitPublishNativeReadPort({ spawn: (_binary, received) => {
    spawns++
    assert.equal(received[0], 'rev-parse')
    assert.equal(received[1], '--show-toplevel')
    assert.equal(Object.isFrozen(received), true)
    assert.notEqual(received, mutable)
    mutable[0] = 'push'
    return { status: 0, stdout: Buffer.from(`${root}\n`), signal: null }
  } }).runGit(mutable, 4_096)
  assert.equal(result.status, 0)
  assert.equal(spawns, 1)
})

test('read port contains no live CLI, token or push process binding', () => {
  const source = readFileSync(new URL('../scripts/staging-preview-git-publish-native-read.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /Keychain|process\.argv|createPreviewGitPublishJournal|\.execute\(/)
  assert.match(source, /captured\[0\] === '-c'/)
  assert.match(source, /spawn\(gitBinary, captured, options\)/)
})
