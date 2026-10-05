import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, chmodSync, symlinkSync, realpathSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Real local Git and the entire fixed registry. Only remote metadata and native
// helper qualification are substituted in disposable source copies; no fetch.
const sourceRoot = fileURLToPath(new URL('../', import.meta.url))
const git = '/usr/bin/git'
const policyPath = 'config/staging-owner-successor-source-policy.json'
const readerPath = 'scripts/staging-owner-successor-fixed-source-reader.mjs'
const contextPath = 'scripts/staging-owner-successor-sql-context.mjs'
const manifestPath = 'config/staging-account-activation-manifest.json'
const start = '2030-01-01T12:00:00.000Z', end = '2030-01-01T13:00:00.000Z'
const now = () => Date.parse(start) + 1000
const origin = 'https://github.com/tntipper/the-lifting-lab.git'
const branch = 'codex/tll-integration'
const env = { PATH: '/usr/bin:/bin', LANG: 'C', HOME: '/var/empty',
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_AUTHOR_NAME: 'Synthetic fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'Synthetic fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' }

test('ordinary fixed reader remains OFF without touching handoff, clock or native helper inputs', async () => {
  const ordinary = await import('../scripts/staging-owner-successor-fixed-source-reader.mjs')
  const handoff = new Proxy({}, { get() { assert.fail('OFF reader inspected handoff') } })
  const result = await ordinary.readFixedOwnerSuccessorSource({ handoff,
    signal: new Proxy({}, { get() { assert.fail('OFF reader inspected signal') } }),
    now: () => assert.fail('OFF reader read clock') })
  assert.deepEqual(result, { status: 'OWNER_SUCCESSOR_SOURCE_HOLD', authorization: 'NONE' })
})
function execute(root, args) {
  const result = spawnSync(git, args, { cwd: root, env, encoding: 'utf8', timeout: 15000 })
  assert.equal(result.status, 0, `Local Git failed: ${args[0]}`)
  return result.stdout.trim()
}
function put(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true, mode: 0o700 })
  writeFileSync(join(root, path), text, { mode: 0o600 })
}
async function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'tll-fixed-source-git-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const rawPolicy = readFileSync(join(sourceRoot, policyPath), 'utf8'), registry = JSON.parse(rawPolicy)
  assert.ok(Object.keys(registry.gates).length >= 70, 'Exercise the complete fixed registry, not a subset')
  execute(root, ['init', '--initial-branch', branch])
  execute(root, ['config', 'core.filemode', 'true'])
  execute(root, ['config', 'remote.origin.url', origin])
  for (const path of Object.keys(registry.gates)) put(root, path, readFileSync(join(sourceRoot, path), 'utf8'))
  put(root, policyPath, rawPolicy)
  put(root, manifestPath, '{"fixture":"fixed-source-local-git-only"}\n')
  put(root, 'scripts/staging-preview-git-source-preflight.mjs',
    'export const stagingPreviewGitExecutableReady = () => true\nexport const stagingPreviewGitHttpsHelperReady = () => true\n')
  let reader = readFileSync(join(root, readerPath), 'utf8')
  reader = reader.replace("import { spawnSync } from 'node:child_process'", "import { spawnSync as localSpawnSync } from 'node:child_process'\nfunction spawnSync(binary, args, options) {\n if (args.includes('ls-remote')) return { status: 0, stdout: Buffer.from(readFileSync(resolve(ROOT, '.git/fixture-remote-ref'))) }\n return localSpawnSync(binary, args, options)\n}")
    .replace(/^const GIT = .*$/m, `const GIT = '${git}'`)
    .replace(/^const EXEC = .*$/m, `const EXEC = ${JSON.stringify(execute(root, ['--exec-path']))}`)
  put(root, readerPath, reader)
  execute(root, ['add', '.']); execute(root, ['commit', '--quiet', '-m', 'Synthetic reviewed OFF base'])
  const base = execute(root, ['rev-parse', 'HEAD'])
  writeFileSync(join(root, '.git/fixture-remote-ref'), `${base}\trefs/heads/${branch}\n`)
  for (const [path, gates] of Object.entries(registry.gates)) {
    let text = readFileSync(join(root, path), 'utf8')
    for (const gate of gates) {
      const pattern = `export const ${gate} = false\n`
      assert.equal(text.split(pattern).length, 2, `Unique OFF declaration: ${gate}`)
      text = text.replace(pattern, `export const ${gate} = true\n`)
    }
    if (path === contextPath) text = text.replaceAll("'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'", (_, index) =>
      index === text.indexOf("'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'") ? `'${start}'` : `'${end}'`)
    put(root, path, text)
  }
  execute(root, ['add', '.']); execute(root, ['commit', '--quiet', '-m', 'Synthetic direct child arming'])
  const child = execute(root, ['rev-parse', 'HEAD'])
  const api = await import(pathToFileURL(join(root, readerPath)).href)
  const handoff = { reviewedBaseSha: base, manifestSha256: createHash('sha256').update(readFileSync(join(root, manifestPath))).digest('hex') }
  const read = () => api.readFixedOwnerSuccessorSource({ handoff, signal: new AbortController().signal, now })
  const amend = () => { execute(root, ['add', '-A']); execute(root, ['commit', '--quiet', '--amend', '--no-edit']) }
  const reset = () => { execute(root, ['reset', '--hard', child]); execute(root, ['clean', '-fd']) }
  return { root, api, registry, base, child, handoff, read, amend, reset }
}

