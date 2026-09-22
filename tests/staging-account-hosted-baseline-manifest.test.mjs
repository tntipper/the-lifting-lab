import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { dirname, normalize, resolve } from 'node:path'

test('hosted baseline manifest pins the full disabled observation package', () => {
  execFileSync(process.execPath, ['scripts/staging-account-hosted-baseline-manifest.mjs', '--check'], { stdio: 'pipe' })
  const manifest = JSON.parse(readFileSync('config/staging-account-hosted-baseline-manifest.json', 'utf8'))
  assert.equal(manifest.schema, 'tll-staging-hosted-baseline-manifest/v1')
  assert.deepEqual(manifest.target, { projectRef: 'qdmvngjwkcsilzmqksme', productionProjectRefExcluded: 'wrhgscovsgsudtedbljr' })
  assert.equal(manifest.nativeAccessApproved, false)
  assert.deepEqual(manifest.keychain, {
    supabase: { service: 'Supabase CLI', account: 'supabase' },
    vercel: { service: 'TLL Hosted Baseline Vercel API', account: 'prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4' },
    vercelBypass: { service: 'TLL Hosted Baseline Preview Bypass', account: 'prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4' },
  })
  assert.deepEqual(manifest.execution, { deadlineMs: 60000, retries: 0, observationOnly: true })
  assert.deepEqual(manifest.journal, { path: '../implementation-state/staging/tll-hosted-baseline-observation-v8.json', exclusive: true, mode: '0600' })
  assert.deepEqual(manifest.sources.map(item => item.path), [
    'scripts/staging-account-hosted-baseline.mjs', 'scripts/staging-account-hosted-baseline-database.mjs', 'scripts/staging-generation-21-credentials.mjs',
    'scripts/staging-account-hosted-baseline-supabase.mjs', 'scripts/staging-account-hosted-baseline-vercel.mjs',
    'scripts/staging-account-hosted-baseline-surface.mjs', 'scripts/staging-account-hosted-baseline-composition.mjs',
    'scripts/staging-provider-broker-native-binding.mjs', 'scripts/staging-provider-broker-native-adapter.mjs',
    'scripts/staging-provider-broker-rotation.mjs', 'scripts/staging-surface-activation-transport.mjs',
    'scripts/staging-surface-activation-native-binding.mjs', 'scripts/staging-surface-activation-native-adapter.mjs',
    'scripts/staging-account-hosted-baseline-session.mjs', 'scripts/staging-account-hosted-baseline-live-launcher.mjs',
    'scripts/staging-account-hosted-baseline-keychain.py', 'scripts/staging-account-hosted-baseline-manifest.mjs',
    'tests/staging-account-hosted-baseline-session.test.mjs', 'tests/staging-account-hosted-baseline-composition.test.mjs',
    'tests/staging-account-hosted-baseline-manifest.test.mjs',
    'package.json', 'package-lock.json', 'docs/ops/stage-plans/2026-09-22-fresh-readonly-hosted-baseline.md',
  ])
  assert.ok(manifest.sources.every(source => /^[a-f0-9]{64}$/.test(source.sha256)))
})

test('manifest pins the recursive relative-import closure of runtime roots', () => {
  const manifest = JSON.parse(readFileSync('config/staging-account-hosted-baseline-manifest.json', 'utf8'))
  const pins = new Set(manifest.sources.map(item => item.path))
  const roots = manifest.sources.map(item => item.path).filter(path => path.startsWith('scripts/staging-account-hosted-baseline'))
  const seen = new Set(); const visit = path => {
    if (seen.has(path)) return
    seen.add(path)
    const source = readFileSync(path, 'utf8')
    for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]|import\(['"](\.[^'"]+)['"]\)/g)) {
      const specifier = match[1] ?? match[2]
      const candidate = normalize(resolve(dirname(path), specifier)).replace(`${process.cwd()}/`, '')
      if (existsSync(candidate)) visit(candidate)
    }
  }
  roots.forEach(visit)
  assert.ok([...seen].every(path => pins.has(path)), `unpinned runtime imports: ${[...seen].filter(path => !pins.has(path)).join(',')}`)
})

test('launcher and helper are both source-level disabled gates', () => {
  const launcher = readFileSync('scripts/staging-account-hosted-baseline-live-launcher.mjs', 'utf8')
  const helper = readFileSync('scripts/staging-account-hosted-baseline-keychain.py', 'utf8')
  assert.match(launcher, /HOSTED_BASELINE_LIVE_ENABLED = false/)
  assert.match(launcher, /if \(HOSTED_BASELINE_LIVE_ENABLED !== true\) return disabled\(\)/)
  assert.match(launcher, /createStagingWindowPhaseJournal/)
  assert.match(helper, /APPROVED_NATIVE_READ = False/)
  assert.match(helper, /"supabase"/)
  assert.match(helper, /"vercel"/)
  assert.match(helper, /"vercel-bypass"/)
  assert.match(helper, /timeout=10/)
  assert.match(launcher, /timeout: 15_000/)
})

test('manifest import graph cannot reach the live entry point', () => {
  const launcherPath = resolve('scripts/staging-account-hosted-baseline-live-launcher.mjs')
  const seen = new Set()
  const visit = path => {
    if (seen.has(path)) return
    seen.add(path)
    const source = readFileSync(path, 'utf8')
    for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]|import\(['"](\.[^'"]+)['"]\)/g)) {
      const candidate = normalize(resolve(dirname(path), match[1] ?? match[2]))
      if (existsSync(candidate)) visit(candidate)
    }
  }
  visit(resolve('scripts/staging-account-hosted-baseline-manifest.mjs'))
  assert.equal(seen.has(launcherPath), false, 'manifest must not import its awaited live launcher')
})
