/** Owned local worktree for the unchanged native publication read/config policy. */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { stagingPreviewGitExecutableReady, stagingPreviewGitHttpsHelperReady } from '../../scripts/staging-preview-git-source-preflight.mjs'

const sourceRoot = resolve(import.meta.dirname, '../..')
const git = '/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/bin/git'
const execPath = '/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/libexec/git-core'
const modules = ['staging-preview-git-source-preflight.mjs', 'staging-preview-git-publish-native-contract.mjs', 'staging-preview-git-publish-native-read.mjs']

export async function createStagingPreviewGitNativeConfigFixture() {
  if (!stagingPreviewGitExecutableReady() || !stagingPreviewGitHttpsHelperReady()) throw Error('Pinned fixture Git unavailable')
  const directory = realpathSync(mkdtempSync(resolve(tmpdir(), 'tll-native-config-')))
  const common = resolve(directory, 'audit-code'), root = resolve(directory, 'implementation-integration')
  const env = { PATH: '/usr/bin:/bin', LANG: 'C', HOME: '/var/empty', XDG_CONFIG_HOME: '/var/empty',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: '/usr/bin/false', GIT_EXEC_PATH: execPath, GIT_ALLOW_PROTOCOL: 'file' }
  const run = args => execFileSync(git, ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', ...args],
    { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000, maxBuffer: 65_536 })
  const dispose = () => rmSync(directory, { recursive: true, force: true })
  try {
    run(['init', '--initial-branch=fixture-base', common])
    writeFileSync(resolve(common, 'fixture.txt'), 'owned local fixture\n')
    run(['-C', common, 'add', '--', 'fixture.txt'])
    run(['-C', common, '-c', 'user.name=TLL fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Local fixture'])
    const values = [
      ['core.repositoryformatversion', '1'], ['core.filemode', 'true'], ['core.bare', 'false'],
      ['core.logallrefupdates', 'true'], ['core.ignorecase', 'true'], ['core.precomposeunicode', 'true'],
      ['remote.origin.url', 'https://github.com/tntipper/the-lifting-lab.git'],
      ['remote.origin.fetch', '+refs/heads/main:refs/remotes/origin/main'], ['remote.origin.promisor', 'true'],
      ['remote.origin.partialclonefilter', 'blob:none'], ['extensions.worktreeconfig', 'true'],
      ['branch.codex/tll-integration.remote', 'origin'], ['branch.codex/tll-integration.merge', 'refs/heads/codex/tll-integration'],
    ]
    for (const [key, value] of values) run(['-C', common, 'config', '--local', key, value])
    run(['-C', common, 'worktree', 'add', '-b', 'codex/tll-integration', root, 'HEAD'])
    for (const key of ['core.sparsecheckout', 'core.sparsecheckoutcone', 'index.sparse']) {
      run(['-C', root, 'config', '--worktree', key, 'false'])
    }
    mkdirSync(resolve(root, 'scripts'))
    for (const name of modules) {
      const original = resolve(sourceRoot, 'scripts', name), copy = resolve(root, 'scripts', name)
      copyFileSync(original, copy)
      if (!readFileSync(original).equals(readFileSync(copy))) throw Error('Fixture module copy changed')
    }
    const portModule = await import(pathToFileURL(resolve(root, 'scripts', modules[2])).href)
    const contract = await import(pathToFileURL(resolve(root, 'scripts', modules[1])).href)
    return { root, port: portModule.createStagingPreviewGitPublishNativeReadPort(),
      accepted: contract.stagingPreviewGitPublishConfigAccepted,
      addForbiddenHook: () => run(['-C', common, 'config', '--local', 'core.hooksPath', '/unreviewed/fixture/hooks']),
      dispose }
  } catch (error) { dispose(); throw error }
}
