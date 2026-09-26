#!/usr/bin/env node
/** Disabled one-shot read of the exact protected staging Preview readiness route. */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PREVIEW_READINESS_LIVE_ENABLED = false
export const PREVIEW_READINESS_JOURNAL = fileURLToPath(new URL('../../implementation-state/staging/tll-preview-readiness-v1.json', import.meta.url))
const root = resolve(import.meta.dirname, '..')
const helper = resolve(import.meta.dirname, 'staging-provider-normalization-keychain.py')
const python = '/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3'
const pythonSha256 = 'ac60cfe0268614638d0ffa35f3b0284fc7b3a11482723793455e17eeb278509e'
const unavailable = () => { throw new Error('Protected Preview readiness unavailable') }

function checkedChild(executable, args, maxBuffer) {
  const result = spawnSync(executable, args, { cwd: root, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
    stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000, maxBuffer })
  if (result.error || result.status !== 0 || result.signal || !Buffer.isBuffer(result.stdout)) {
    result.stdout?.fill?.(0); unavailable()
  }
  return result.stdout
}

function preflight() {
  if (process.platform !== 'darwin') unavailable()
  const output = checkedChild(process.execPath, [resolve(import.meta.dirname, 'staging-account-activation-manifest.mjs'), '--check'], 4_096)
  try { if (output.length !== 0) unavailable() } finally { output.fill(0) }
  const interpreter = readFileSync(python)
  try { if (createHash('sha256').update(interpreter).digest('hex') !== pythonSha256) unavailable() }
  finally { interpreter.fill(0) }
  const info = lstatSync(dirname(PREVIEW_READINESS_JOURNAL))
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid()
    || (info.mode & 0o777) !== 0o700) unavailable()
  try { lstatSync(PREVIEW_READINESS_JOURNAL); unavailable() }
  catch (error) { if (error?.code !== 'ENOENT') unavailable() }
}

function readBypass() {
  const output = checkedChild(python, ['-I', '-S', helper, 'vercel-bypass'], 4_097)
  try {
    if (output.length < 8 || output.length > 4_096 || output.includes(0)) unavailable()
    return Buffer.from(output)
  } finally { output.fill(0) }
}

/** The false gate precedes manifest, journal, Keychain and network access. */
export async function runProtectedPreviewReadinessLiveOnce() {
  if (PREVIEW_READINESS_LIVE_ENABLED !== true) return Object.freeze({ status: 'PREVIEW_READINESS_LIVE_DISABLED' })
  preflight()
  const [session, journalModule, reader] = await Promise.all([
    import('./staging-provider-preview-readiness-session.mjs'),
    import('./staging-preview-source-journal.mjs'),
    import('./staging-provider-preview-readiness-reader.mjs'),
  ])
  return session.observeProtectedPreviewOnce({ readBypass,
    readReadiness: reader.createPinnedReadinessReader({ fetcher: globalThis.fetch, target: session.PREVIEW_READINESS_TARGET }),
    journal: journalModule.createPreviewSourceReadJournal({ path: PREVIEW_READINESS_JOURNAL }),
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(await runProtectedPreviewReadinessLiveOnce())}\n`) }
  catch { process.stdout.write(`${JSON.stringify({ status: 'RECONCILIATION_REQUIRED' })}\n`); process.exitCode = 1 }
}
