#!/usr/bin/env node
/** Disabled Gen23 child entry. Hosted operations and Keychain bindings remain absent. */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acceptSupervisorPipe } from './staging-provider-broker-recovery-process-control.mjs'
import { GENERATION_23_WHOLE_WORKER_PROOF } from './staging-generation-23-process-binding.mjs'
import { createStagingGeneration23HostedAssembly } from './staging-generation-23-hosted-assembly.mjs'
import { ACTIVE_WINDOW_EXPIRES_AT } from './staging-generation-23-credentials.mjs'
import { readStagingGeneration23Credentials } from './staging-generation-23-credential-reader.mjs'
import { createStagingGeneration23CliRunner } from './staging-generation-23-cli-runner.mjs'
import { createStagingGeneration23FixedWorkerAssembly } from './staging-generation-23-fixed-worker-assembly.mjs'
import { createStagingGeneration23FixedPreflight } from './staging-generation-23-fixed-preflight.mjs'
import { readStagingGeneration23ArmingSourceFixed } from './staging-generation-23-arming-source-proof.mjs'

export const STAGING_GENERATION_23_WORKER_ENTRY_ENABLED = false
// This independent switch makes the worker factory unavailable until a single
// reviewed arming diff names every real port, journal and window expiry.
export const STAGING_GENERATION_23_HOSTED_WORKER_ASSEMBLY_ENABLED = false
export const STAGING_GENERATION_23_WORKER_CLI_ARMED = false
export const GENERATION_23_WHOLE_WORKER_TERMINAL_SCHEMA = 'tll-staging-generation-23-whole-worker-terminal/v1'
export const GENERATION_23_ORDERLY_ABORT_MS = 58 * 60 * 1000
const unavailable = () => { throw Error('Generation 23 whole worker unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const printable = value => Buffer.isBuffer(value) && value.length >= 8 && value.length <= 1024
  && /^[\x21-\x7e]+$/.test(value.toString('utf8'))
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const iso = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value))
const deployment = value => exact(value, ['target', 'deploymentId', 'immutableUrl', 'sourceCommit',
  'manifestSha256', 'ready', 'createdAt']) && value.target && typeof value.target === 'object'
  && !Array.isArray(value.target) && /^dpl_[A-Za-z0-9]+$/.test(value.deploymentId)
  && /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(value.immutableUrl) && sha(value.sourceCommit)
  && digest(value.manifestSha256) && value.ready === true && iso(value.createdAt)
const validPreflight = value => exact(value, ['heldEvidence', 'requirements'])
  && deployment(value.heldEvidence) && exact(value.requirements, ['sourceCommit', 'manifestSha256', 'observedAt'])
  && sha(value.requirements.sourceCommit) && digest(value.requirements.manifestSha256) && iso(value.requirements.observedAt)
  && value.heldEvidence.sourceCommit === value.requirements.sourceCommit
  && value.heldEvidence.manifestSha256 === value.requirements.manifestSha256
const validCheckoutTarget = value => exact(value, ['name', 'id', 'branch', 'environment', 'classification'])
  && value.name === 'TLL_STAGING_CART_CHECKOUT_HANDOFF_ENABLED'
  && typeof value.id === 'string' && /^[A-Za-z0-9_-]{4,128}$/.test(value.id)
  && value.branch === 'codex/tll-integration' && value.environment === 'preview'
  && value.classification === 'config'
const erase = credentials => {
  if (!credentials || typeof credentials !== 'object') return
  for (const value of Object.values(credentials)) if (Buffer.isBuffer(value)) value.fill(0)
}
const readGeneration23SourceProof = async () => {
  const result = await readStagingGeneration23ArmingSourceFixed()
  if (!exact(result, ['status', 'sourceCommit', 'executionCommit', 'manifestSha256', 'expiresAt'])
    || result.status !== 'GEN23_ARMING_SOURCE_VERIFIED'
    || result.executionCommit === result.sourceCommit
    || result.expiresAt !== ACTIVE_WINDOW_EXPIRES_AT
    || !sha(result.sourceCommit) || !sha(result.executionCommit)
    || !digest(result.manifestSha256)) unavailable()
  return Object.freeze({ status: 'SOURCE_PROOF_VERIFIED', sourceCommit: result.sourceCommit,
    manifestSha256: result.manifestSha256 })
}

