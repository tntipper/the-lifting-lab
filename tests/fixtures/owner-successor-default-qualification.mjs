/** Disposable exact-policy source copy. No tracked source edits or native authority. */
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, writeFileSync, chmodSync, symlinkSync, rmSync, mkdirSync, realpathSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repository = fileURLToPath(new URL('../../', import.meta.url))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
export function createSuccessorDefaultQualificationSource() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'tll-successor-default-qualification-')))
  const git = args => execFileSync('/usr/bin/git', args, { cwd: root, encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', LANG: 'C', HOME: '/var/empty', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
    stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 }).trim()
  try {
    for (const directory of ['scripts', 'config']) cpSync(join(repository, directory), join(root, directory), { recursive: true })
    // External toolchain fixture substitution precedes the synthetic disabled base.
    // Native product source retains its reviewed executable pins. Here actual local Git
    // and its HTTPS helper are copied and byte-pinned so Linux needs no Mac runtime mount.
    const preflightPath = join(root, 'scripts/staging-preview-git-source-preflight.mjs')
    let toolchain = readFileSync(preflightPath, 'utf8')
    const originalGit = /const gitBinary = '([^']+)'/.exec(toolchain)[1]
    const localGit = existsSync(originalGit) ? originalGit : '/usr/bin/git'
    const originalExec = /const gitExecPath = '([^']+)'/.exec(toolchain)[1]
    const localExec = localGit === originalGit && existsSync(originalExec) ? originalExec : execFileSync(localGit, ['--exec-path'], { encoding: 'utf8' }).trim()
    const qualifiedBin = join(root, 'qualification-toolchain/git'), qualifiedExec = join(root, 'qualification-toolchain/git-core')
    mkdirSync(qualifiedExec, { recursive: true, mode: 0o700 })
    cpSync(realpathSync(localGit), qualifiedBin); chmodSync(qualifiedBin, 0o755)
    cpSync(realpathSync(join(localExec, 'git-remote-http')), join(qualifiedExec, 'git-remote-http'))
    chmodSync(join(qualifiedExec, 'git-remote-http'), 0o755)
    symlinkSync('git-remote-http', join(qualifiedExec, 'git-remote-https'))
    for (const [name, value] of Object.entries({ gitBinary: qualifiedBin, gitExecPath: qualifiedExec,
      gitBinarySha256: hash(readFileSync(qualifiedBin)), gitHttpsHelperSha256: hash(readFileSync(join(qualifiedExec, 'git-remote-http'))) })) {
      toolchain = toolchain.replace(new RegExp(`const ${name} = '[^']+'`), `const ${name} = '${value}'`)
    }
    writeFileSync(preflightPath, toolchain)
    const fixedReader = join(root, 'scripts/staging-owner-successor-fixed-source-reader.mjs')
    writeFileSync(fixedReader, readFileSync(fixedReader, 'utf8')
      .replace(/const GIT = '[^']+'/, `const GIT = '${qualifiedBin}'`)
      .replace(/const EXEC = '[^']+'/, `const EXEC = '${qualifiedExec}'`))
    for (const path of ['lib/server/staging-postgres.ts', 'lib/identity/staging-owner-successor-broker-readiness-edge.ts']) {
      mkdirSync(dirname(join(root, path)), { recursive: true }); cpSync(join(repository, path), join(root, path))
    }
    // Module resolution only: fixture never writes through this link.
    symlinkSync(join(repository, 'node_modules'), join(root, 'node_modules'))
    const policy = JSON.parse(readFileSync(join(root, 'config/staging-owner-successor-source-policy.json'), 'utf8'))
    for (const path of Object.keys(policy.gates)) chmodSync(join(root, path), 0o644)
    git(['init', '-q', '--initial-branch=codex/tll-integration'])
    git(['config', 'gc.auto', '0']); git(['config', 'maintenance.auto', 'false'])
    git(['config', 'user.name', 'Local synthetic qualification']); git(['config', 'user.email', 'qualification@example.invalid'])
    git(['config', 'remote.origin.url', policy.origin])
    git(['add', 'scripts', 'config', 'lib']); git(['commit', '-qm', 'Synthetic disabled qualification base'])
    const reviewedBaseSha = git(['rev-parse', 'HEAD'])
    const startedAt = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString()
    const expiresAt = new Date(Date.parse(startedAt) + 60 * 60_000).toISOString()
    for (const [path, names] of Object.entries(policy.gates)) {
      let text = readFileSync(join(root, path), 'utf8')
      for (const name of names) {
        const before = `export const ${name} = false\n`
        assert.equal(text.split(before).length, 2, `exact disabled gate ${path}:${name}`)
        text = text.replace(before, before.replace('false', 'true'))
      }
      if (path === policy.contextPath) for (const [name, value] of Object.entries({ ACTIVE_WINDOW_STARTED_AT: startedAt, ACTIVE_WINDOW_EXPIRES_AT: expiresAt })) {
        const before = `export const ${name} = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'`
        assert.equal(text.split(before).length, 2); text = text.replace(before, `export const ${name} = '${value}'`)
      }
      writeFileSync(join(root, path), text, { mode: 0o644 })
    }
    git(['add', 'scripts', 'lib']); git(['commit', '-qm', 'Synthetic exact-policy arming child'])
    const executionCommit = git(['rev-parse', 'HEAD'])
    assert.equal(git(['status', '--porcelain=v1', '--untracked-files=no']), '')
    const manifestSha256 = hash(readFileSync(join(root, policy.manifest)))
    const proof = Object.freeze({ status: 'OWNER_SUCCESSOR_SOURCE_VERIFIED', authorization: 'NONE',
      sourceCommit: reviewedBaseSha, executionCommit, manifestSha256, startedAt, expiresAt })
    return Object.freeze({ root, policy, proof, git,
      import: name => import(pathToFileURL(join(root, 'scripts', name)).href),
      dispose: () => rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }) })
  } catch (error) { rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); throw error }
}
