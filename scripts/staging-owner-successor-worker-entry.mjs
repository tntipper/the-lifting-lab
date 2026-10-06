/** Fixed disabled successor child. Supervisor and source proof precede every credential read. */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeSync, fsyncSync, lstatSync, openSync, readFileSync, writeSync } from 'node:fs'
import { acceptSupervisorPipe } from './staging-provider-broker-recovery-process-control.mjs'
import { readStagingGeneration23Credentials } from './staging-generation-23-credential-reader.mjs'
import { createOwnerSuccessorCliRunner } from './staging-owner-successor-cli-runner.mjs'
import { createStagingGeneration23FixedPreflight } from './staging-generation-23-fixed-preflight.mjs'
import { createOwnerSuccessorFixedCleanupAssembly, readOwnerSuccessorCleanupAdmission } from './staging-owner-successor-cleanup-assembly.mjs'
import { createOwnerSuccessorFixedWorkerAssembly } from './staging-owner-successor-fixed-worker-assembly.mjs'
import { readOwnerSuccessorArmingSourceFixed } from './staging-owner-successor-source-proof.mjs'
import { ownerSuccessorSourceIdentity } from './staging-owner-successor-native-context.mjs'
import { ACTIVE_WINDOW_EXPIRES_AT, WINDOW_ID } from './staging-owner-successor-sql-context.mjs'
export const OWNER_SUCCESSOR_NATIVE_WORKER_ENTRY_ENABLED = false
export const OWNER_SUCCESSOR_SUPERVISOR_PROOF = 'TLL_OWNER_SUCCESSOR_SUPERVISOR_cd4130c8-a8b8-462b-bdbe-5c3e6250a02d'
export const OWNER_SUCCESSOR_CLEANUP_SUPERVISOR_PROOF = 'TLL_OWNER_SUCCESSOR_CLEANUP_cd4130c8-a8b8-462b-bdbe-5c3e6250a02d'
export const OWNER_SUCCESSOR_TERMINAL_SCHEMA = 'tll-owner-successor-native-terminal/v1'
export const OWNER_SUCCESSOR_REVIEW_HANDOFF_PATH = resolve(import.meta.dirname, '../.agent/owner-successor', WINDOW_ID, 'source-review.json')
const denied = () => { throw Error('Successor worker unavailable') }
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).sort().join('|') === [...keys].sort().join('|')
const wipe = credentials => { for (const v of Object.values(credentials ?? {})) if (Buffer.isBuffer(v)) v.fill(0) }
const credentialsOk = v => exact(v, ['managementToken', 'vercelToken', 'previewBypass'])
  && Object.values(v).every(b => Buffer.isBuffer(b) && b.length >= 8 && b.length <= 1024 && /^[\x21-\x7e]+$/.test(b.toString()))
  && /^sbp_(?:oauth_|v0_)?[a-f0-9]{40}$/.test(v.managementToken.toString())
  && !v.managementToken.equals(v.vercelToken) && !v.managementToken.equals(v.previewBypass) && !v.vercelToken.equals(v.previewBypass)
