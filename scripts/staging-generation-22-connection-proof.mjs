/** Disabled adapter for the existing five-role staging connection verifier. */
import { verifyGeneration6Connections } from './staging-generation-6-connection-verifier.mjs'
import { readPinnedSupabaseCa } from './staging-supabase-ca.mjs'
import { ACTIVE_WINDOW_EXPIRES_AT } from './staging-generation-22-credentials.mjs'
import { PASSWORD_PURPOSES, PROJECT_REF } from './staging-generation-22-material.mjs'

export const STAGING_GENERATION_22_CONNECTION_PROOF_ENABLED = false
const unavailable = () => { throw new Error('Generation 22 connection proof unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

/** Must run in the externally supervised password-owning child process. */
export function createStagingGeneration22ConnectionProof({ createRuntime,
  verify = verifyGeneration6Connections, readCa = readPinnedSupabaseCa,
  now = Date.now } = {}) {
  if (!STAGING_GENERATION_22_CONNECTION_PROOF_ENABLED
    || typeof createRuntime !== 'function' || typeof verify !== 'function'
    || typeof readCa !== 'function' || typeof now !== 'function') unavailable()
  let used = false
  return Object.freeze({
    async prove({ passwords, expiresAt, signal } = {}) {
      if (used || !signal || signal.aborted || !exact(passwords, PASSWORD_PURPOSES)
        || expiresAt !== ACTIVE_WINDOW_EXPIRES_AT
        || !Number.isFinite(now()) || now() >= Date.parse(expiresAt)
        || Object.values(passwords).some(value => typeof value !== 'string'
          || !/^[A-Za-z0-9_-]{64}$/.test(value))) unavailable()
      used = true
      const tlsCa = readCa()
      // The existing verifier awaits each runtime.close(). If close rejects,
      // this adapter fails. If close hangs, the outer process deadline kills
      // the worker; no local timeout may convert it into PASS_DRAINED.
      const result = await verify({ passwords, expiresAt, tlsCa, createRuntime })
      if (signal.aborted || !Number.isFinite(now()) || now() >= Date.parse(expiresAt)
        || !exact(result, ['status', 'projectRef', 'purposes', 'controlsEnabled'])
        || result.status !== 'PASS' || result.projectRef !== PROJECT_REF
        || result.purposes !== PASSWORD_PURPOSES.length || result.controlsEnabled !== false) unavailable()
      return Object.freeze({ status: 'PASS_DRAINED', projectRef: PROJECT_REF,
        purposes: PASSWORD_PURPOSES.length, controlsEnabled: false })
    },
  })
}
