#!/usr/bin/env node
/** Disabled entry for a single Vercel-only project and Preview source read. */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PREVIEW_SOURCE_LIVE_ENABLED = false
const root = resolve(import.meta.dirname, '..')
const helper = resolve(import.meta.dirname, 'staging-preview-source-keychain.py')
const unavailable = () => { throw new Error('Preview source live read unavailable') }
function checkedChild (executable, args, maxBuffer) {
  const result = spawnSync(executable, args, { cwd: root,
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000, maxBuffer })
  if (result.error || result.status !== 0 || result.signal || !Buffer.isBuffer(result.stdout)) {
    result.stdout?.fill?.(0); unavailable()
  }
  return result.stdout
}
function checkManifests () {
  for (const name of ['staging-account-activation-manifest.mjs', 'staging-account-hosted-baseline-manifest.mjs']) {
    const output = checkedChild(process.execPath, [resolve(import.meta.dirname, name), '--check'], 4096)
    try { if (output.length !== 0) unavailable() } finally { output.fill(0) }
  }
}
function readCredential ({ signal }) {
  if (signal.aborted) unavailable()
  const output = checkedChild('/usr/bin/python3', ['-I', '-S', helper], 4097)
  try {
    if (signal.aborted || output.length < 8 || output.length > 4096 || output.includes(0)) unavailable()
    return Buffer.from(output)
  } finally { output.fill(0) }
}
/** False gate precedes manifest checks, journal, Keychain, bindings and fetch. */
export async function runPreviewSourceLiveOnce () {
  if (PREVIEW_SOURCE_LIVE_ENABLED !== true) return Object.freeze({ status: 'PREVIEW_SOURCE_LIVE_DISABLED' })
  checkManifests()
  const [observer, journal, vercel, surface] = await Promise.all([
    import('./staging-preview-source-observer.mjs'),
    import('./staging-preview-source-journal.mjs'),
    import('./staging-account-hosted-baseline-vercel.mjs'),
    import('./staging-account-hosted-baseline-surface.mjs'),
  ])
  if (typeof globalThis.fetch !== 'function') unavailable()
  return observer.runPreviewSourceObservation({
    readCredential,
    openProject: vercelToken => vercel.createStagingAccountHostedBaselineVercelBinding({ fetch: globalThis.fetch, vercelToken }),
    openSource: vercelToken => surface.createStagingPreviewSourceReadbackBinding({ fetch: globalThis.fetch, vercelToken }),
    journal: journal.createPreviewSourceReadJournal(),
  })
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(await runPreviewSourceLiveOnce())}\n`) }
  catch { process.stdout.write(`${JSON.stringify({ status: 'READ_UNAVAILABLE' })}\n`); process.exitCode = 1 }
}
