import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { readStagingPreviewGitSourceProof, stagingPreviewGitProcessOptions } from '../scripts/staging-preview-git-source-preflight.mjs'

const sha = 'a'.repeat(40)
const branch = 'codex/tll-integration'
const key = args => args.join('\u0000')
function fixture(overrides = {}) {
  const manifest = Buffer.from('{"source":"committed"}\n')
  const values = new Map([
    [['rev-parse', '--show-toplevel'], Buffer.from(`${resolve(import.meta.dirname, '..')}\n`)],
    [['symbolic-ref', '--quiet', '--short', 'HEAD'], Buffer.from(`${branch}\n`)],
    [['config', '--local', '--get', 'remote.origin.url'], Buffer.from('https://github.com/tntipper/the-lifting-lab.git\n')],
    [['status', '--porcelain=v1', '--untracked-files=no'], Buffer.alloc(0)],
    [['rev-parse', 'HEAD'], Buffer.from(`${sha}\n`)],
    [['ls-remote', '--heads', 'https://github.com/tntipper/the-lifting-lab.git', `refs/heads/${branch}`], Buffer.from(`${sha}\trefs/heads/${branch}\n`)],
    [['show', `${sha}:config/staging-account-activation-manifest.json`], manifest],
  ].map(([args, value]) => [key(args), value]))
  for (const [args, value] of Object.entries(overrides)) values.set(args, value)
  const calls = []
  return { manifest, calls, runGit: async (args, maxBuffer) => {
    calls.push(args)
    assert.equal(Object.isFrozen(args), true)
    assert.ok(maxBuffer === 4_096 || maxBuffer === 262_144)
    const value = values.get(key(args))
    if (value === undefined) throw new Error('Unexpected Git command')
    return value
  } }
}

test('exact clean local and remote commit hashes the committed manifest bytes only', async () => {
  const source = fixture()
  const expected = createHash('sha256').update(source.manifest).digest('hex')
  const result = await readStagingPreviewGitSourceProof({ runGit: source.runGit })
  assert.deepEqual(result, { status: 'SOURCE_PROOF_VERIFIED', sourceCommit: sha, manifestSha256: expected })
  assert.ok(source.manifest.every(byte => byte === 0))
  assert.deepEqual(source.calls.at(-1), ['show', `${sha}:config/staging-account-activation-manifest.json`])
})

test('local-only commit holds before reading the manifest', async () => {
  const source = fixture({ [key(['ls-remote', '--heads', 'https://github.com/tntipper/the-lifting-lab.git', `refs/heads/${branch}`])]: Buffer.from(`${'b'.repeat(40)}\trefs/heads/${branch}\n`) })
  assert.deepEqual(await readStagingPreviewGitSourceProof({ runGit: source.runGit }), { status: 'SOURCE_NOT_AT_REMOTE' })
  assert.equal(source.calls.some(args => args[0] === 'show'), false)
})

test('wrong repository, branch, remote ref, dirty tree and malformed hashes hold closed', async () => {
  const cases = [
    { args: ['config', '--local', '--get', 'remote.origin.url'], value: 'https://github.com/other/repo.git\n' },
    { args: ['symbolic-ref', '--quiet', '--short', 'HEAD'], value: 'main\n' },
    { args: ['status', '--porcelain=v1', '--untracked-files=no'], value: ' M app/page.tsx\n' },
    { args: ['rev-parse', 'HEAD'], value: 'abc\n' },
    { args: ['ls-remote', '--heads', 'https://github.com/tntipper/the-lifting-lab.git', `refs/heads/${branch}`], value: `${sha}\trefs/heads/main\n` },
    { args: ['ls-remote', '--heads', 'https://github.com/tntipper/the-lifting-lab.git', `refs/heads/${branch}`], value: `${sha}\trefs/heads/${branch}\n${sha}\trefs/heads/${branch}\n` },
  ]
  for (const { args, value } of cases) {
    const source = fixture({ [key(args)]: Buffer.from(value) })
    assert.deepEqual(await readStagingPreviewGitSourceProof({ runGit: source.runGit }), { status: 'SOURCE_PROOF_UNAVAILABLE' })
    assert.equal(source.calls.some(command => command[0] === 'show'), false)
  }
})

test('failed Git command or oversized committed manifest returns a fixed HOLD', async () => {
  assert.deepEqual(await readStagingPreviewGitSourceProof({ runGit: async () => { throw new Error('private Git diagnostics') } }),
    { status: 'SOURCE_PROOF_UNAVAILABLE' })
  const source = fixture({ [key(['show', `${sha}:config/staging-account-activation-manifest.json`])]: Buffer.alloc(262_145) })
  assert.deepEqual(await readStagingPreviewGitSourceProof({ runGit: source.runGit }), { status: 'SOURCE_PROOF_UNAVAILABLE' })
})

test('actual Git runner policy isolates the fixed remote URL and rejects config or command overrides', () => {
  const remote = stagingPreviewGitProcessOptions(
    ['ls-remote', '--heads', 'https://github.com/tntipper/the-lifting-lab.git', `refs/heads/${branch}`], 4_096)
  assert.equal(remote.cwd, '/')
  assert.equal(remote.env.GIT_CONFIG_NOSYSTEM, '1')
  assert.equal(remote.env.GIT_CONFIG_GLOBAL, '/dev/null')
  assert.equal(remote.env.GIT_NO_REPLACE_OBJECTS, '1')
  assert.equal(remote.env.GIT_TERMINAL_PROMPT, '0')
  assert.equal(remote.env.GIT_ASKPASS, '/usr/bin/false')
  assert.equal(Object.keys(remote.env).some(name => name.startsWith('GIT_CONFIG_KEY_')), false)
  const local = stagingPreviewGitProcessOptions(['show', `${sha}:config/staging-account-activation-manifest.json`], 262_144)
  assert.equal(local.cwd, resolve(import.meta.dirname, '..'))
  for (const args of [
    ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`],
    ['show', 'HEAD:config/staging-account-activation-manifest.json'],
    ['push', 'origin', branch],
  ]) assert.throws(() => stagingPreviewGitProcessOptions(args, 4_096), /Git source proof unavailable/)
})