/** Fixed non-secret review hashes. File existence is not owner approval. */
export function readOwnerSuccessorReviewHandoff() {
  if (!OWNER_SUCCESSOR_NATIVE_WORKER_ENTRY_ENABLED) denied()
  const stat = lstatSync(OWNER_SUCCESSOR_REVIEW_HANDOFF_PATH)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.uid !== process.getuid()
    || (stat.mode & 0o777) !== 0o600 || stat.size > 1024) denied()
  const value = JSON.parse(readFileSync(OWNER_SUCCESSOR_REVIEW_HANDOFF_PATH, 'utf8'))
  if (!exact(value, ['reviewedBaseSha', 'manifestSha256']) || !/^[a-f0-9]{40}$/.test(value.reviewedBaseSha)
    || !/^[a-f0-9]{64}$/.test(value.manifestSha256)) denied()
  return Object.freeze(value)
}
/** A previous or uncertain whole-route record closes fresh credential admission. */
export function ownerSuccessorRunRecordUnused() {
  if (!OWNER_SUCCESSOR_NATIVE_WORKER_ENTRY_ENABLED) return false
  const path = resolve(import.meta.dirname, '../.agent/owner-successor', WINDOW_ID, 'whole-route.json')
  try { lstatSync(path); return false } catch (error) { return error?.code === 'ENOENT' }
}
async function runWorker({ accept, readSource, readCredentials, createWorker, write, signal, now, native, cleanup = false }) {
  let release, credentials, assembly, timer, identity, last = -Infinity
  const controller = new AbortController(), abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) controller.abort()
  const check = () => {
    const at = now()
    if (controller.signal.aborted || !Number.isSafeInteger(at) || at < last || at >= Date.parse(ACTIVE_WINDOW_EXPIRES_AT)) denied()
    last = at
    return at
  }
  try {
    const initial = check(), remaining = Date.parse(ACTIVE_WINDOW_EXPIRES_AT) - initial - 5000
    if (remaining <= 0) denied()
    timer = setTimeout(abort, remaining)
    release = await accept()
    if (typeof release !== 'function') denied()
    check()
    const proof = await readSource({ signal: controller.signal })
    identity = ownerSuccessorSourceIdentity(proof, check())
    credentials = await readCredentials({ signal: controller.signal })
    check()
    if (!credentialsOk(credentials)) denied()
    assembly = await createWorker(credentials, proof, { signal: controller.signal })
    check()
    if (!exact(assembly, ['core', 'dispose']) || typeof assembly.core?.run !== 'function' || typeof assembly.dispose !== 'function') denied()
    const result = await assembly.core.run({ signal: controller.signal })
    check()
    await assembly.dispose(); assembly = undefined
    wipe(credentials); credentials = undefined
    check()
    if (!result || typeof result !== 'object' || Array.isArray(result) || !(cleanup ? ['CLEANUP_SEQUENCE_PASS'] : ['LOCAL_SEQUENCE_PASS', 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED']).includes(result.status)) denied()
    const terminal = Object.freeze({ schema: OWNER_SUCCESSOR_TERMINAL_SCHEMA, authorization: 'NONE',
      provenance: native ? 'FIXED_NATIVE_PORTS' : 'SYNTHETIC_STUB',
      status: cleanup ? 'CLEANUP_SEQUENCE_PASS' : result.status === 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED' ? result.status
        : native ? 'STAGING_SEQUENCE_PASS' : 'SYNTHETIC_SEQUENCE_PASS', identity })
    await write(`${JSON.stringify(terminal)}\n`)
    return terminal
  } catch { return Object.freeze({ status: 'HOLD_RECONCILE', authorization: 'NONE' }) }
  finally {
    controller.abort(); clearTimeout(timer); signal.removeEventListener('abort', abort)
    try { await assembly?.dispose?.() } catch {}
    wipe(credentials); try { release?.() } catch {}
  }
}
/** Synthetic injection seam cannot publish a native success terminal. */
export function runOwnerSuccessorInjectedWorker(options) {
  if (!OWNER_SUCCESSOR_NATIVE_WORKER_ENTRY_ENABLED) return Promise.resolve(Object.freeze({ status: 'SUCCESSOR_EXECUTION_DISABLED', authorization: 'NONE' }))
  if (!options || ['accept', 'readSource', 'readCredentials', 'createWorker', 'write', 'now'].some(k => typeof options[k] !== 'function')
    || !options.signal || options.signal.aborted || typeof options.signal.addEventListener !== 'function') denied()
  return runWorker({ ...options, native: false, cleanup: false })
}
function recordFixedWorkerOwnership(proof, supervisorPid, now) {
  const path = resolve(import.meta.dirname, '../.agent/owner-successor', WINDOW_ID, 'worker-ownership.json')
  for (let parent = dirname(path); parent !== resolve(import.meta.dirname, '..'); parent = dirname(parent)) {
    const stat = lstatSync(parent)
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid()
      || parent === dirname(path) && (stat.mode & 0o777) !== 0o700) denied()
  }
  const bytes = Buffer.from(`${JSON.stringify({ schema: 'tll-owner-successor-worker-ownership/v1',
    identity: ownerSuccessorSourceIdentity(proof, now()), pid: process.pid, supervisorPid })}\n`)
  let fd
  try {
    fd = openSync(path, 'wx', 0o600)
    let offset = 0
    while (offset < bytes.length) {
      const count = writeSync(fd, bytes, offset, bytes.length - offset)
      if (!Number.isSafeInteger(count) || count < 1) denied()
      offset += count
    }
    fsyncSync(fd); closeSync(fd); fd = undefined
    const directory = openSync(dirname(path), 'r')
    try { fsyncSync(directory) } finally { closeSync(directory) }
  } finally { if (fd !== undefined) closeSync(fd); bytes.fill(0) }
}
function stopOwnGroup() { try { process.kill(-process.pid, 'SIGKILL') } catch { process.kill(process.pid, 'SIGKILL') } }
/** No injectable credential/source/factory paths in the real child. All targets/selectors stay fixed. */
function runFixedWorker(cleanup) {
  if (!OWNER_SUCCESSOR_NATIVE_WORKER_ENTRY_ENABLED) return Promise.resolve(Object.freeze({ status: 'SUCCESSOR_EXECUTION_DISABLED', authorization: 'NONE' }))
  const signal = new AbortController().signal, supervisorPid = process.ppid
  // The pipe watcher stops the process group. This synchronous check also
  // closes admission between immediately settled transport callbacks.
  const now = () => {
    if (!Number.isSafeInteger(supervisorPid) || supervisorPid < 2 || process.ppid !== supervisorPid) denied()
    try { process.kill(supervisorPid, 0) } catch { denied() }
    return Date.now()
  }
  let handoff, admittedProof
  return runWorker({ signal, now, native: true, cleanup,
    accept: () => acceptSupervisorPipe({ proof: cleanup ? OWNER_SUCCESSOR_CLEANUP_SUPERVISOR_PROOF : OWNER_SUCCESSOR_SUPERVISOR_PROOF }),
    readSource: async ({ signal }) => { handoff = readOwnerSuccessorReviewHandoff(); admittedProof = await readOwnerSuccessorArmingSourceFixed({ handoff, signal, now }); return admittedProof },
    readCredentials: ({ signal }) => {
      if (cleanup) readOwnerSuccessorCleanupAdmission({ sourceProof: admittedProof, now })
      else {
        if (!ownerSuccessorRunRecordUnused()) denied()
        recordFixedWorkerOwnership(admittedProof, supervisorPid, now)
      }
      return readStagingGeneration23Credentials({ signal, stopWorkerGroup: stopOwnGroup })
    },
    async createWorker(credentials, proof, { signal }) {
      const reader = createStagingGeneration23FixedPreflight({ fetch: globalThis.fetch,
        vercelToken: credentials.vercelToken, previewBypass: credentials.previewBypass, now,
        readSourceProof: async () => {
          const reread = await readOwnerSuccessorArmingSourceFixed({ handoff, signal, now })
          if (JSON.stringify(reread) !== JSON.stringify(proof)) denied()
          return Object.freeze({ status: 'SOURCE_PROOF_VERIFIED', sourceCommit: proof.sourceCommit, manifestSha256: proof.manifestSha256 })
        } })
      let preflight
      try { preflight = await reader.read({ signal }) } finally { reader.dispose() }
      const runCli = createOwnerSuccessorCliRunner({ vercelToken: credentials.vercelToken, managementToken: credentials.managementToken })
      const fixed = cleanup ? createOwnerSuccessorFixedCleanupAssembly({ credentials, sourceProof: proof,
        preflight: preflight.preflight, runCli, fetch: globalThis.fetch, now, signal })
        : createOwnerSuccessorFixedWorkerAssembly({ credentials, fetch: globalThis.fetch, now, runCli,
        expiresAt: ACTIVE_WINDOW_EXPIRES_AT, sourceProof: proof, ...preflight })
      return Object.freeze({ core: fixed.core, dispose: fixed.dispose })
    }, write: value => process.stdout.write(value),
  })
}
export function runFixedOwnerSuccessorWorker() { return runFixedWorker(false) }
/** Separate fixed cleanup child: no ordinary run admission or activation assembly. */
export function runFixedOwnerSuccessorCleanupWorker() { return runFixedWorker(true) }
if (import.meta.url.startsWith('file:') && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) process.exitCode = 1
  else { const result = await runFixedOwnerSuccessorWorker(); if (!['STAGING_SEQUENCE_PASS', 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED'].includes(result.status)) process.exitCode = 1 }
}