function stopOwnProcessGroup() {
  try { process.kill(-process.pid, 'SIGKILL') } catch { try { process.kill(process.pid, 'SIGKILL') } catch {} }
}

/**
 * Create the only real Gen23 assembly which can publish the hosted terminal.
 *
 * It intentionally accepts fresh, non-secret observations rather than reading
 * a file, environment variable or a previous journal.  The caller must obtain
 * those observations in the reviewed read-only preflight immediately before
 * opening the credential window.  That keeps a stale Preview identity or a
 * guessed Vercel setting ID from causing any Keychain read.
 */
export function createStagingGeneration23FixedHostedWorker({ credentials, preflight,
  checkoutTarget, fetch: fetcher, now = Date.now } = {}) {
  if (!STAGING_GENERATION_23_WORKER_ENTRY_ENABLED || !STAGING_GENERATION_23_HOSTED_WORKER_ASSEMBLY_ENABLED
    || !STAGING_GENERATION_23_WORKER_CLI_ARMED || !exact(credentials, ['managementToken', 'vercelToken', 'previewBypass'])
    || !Buffer.isBuffer(credentials.managementToken) || !printable(credentials.vercelToken)
    || !printable(credentials.previewBypass) || !validPreflight(preflight) || !validCheckoutTarget(checkoutTarget)
    || typeof fetcher !== 'function' || typeof now !== 'function' || !iso(ACTIVE_WINDOW_EXPIRES_AT)) unavailable()

  // The CLI runner is fixed to the four public/private Preview controls and
  // the one staging Edge control.  It cannot be replaced by a caller here.
  const runCli = createStagingGeneration23CliRunner({ vercelToken: credentials.vercelToken,
    managementToken: credentials.managementToken })
  const fixed = createStagingGeneration23FixedWorkerAssembly({ credentials, fetch: fetcher,
    expiresAt: ACTIVE_WINDOW_EXPIRES_AT, preflight, checkoutTarget, runCli, now })
  if (!fixed || typeof fixed !== 'object' || typeof fixed.dispose !== 'function'
    || typeof fixed.core?.run !== 'function') unavailable()
  let disposed = false
  return Object.freeze({
    core: Object.freeze({
      async run({ signal } = {}) {
        if (disposed || !signal || signal.aborted || typeof signal.addEventListener !== 'function') unavailable()
        const result = await fixed.core.run({ signal })
        // The connected fixed factory has no injection seam.  Its ordinary
        // whole-route coordinator uses LOCAL_SEQUENCE_PASS for both rehearsal
        // and real ports, so translate it only here, after the real fixed
        // adapters completed every phase and their final readback.
        if (result?.status === 'LOCAL_SEQUENCE_PASS') return Object.freeze({ status: 'STAGING_SEQUENCE_PASS' })
        if (result?.status === 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED') {
          return Object.freeze({ status: 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED' })
        }
        unavailable()
      },
    }),
    dispose() { if (!disposed) { disposed = true; fixed.dispose() } },
  })
}

/**
 * The default child path. It remains disabled until a single reviewed arming
 * diff supplies the active expiry and turns on every named guarded component.
 * It deliberately has no default preflight or checkout target: both are fresh
 * facts, not configuration values which may be copied from an old run.
 */
export async function runStagingGeneration23FixedWholeWorker({ accept,
  preflight, checkoutTarget, fetch: fetcher, write = value => process.stdout.write(value),
  signal, now = Date.now } = {}) {
  if (!STAGING_GENERATION_23_WORKER_ENTRY_ENABLED || !STAGING_GENERATION_23_HOSTED_WORKER_ASSEMBLY_ENABLED
    || !STAGING_GENERATION_23_WORKER_CLI_ARMED
    || (preflight !== undefined && !validPreflight(preflight))
    || (checkoutTarget !== undefined && !validCheckoutTarget(checkoutTarget))
    || (preflight === undefined) !== (checkoutTarget === undefined)
    || typeof fetcher !== 'function'
    || typeof write !== 'function' || !signal || signal.aborted
    || typeof signal.addEventListener !== 'function' || typeof now !== 'function') unavailable()
  return runStagingGeneration23WholeWorker({
    ...(accept ? { accept } : {}),
    signal,
    write,
    readCredentials: ({ signal: childSignal }) => readStagingGeneration23Credentials({
      signal: childSignal, stopWorkerGroup: stopOwnProcessGroup,
    }),
    createWorker: async (credentials, { signal: childSignal }) => {
      let current = preflight === undefined ? undefined : { preflight, checkoutTarget }
      if (!current) {
        const reader = createStagingGeneration23FixedPreflight({ fetch: fetcher,
          vercelToken: credentials.vercelToken, previewBypass: credentials.previewBypass,
          readSourceProof: readGeneration23SourceProof, now })
        try { current = await reader.read({ signal: childSignal }) }
        finally { reader.dispose() }
      }
      if (!validPreflight(current.preflight) || !validCheckoutTarget(current.checkoutTarget)
        || childSignal.aborted) unavailable()
      return createStagingGeneration23FixedHostedWorker({ credentials,
        preflight: current.preflight, checkoutTarget: current.checkoutTarget, fetch: fetcher, now })
    },
  })
}

/**
 * Builds the child-only hosted core from the concrete guarded adapters.
 *
 * `createAdapters` is deliberately injected by the reviewed arming package:
 * it must construct the existing fixed-target Vercel, Supabase, Preview and
 * browser ports from the three buffers.  There is no default factory and no
 * transport fallback here, so this source cannot silently become live-ready.
 */
export function createStagingGeneration23HostedWorkerAssembly({ credentials, createAdapters,
  runWhole, journal, now = Date.now } = {}) {
  if (!STAGING_GENERATION_23_WORKER_ENTRY_ENABLED || !STAGING_GENERATION_23_HOSTED_WORKER_ASSEMBLY_ENABLED
    || !exact(credentials, ['managementToken', 'vercelToken', 'previewBypass'])
    || !Buffer.isBuffer(credentials.managementToken) || !printable(credentials.vercelToken)
    || !printable(credentials.previewBypass) || typeof createAdapters !== 'function'
    || typeof runWhole !== 'function' || !journal || typeof journal.claim !== 'function'
    || typeof now !== 'function' || typeof ACTIVE_WINDOW_EXPIRES_AT !== 'string'
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(ACTIVE_WINDOW_EXPIRES_AT)) unavailable()
  let adapters, assembly, disposed = false
  try {
    adapters = createAdapters(Object.freeze({
      managementToken: credentials.managementToken,
      vercelToken: credentials.vercelToken,
      previewBypass: credentials.previewBypass,
    }))
    if (!adapters || typeof adapters !== 'object' || Array.isArray(adapters)
      || typeof adapters.dispose !== 'function' || !adapters.ports
      || typeof adapters.ports !== 'object' || Array.isArray(adapters.ports)) unavailable()
    assembly = createStagingGeneration23HostedAssembly({ adapters: adapters.ports, runWhole, now })
  } catch {
    try { adapters?.dispose?.() } catch {}
    unavailable()
  }
  const dispose = async () => {
    if (disposed) return
    disposed = true
    // Dispose the coordinator before its transports.  The coordinator erases
    // the Preview deployment identity, then the adapter factory can erase any
    // copies of credential/password material it created.
    try { assembly.dispose() } finally { await adapters.dispose() }
  }
  return Object.freeze({
    core: Object.freeze({
      async run({ signal } = {}) {
        if (disposed || !signal || signal.aborted || typeof signal.addEventListener !== 'function') unavailable()
        const result = await assembly.run({ signal, windowExpiresAt: ACTIVE_WINDOW_EXPIRES_AT, journal })
        if (!result || typeof result !== 'object' || Array.isArray(result)) unavailable()
        // `rehearseStagingGeneration23WholeRun` deliberately uses this neutral
        // status for both local rehearsal and a future real route.  This
        // injected assembly is useful for proving wiring, but it is not the
        // fixed hosted factory and must never be able to mint a live success
        // terminal merely because a caller supplied functions with matching
        // return values.
        if (result.status === 'LOCAL_SEQUENCE_PASS') {
          return Object.freeze({ status: 'HOSTED_ASSEMBLY_SEQUENCE_VERIFIED' })
        }
        // A verified owner failure is deliberately not converted to success:
        // its completed shutdown is durable evidence, but it still needs a
        // human decision before the customer path is attempted again.
        if (result.status === 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED') {
          return Object.freeze({ status: 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED' })
        }
        unavailable()
      },
    }),
    dispose,
  })
}

/** Injected-only seam. The fixed CLI does not yet connect a credential reader or hosted assembly. */
export async function runStagingGeneration23WholeWorker({
  accept = () => acceptSupervisorPipe({ proof: GENERATION_23_WHOLE_WORKER_PROOF }),
  readCredentials, createWorker, write, signal, deadlineMs = GENERATION_23_ORDERLY_ABORT_MS,
} = {}) {
  if (!STAGING_GENERATION_23_WORKER_ENTRY_ENABLED || typeof accept !== 'function'
    || typeof readCredentials !== 'function' || typeof createWorker !== 'function'
    || typeof write !== 'function' || !signal
    || signal.aborted || typeof signal.addEventListener !== 'function'
    || !Number.isSafeInteger(deadlineMs) || deadlineMs < 1
    || deadlineMs > GENERATION_23_ORDERLY_ABORT_MS) unavailable()
  let release, deadlineTimer, credentials, assembly
  const controller = new AbortController()
  const onExternalAbort = () => controller.abort()
  signal.addEventListener('abort', onExternalAbort, { once: true })
  deadlineTimer = setTimeout(() => controller.abort(), deadlineMs)
  try {
    release = await accept()
    if (typeof release !== 'function' || controller.signal.aborted) unavailable()
    credentials = await readCredentials({ signal: controller.signal })
    if (controller.signal.aborted || !exact(credentials, ['managementToken', 'vercelToken', 'previewBypass'])
      || !Buffer.isBuffer(credentials.managementToken)
      || !/^sbp_(?:oauth_|v0_)?[a-f0-9]{40}$/.test(credentials.managementToken.toString('utf8'))
      || !printable(credentials.vercelToken) || !printable(credentials.previewBypass)
      || credentials.managementToken === credentials.vercelToken
      || credentials.managementToken === credentials.previewBypass
      || credentials.vercelToken === credentials.previewBypass
      || credentials.managementToken.equals(credentials.vercelToken)
      || credentials.managementToken.equals(credentials.previewBypass)
      || credentials.vercelToken.equals(credentials.previewBypass)) unavailable()
    assembly = await createWorker(credentials, { signal: controller.signal })
    if (!exact(assembly, ['core', 'dispose']) || typeof assembly.core?.run !== 'function'
      || typeof assembly.dispose !== 'function' || controller.signal.aborted) unavailable()
    const result = await assembly.core.run({ signal: controller.signal })
    const finishedAssembly = assembly
    assembly = undefined
    await finishedAssembly.dispose()
    erase(credentials)
    credentials = undefined
    if (controller.signal.aborted || !result || typeof result !== 'object' || Array.isArray(result)
      || Object.keys(result).sort().join('|') !== 'status'
      || !['PASS_PARTIAL_LOCAL_COMPOSITE', 'STAGING_SEQUENCE_PASS',
        'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED'].includes(result.status)) unavailable()
    await write(`${JSON.stringify({ schema: GENERATION_23_WHOLE_WORKER_TERMINAL_SCHEMA,
      status: result.status, generation: 23 })}\n`)
    return true
  } catch { return false }
  finally {
    clearTimeout(deadlineTimer)
    signal.removeEventListener('abort', onExternalAbort)
    if (assembly) { try { await assembly.dispose() } catch {} }
    erase(credentials)
    if (release) { try { release() } catch {} }
  }
}

if (import.meta.url.startsWith('file:') && process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!STAGING_GENERATION_23_WORKER_CLI_ARMED || process.argv.length !== 2) process.exitCode = 1
  else process.exitCode = await runStagingGeneration23FixedWholeWorker({
    fetch: globalThis.fetch, signal: new AbortController().signal,
  }) ? 0 : 1
}
