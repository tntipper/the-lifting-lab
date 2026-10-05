/** Fixed local mock worker binding. Reuses the existing supervisor without enabling hosted gates. */
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, lstatSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runBoundedBrokerRotationWorker } from './staging-provider-broker-rotation-process-control.mjs'
import { createSuccessorFixtureJournal, SUCCESSOR_PHASES } from './staging-owner-successor-fixture.mjs'
export const LOCAL_SUCCESSOR_PROOF = 'TLL_OWNER_SUCCESSOR_SYNTHETIC_LOCAL_V1'
const ROOT = resolve(import.meta.dirname, '..')
export const LOCAL_SUCCESSOR_WORKER = fileURLToPath(new URL('./staging-owner-successor-local-worker.mjs', import.meta.url))
const FILES = ['staging-owner-successor-fixture.mjs', 'staging-owner-successor-durable-journal.mjs',
  'staging-owner-successor-local-runtime.mjs', 'staging-owner-successor-local-process.mjs',
  'staging-owner-successor-local-worker.mjs', 'staging-provider-broker-rotation-process-control.mjs',
  'staging-provider-broker-recovery-process-control.mjs', 'staging-generation-23-whole-run.mjs']
export function successorLocalBindingDigest() {
  const digest = createHash('sha256')
  for (const file of FILES) digest.update(file).update('\0').update(readFileSync(new URL(file, import.meta.url)))
  return digest.digest('hex')
}
export async function runSuccessorLocalProcess({ root, plan, action = 'LOCAL_RUN', failAt = null,
  hangAt = null, lateAt = null, crashAt = null, uncertainSettlement = false, deadlineMs = 3000 } = {}) {
  createSuccessorFixtureJournal(plan)
  const stat = lstatSync(root)
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid()
    || (stat.mode & 0o777) !== 0o700 || realpathSync(root) !== resolve(root)
    || !['LOCAL_RUN', 'LOCAL_RECOVERY'].includes(action)
    || [failAt, hangAt, lateAt, crashAt].some(p => p !== null && !SUCCESSOR_PHASES.includes(p))
    || typeof uncertainSettlement !== 'boolean' || !Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 30_000)
    throw Error('Successor local binding unavailable')
  const path = join(root, `.local-request-${randomUUID()}.json`)
  writeFileSync(path, `${JSON.stringify({ schema: 'tll-successor-local-request/v1', root, plan, action,
    failAt, hangAt, lateAt, crashAt, uncertainSettlement, bindingSha256: successorLocalBindingDigest() })}\n`,
  { flag: 'wx', mode: 0o600 }) // no credential or arbitrary command fields
  const observed = await runBoundedBrokerRotationWorker({ executable: process.execPath,
    args: [LOCAL_SUCCESSOR_WORKER, path], cwd: ROOT, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
    proof: LOCAL_SUCCESSOR_PROOF, deadlineMs, maxOutputBytes: 1024, strictGroupCleanup: true })
  const fallback = Object.freeze({ status: 'LOCAL_PROCESS_RECONCILIATION_REQUIRED', authorization: 'NONE' })
  const bytes = observed.output
  try {
    if (observed.status !== 'EXITED' || observed.code !== 0 || !Buffer.isBuffer(bytes)) return fallback
    const raw = bytes.toString('utf8').trim(), value = JSON.parse(raw)
    if (raw !== JSON.stringify(value) || Object.keys(value).sort().join('|') !== 'authorization|provenance|schema|status'
      || value.schema !== 'tll-successor-local-terminal/v1' || value.authorization !== 'NONE'
      || value.provenance !== 'SYNTHETIC_LOCAL_ONLY'
      || !['LOCAL_SEQUENCE_PASS', 'LOCAL_FAILURE_SHUTDOWN_VERIFIED', 'LOCAL_RECONCILIATION_REQUIRED',
        'LOCAL_CAPABILITY_DENIED'].includes(value.status)) return fallback
    return Object.freeze(value)
  } catch { return fallback } finally { bytes?.fill(0) }
}
