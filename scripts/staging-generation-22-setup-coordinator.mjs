/** Disabled, injected-only sequencing of the exact 22 Gen22 staging writes. */
import { createHash } from 'node:crypto'
import { ACTIVE_WINDOW_EXPIRES_AT, WINDOW_ID } from './staging-generation-22-credentials.mjs'
import { OPERATION_IDS } from './staging-generation-22-journal.mjs'
import { HOSTED_BASELINE_VERCEL_TARGET } from './staging-account-hosted-baseline-vercel.mjs'
import { DISABLED_VERCEL_CONFIGURATION, GENERATION, MISSING_SUPABASE_SECRET_NAMES,
  MISSING_VERCEL_SECRET_NAMES, PROJECT_REF, generateStagingGeneration22Material,
  eraseStagingGeneration22Material, projectStagingGeneration22Material,
  clearStagingGeneration22Projection, deriveStagingGeneration22Verifiers } from './staging-generation-22-material.mjs'

export const STAGING_GENERATION_22_SETUP_COORDINATOR_ENABLED = false
const unavailable = () => { throw new Error('Generation 22 setup coordinator unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const ID = /^[A-Za-z0-9_-]{4,128}$/
const configNames = Object.keys(DISABLED_VERCEL_CONFIGURATION).sort()

function stageReceipt(value, name, classification) {
  if (!exact(value, ['status', 'name', 'id', 'branch', 'target', 'classification'])
    || value.status !== 'STAGED' || value.name !== name || !ID.test(value.id)
    || value.branch !== HOSTED_BASELINE_VERCEL_TARGET.branch || value.target !== 'preview'
    || value.classification !== classification) unavailable()
  return digest(value)
}

export function createStagingGeneration22SetupCoordinator({ journal, database, vercel, edge, config,
  readback, now = Date.now, timeoutMs = 600_000 } = {}) {
  if (!STAGING_GENERATION_22_SETUP_COORDINATOR_ENABLED
    || !journal || ['claim', 'dispatch', 'databaseCapability', 'operationCapability', 'confirm', 'hold']
      .some(method => typeof journal[method] !== 'function')
    || typeof database?.install !== 'function' || typeof vercel?.stageSecret !== 'function'
    || typeof edge?.stageSecret !== 'function' || typeof config?.stageDisabled !== 'function'
    || typeof readback?.prove !== 'function' || typeof now !== 'function'
    || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600_000
    || OPERATION_IDS.length !== 22 || OPERATION_IDS[0] !== 'DATABASE_CREDENTIALS'
    || OPERATION_IDS[17] !== `SUPABASE_EDGE:${MISSING_SUPABASE_SECRET_NAMES[0]}`
    || JSON.stringify(OPERATION_IDS.slice(1, 17)) !== JSON.stringify(MISSING_VERCEL_SECRET_NAMES.map(name => `VERCEL_SECRET:${name}`))
    || JSON.stringify(OPERATION_IDS.slice(18)) !== JSON.stringify(configNames.map(name => `VERCEL_DISABLED:${name}`))) unavailable()
  let used = false
  return Object.freeze({
    async stage({ signal } = {}) {
      if (used || !signal || signal.aborted || typeof signal.addEventListener !== 'function') unavailable()
      used = true
      const startedAt = now(), deadline = Date.parse(ACTIVE_WINDOW_EXPIRES_AT)
      if (!Number.isFinite(startedAt) || !Number.isFinite(deadline) || deadline <= startedAt) unavailable()
      const controller = new AbortController()
      const forwardAbort = () => controller.abort()
      signal.addEventListener('abort', forwardAbort, { once: true })
      const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, deadline - startedAt))
      let onAbort, state, material, projection, verifiers
      const aborted = new Promise((_, reject) => {
        onAbort = () => reject(new Error('Generation 22 setup expired'))
        controller.signal.addEventListener('abort', onAbort, { once: true })
      })
      const run = operation => Promise.race([Promise.resolve().then(() => {
        const current = now()
        if (controller.signal.aborted || !Number.isFinite(current) || current >= deadline) unavailable()
        return operation()
      }), aborted])
      try {
        state = journal.claim()
        material = generateStagingGeneration22Material()
        projection = projectStagingGeneration22Material(material)
        verifiers = deriveStagingGeneration22Verifiers(projection)
        const createdControls = {}
        for (const operationId of OPERATION_IDS) {
          state = journal.dispatch(state, operationId)
          let result, receiptDigest
          if (operationId === 'DATABASE_CREDENTIALS') {
            const capability = journal.databaseCapability(state)
            result = await run(() => database.install({ capability, verifiers,
              expiresAt: ACTIVE_WINDOW_EXPIRES_AT, signal: controller.signal }))
            if (!exact(result, ['status', 'projectRef', 'generation', 'windowId', 'receiptSha256'])
              || result.status !== 'PASS' || result.projectRef !== PROJECT_REF
              || result.generation !== GENERATION || result.windowId !== WINDOW_ID
              || !/^[a-f0-9]{64}$/.test(result.receiptSha256)) unavailable()
            receiptDigest = result.receiptSha256
          } else {
            const capability = journal.operationCapability(state)
            if (operationId.startsWith('VERCEL_SECRET:')) {
              const name = operationId.slice('VERCEL_SECRET:'.length)
              result = await run(() => vercel.stageSecret({ name, value: projection.vercel[name],
                capability, signal: controller.signal }))
              receiptDigest = stageReceipt(result, name, 'sensitive')
            } else if (operationId.startsWith('SUPABASE_EDGE:')) {
              const name = MISSING_SUPABASE_SECRET_NAMES[0]
              result = await run(() => edge.stageSecret({ name, value: projection.supabase[name],
                capability, signal: controller.signal }))
              if (!exact(result, ['status', 'name', 'projectRef']) || result.status !== 'STAGED'
                || result.name !== name || result.projectRef !== PROJECT_REF) unavailable()
              receiptDigest = digest(result)
            } else {
              const name = operationId.slice('VERCEL_DISABLED:'.length)
              result = await run(() => config.stageDisabled({ name, value: DISABLED_VERCEL_CONFIGURATION[name],
                capability, signal: controller.signal }))
              receiptDigest = stageReceipt(result, name, 'config')
              createdControls[name] = result
            }
          }
          state = journal.confirm(state, receiptDigest)
        }
        if (state.state !== 'FINISHED') unavailable()
        try {
          const proof = await run(() => readback.prove({ createdControls, signal: controller.signal }))
          if (!exact(proof, ['status', 'projectRef', 'branch', 'vercelSecretCount',
            'disabledControlCount', 'edgePasswordNamePresent'])
            || proof.status !== 'DISABLED_SETTINGS_VERIFIED' || proof.projectRef !== PROJECT_REF
            || proof.branch !== HOSTED_BASELINE_VERCEL_TARGET.branch || proof.vercelSecretCount !== 16
            || proof.disabledControlCount !== 4 || proof.edgePasswordNamePresent !== true) unavailable()
          return Object.freeze({ status: 'SETTINGS_STAGED_OFF_VERIFIED', projectRef: PROJECT_REF,
            generation: GENERATION, operationCount: OPERATION_IDS.length })
        } catch { return Object.freeze({ status: 'SETTINGS_STAGED_UNVERIFIED', projectRef: PROJECT_REF,
          generation: GENERATION, operationCount: OPERATION_IDS.length }) }
      } catch {
        let held = false
        if (state && state.state !== 'FINISHED') {
          try { held = journal.hold(state)?.state === 'HOLD' } catch {}
        }
        return Object.freeze({ status: held ? 'HOLD_RECONCILE' : 'JOURNAL_UNCERTAIN', projectRef: PROJECT_REF,
          generation: GENERATION, completedCount: state?.nextIndex ?? 0 })
      } finally {
        controller.abort(); clearTimeout(timer)
        signal.removeEventListener('abort', forwardAbort)
        controller.signal.removeEventListener('abort', onAbort)
        clearStagingGeneration22Projection(projection)
        eraseStagingGeneration22Material(material)
        if (verifiers) for (const purpose of Object.keys(verifiers)) verifiers[purpose] = undefined
        try { vercel.dispose?.() } catch {}
        try { edge.dispose?.() } catch {}
        try { config.dispose?.() } catch {}
      }
    },
  })
}
