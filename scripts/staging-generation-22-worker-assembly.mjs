/** Disabled, synchronous Gen22 child assembly. Construction makes no hosted request. */
import { createStagingPostgresRuntime } from '../lib/server/staging-postgres.ts'
import { createStagingAccountHostedBaselineVercelBinding } from './staging-account-hosted-baseline-vercel.mjs'
import { createStagingAccountHostedBaselineSupabaseBinding } from './staging-account-hosted-baseline-supabase.mjs'
import { createStagingGeneration22Journal } from './staging-generation-22-journal.mjs'
import { createStagingGeneration22RecoveryJournal } from './staging-generation-22-recovery-journal.mjs'
import { createStagingGeneration22DatabaseHost } from './staging-generation-22-database-host.mjs'
import { createStagingGeneration22VercelHost } from './staging-generation-22-vercel-host.mjs'
import { createStagingGeneration22EdgeHost } from './staging-generation-22-edge-host.mjs'
import { createStagingGeneration22VercelConfigHost } from './staging-generation-22-vercel-config-host.mjs'
import { createStagingGeneration22PoststageReadback } from './staging-generation-22-poststage-readback.mjs'
import { createStagingGeneration22ConnectionProof } from './staging-generation-22-connection-proof.mjs'
import { createStagingGeneration22SetupCoordinator } from './staging-generation-22-setup-coordinator.mjs'
import { createStagingGeneration22RecoveryHost } from './staging-generation-22-recovery-host.mjs'
import { createStagingGeneration22RecoveryCoordinator } from './staging-generation-22-recovery-coordinator.mjs'
import { createStagingGeneration22WorkerCore } from './staging-generation-22-worker-core.mjs'
import { postStagingGeneration22CredentialSql } from './staging-generation-22-supabase-query.mjs'
import { postStagingGeneration22RecoverySql } from './staging-generation-22-recovery-query.mjs'
import { postStagingGeneration22ActiveCheck } from './staging-generation-22-active-query.mjs'
import { postStagingGeneration22RetiredCheck } from './staging-generation-22-retired-query.mjs'
import { validateStagingGeneration22ActiveCheck } from './staging-generation-22-active-check.mjs'
import { validateStagingGeneration22RetiredCheck } from './staging-generation-22-retired-check.mjs'

export const STAGING_GENERATION_22_WORKER_ASSEMBLY_ENABLED = false
const unavailable = () => { throw new Error('Generation 22 worker assembly unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

/** The fixed child omits this test seam and receives these exact implementations. */
export const FIXED_GENERATION_22_PARTS = Object.freeze({
  createJournal: createStagingGeneration22Journal,
  createRecoveryJournal: createStagingGeneration22RecoveryJournal,
  createDatabaseHost: createStagingGeneration22DatabaseHost,
  createVercelHost: createStagingGeneration22VercelHost,
  createEdgeHost: createStagingGeneration22EdgeHost,
  createConfigHost: createStagingGeneration22VercelConfigHost,
  createVercelReader: createStagingAccountHostedBaselineVercelBinding,
  createSupabaseReader: createStagingAccountHostedBaselineSupabaseBinding,
  createReadback: createStagingGeneration22PoststageReadback,
  createConnectionProof: createStagingGeneration22ConnectionProof,
  createSetup: createStagingGeneration22SetupCoordinator,
  createRecoveryHost: createStagingGeneration22RecoveryHost,
  createRecovery: createStagingGeneration22RecoveryCoordinator,
  createCore: createStagingGeneration22WorkerCore,
  createRuntime: createStagingPostgresRuntime,
  postCredential: postStagingGeneration22CredentialSql,
  postRecovery: postStagingGeneration22RecoverySql,
  postActive: postStagingGeneration22ActiveCheck,
  postRetired: postStagingGeneration22RetiredCheck,
  validateActive: validateStagingGeneration22ActiveCheck,
  validateRetired: validateStagingGeneration22RetiredCheck,
})

/** All password-bearing work belongs to core.run() in the externally supervised child. */
export function createStagingGeneration22WorkerAssembly({ managementToken, vercelToken,
  fetcher = globalThis.fetch, parts = FIXED_GENERATION_22_PARTS } = {}) {
  if (!STAGING_GENERATION_22_WORKER_ASSEMBLY_ENABLED
    || !Buffer.isBuffer(managementToken)
    || !/^sbp_(?:oauth_|v0_)?[a-f0-9]{40}$/.test(managementToken.toString('utf8'))
    || !Buffer.isBuffer(vercelToken) || vercelToken.length < 8 || vercelToken.length > 1024
    || !/^[\x21-\x7e]+$/.test(vercelToken.toString('utf8'))
    || managementToken === vercelToken || typeof fetcher !== 'function'
    || !exact(parts, Object.keys(FIXED_GENERATION_22_PARTS))
    || Object.values(parts).some(part => typeof part !== 'function')) unavailable()
  const owners = []
  let disposed = false
  const own = value => {
    if (!value || typeof value.dispose !== 'function') unavailable()
    owners.push(value)
    return value
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    let failed = false
    for (const owner of owners.reverse()) {
      try { owner.dispose() } catch { failed = true }
    }
    owners.length = 0
    if (failed) unavailable()
  }
  try {
    // Factories only allocate local state. Journals are claimed in setup.stage().
    const journal = parts.createJournal()
    const recoveryJournal = parts.createRecoveryJournal()
    const database = parts.createDatabaseHost({ post: (packet, { signal }) =>
      parts.postCredential(packet, { token: managementToken, signal }) })
    const vercel = own(parts.createVercelHost({ fetch: fetcher, token: vercelToken }))
    const edge = own(parts.createEdgeHost({ fetch: fetcher, token: managementToken }))
    const config = own(parts.createConfigHost({ fetch: fetcher, token: vercelToken }))
    const vercelReader = own(parts.createVercelReader({ fetch: fetcher, vercelToken }))
    const supabaseReader = own(parts.createSupabaseReader({ fetch: fetcher, managementToken }))
    const readback = parts.createReadback({ vercel: vercelReader, supabase: supabaseReader, config })
    const connections = parts.createConnectionProof({ createRuntime: parts.createRuntime })
    const setup = parts.createSetup({ journal, recoveryJournal, database, vercel, edge, config,
      readback, connections })
    const recoveryHost = parts.createRecoveryHost({ post: (packet, { signal }) =>
      parts.postRecovery(packet, { token: managementToken, signal }) })
    const active = Object.freeze({ async prove({ expiresAt, signal }) {
      const rows = await parts.postActive(expiresAt, { token: managementToken, signal })
      return parts.validateActive(rows, { expiresAt })
    } })
    const retired = Object.freeze({ async prove({ expiresAt, signal }) {
      const rows = await parts.postRetired(expiresAt, { token: managementToken, signal })
      return parts.validateRetired(rows, { expiresAt })
    } })
    const recovery = parts.createRecovery({ journal: recoveryJournal, active,
      recovery: recoveryHost, retired })
    const core = parts.createCore({ setup, recovery })
    if (typeof core?.run !== 'function') unavailable()
    return Object.freeze({ core, dispose })
  } catch {
    try { dispose() } catch {}
    unavailable()
  }
}