test('fixed reader qualifies actual direct-child Git across the complete fixed registry and rejects drift', async t => {
  const f = await fixture(t), gatePath = 'scripts/staging-owner-successor-whole-run.mjs'
  const accepted = await f.read()
  assert.equal(accepted.status, 'OWNER_SUCCESSOR_SOURCE_VERIFIED')
  assert.equal(accepted.authorization, 'NONE')
  assert.equal(accepted.sourceCommit, f.base); assert.equal(accepted.executionCommit, f.child)
  assert.equal(execute(f.root, ['rev-list', '--parents', '-n', '1', 'HEAD']), `${f.child} ${f.base}`)
  const scenarios = {
    dirty: () => put(f.root, gatePath, readFileSync(join(f.root, gatePath), 'utf8') + '// dirty\n'),
    symlink: () => { rmSync(join(f.root, gatePath)); symlinkSync('staging-owner-successor-whole-route-journal.mjs', join(f.root, gatePath)); f.amend() },
    executable: () => { chmodSync(join(f.root, gatePath), 0o700); f.amend() },
    extra: () => { put(f.root, 'scripts/unreviewed-extra.mjs', 'export const extra = true\n'); f.amend() },
    oldWindow: () => { put(f.root, contextPath, readFileSync(join(f.root, contextPath), 'utf8') + "export const OLD_WINDOW = 'd5180b08-79ee-43e8-96d4-4f73621fecbf'\n"); f.amend() },
    sourceDrift: () => { put(f.root, gatePath, readFileSync(join(f.root, gatePath), 'utf8') + '// extra committed byte\n'); f.amend() },
    manifestDrift: () => { put(f.root, manifestPath, '{"fixture":"drift"}\n'); f.amend() },
    skippedGate: () => { put(f.root, gatePath, readFileSync(join(f.root, gatePath), 'utf8').replace('ENABLED = true', 'ENABLED = false')); f.amend() },
    nonDirectChild: () => execute(f.root, ['commit', '--quiet', '--allow-empty', '-m', 'Unreviewed grandchild']),
    remoteDrift: () => writeFileSync(join(f.root, '.git/fixture-remote-ref'), `${'d'.repeat(40)}\trefs/heads/${branch}\n`),
  }
  for (const [name, mutate] of Object.entries(scenarios)) await t.test(name, async () => {
    f.reset(); writeFileSync(join(f.root, '.git/fixture-remote-ref'), `${f.base}\trefs/heads/${branch}\n`)
    mutate(); assert.equal((await f.read()).status, 'OWNER_SUCCESSOR_SOURCE_HOLD')
  })
})

test('fixed Git process options reject commands/bounds and do not inherit ambient credentials or configuration', async t => {
  const f = await fixture(t), policy = f.api.fixedOwnerSuccessorSourcePolicy(f.handoff)
  for (const [args, bound] of [[['fetch'], 4096], [['config', '--global', '--list'], 4096],
    [['show', `${f.base}:scripts/not-in-registry.mjs`], 262144], [['rev-parse', 'HEAD'], 262144],
    [['ls-remote', '--heads', 'https://evil.invalid', `refs/heads/${branch}`], 4096], [['rev-parse', 'HEAD'], -1]])
    assert.throws(() => f.api.ownerSuccessorGitProcessOptions(args, bound, policy), /unavailable/)
  const options = f.api.ownerSuccessorGitProcessOptions(['rev-parse', 'HEAD'], 4096, policy)
  assert.equal(options.cwd, f.root); assert.equal(options.timeout, 15000)
  assert.deepEqual(options.stdio, ['ignore', 'pipe', 'ignore'])
  assert.equal(options.env.HOME, '/var/empty'); assert.equal(options.env.GIT_CONFIG_GLOBAL, '/dev/null')
  assert.equal(options.env.GIT_NO_REPLACE_OBJECTS, '1'); assert.equal(options.env.GIT_TERMINAL_PROMPT, '0')
  assert.equal(options.env.GIT_ASKPASS, '/usr/bin/false'); assert.equal(options.env.GIT_NO_LAZY_FETCH, '1')
  assert.ok(Object.isFrozen(options) && Object.isFrozen(options.env))
  assert.deepEqual(Object.keys(options.env).sort(), ['PATH', 'LANG', 'HOME', 'XDG_CONFIG_HOME', 'GIT_CONFIG_NOSYSTEM',
    'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_TERMINAL_PROMPT', 'GIT_ASKPASS', 'GIT_NO_REPLACE_OBJECTS', 'GIT_NO_LAZY_FETCH', 'GIT_EXEC_PATH'].sort())
  assert.equal(f.api.ownerSuccessorGitProcessOptions(['ls-remote', '--heads', origin, `refs/heads/${branch}`], 4096, policy).cwd, '/')
})

test('fixed actual Git reader suppresses a repository-local fsmonitor hook', async t => {
  const f = await fixture(t), hook = join(f.root, '.git/fixture-fsmonitor'), marker = join(f.root, '.git/fixture-hook-ran')
  writeFileSync(hook, "#!/bin/sh\n: > .git/fixture-hook-ran\nprintf 'fixture-token\\000'\n", { mode: 0o700 })
  execute(f.root, ['config', 'core.fsmonitor', hook])
  // Prove the actual installed Git would invoke this harmless hook without the
  // fixed reader's overrides, then remove only our marker and exercise it.
  execute(f.root, ['status', '--porcelain=v1', '--untracked-files=no'])
  assert.ok(existsSync(marker), 'Fixture must demonstrate the local Git hook is active')
  rmSync(marker)
  assert.equal((await f.read()).status, 'OWNER_SUCCESSOR_SOURCE_VERIFIED')
  assert.equal(existsSync(marker), false, 'Read-only proof must never run a repository-local hook')
})
test('actual fixed Git scan yields to cancellation before later admission', async t => {
  const f = await fixture(t), controller = new AbortController()
  const pending = f.api.readFixedOwnerSuccessorSource({ handoff: f.handoff, signal: controller.signal, now })
  setImmediate(() => controller.abort())
  assert.deepEqual(await pending, { status: 'OWNER_SUCCESSOR_SOURCE_HOLD', authorization: 'NONE' })
})

test('hidden index flags and stat-cache config cannot admit modified tracked runtime bytes', async t => {
  const f = await fixture(t)
  for (const flag of ['--assume-unchanged', '--skip-worktree']) {
    const path = 'scripts/staging-preview-git-source-preflight.mjs'
    execute(f.root, ['update-index', flag, path])
    put(f.root, path, readFileSync(join(f.root, path), 'utf8') + '// hidden unreviewed runtime byte\n')
    assert.equal(execute(f.root, ['status', '--porcelain=v1', '--untracked-files=no']), '')
    assert.equal((await f.read()).status, 'OWNER_SUCCESSOR_SOURCE_HOLD')
    execute(f.root, ['update-index', flag === '--assume-unchanged' ? '--no-assume-unchanged' : '--no-skip-worktree', path]); f.reset()
  }
  execute(f.root, ['config', 'core.ignorestat', 'true'])
  put(f.root, 'scripts/staging-owner-successor-whole-run.mjs', readFileSync(join(f.root, 'scripts/staging-owner-successor-whole-run.mjs'), 'utf8') + '// dirty with ignorestat\n')
  assert.equal((await f.read()).status, 'OWNER_SUCCESSOR_SOURCE_HOLD')
})
