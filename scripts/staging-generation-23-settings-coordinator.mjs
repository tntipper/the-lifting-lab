/** Disabled composition of five exact-ID replacements and one matching Edge value. */
import { createHash } from 'node:crypto'
import { EDGE_PASSWORD_NAME, EDGE_READINESS_WINDOW_NAME, READINESS_WINDOW_ID, PROJECT_REF, VERCEL_PASSWORD_NAMES,
  clearStagingGeneration23Projection } from './staging-generation-23-password-material.mjs'
import { OPERATION_IDS } from './staging-generation-23-settings-journal.mjs'

export const STAGING_GENERATION_23_SETTINGS_COORDINATOR_ENABLED = true
const unavailable = () => { throw new Error('Generation 23 settings coordinator unavailable') }
const PASSWORD = /^[A-Za-z0-9_-]{64}$/
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const digest = receipt => createHash('sha256').update(JSON.stringify(receipt)).digest('hex')

function validInputs(targets, projection) {
  return Array.isArray(targets) && targets.length === VERCEL_PASSWORD_NAMES.length
    && targets.every((value, index) => value?.name === VERCEL_PASSWORD_NAMES[index])
    && exact(projection, ['vercel', 'supabase'])
    && exact(projection.vercel, VERCEL_PASSWORD_NAMES)
    && exact(projection.supabase, [EDGE_PASSWORD_NAME, EDGE_READINESS_WINDOW_NAME])
    && Object.values(projection.vercel).every(value => typeof value === 'string' && PASSWORD.test(value))
    && new Set(Object.values(projection.vercel)).size === VERCEL_PASSWORD_NAMES.length
    && projection.supabase[EDGE_PASSWORD_NAME] === projection.vercel[EDGE_PASSWORD_NAME]
    && typeof projection.supabase[EDGE_READINESS_WINDOW_NAME] === 'string'
    && projection.supabase[EDGE_READINESS_WINDOW_NAME].startsWith(`${READINESS_WINDOW_ID}|`)
}

/** Takes ownership of projection and erases its values before returning. */
export function createStagingGeneration23SettingsCoordinator({ journal, makeReplacer,
  edgeHost, now = Date.now } = {}) {
  if (!STAGING_GENERATION_23_SETTINGS_COORDINATOR_ENABLED
    || !journal || typeof journal.claim !== 'function' || typeof journal.dispatch !== 'function'
    || typeof journal.confirm !== 'function' || typeof journal.hold !== 'function'
    || typeof makeReplacer !== 'function' || !edgeHost || typeof edgeHost.stageSecret !== 'function'
    || typeof now !== 'function') unavailable()
  let used = false
  return Object.freeze({
    async run({ targets, projection, expiresAt, signal } = {}) {
      if (used || !signal || signal.aborted || typeof signal.addEventListener !== 'function'
        || !validInputs(targets, projection) || typeof expiresAt !== 'string'
        || !Number.isFinite(now()) || Date.parse(expiresAt) <= now()) unavailable()
      used = true
      let current, replacer
      try {
        current = journal.claim(targets, expiresAt)
        for (let index = 0; index < VERCEL_PASSWORD_NAMES.length; index++) {
          if (signal.aborted || Date.parse(expiresAt) <= now()) unavailable()
          const name = VERCEL_PASSWORD_NAMES[index]
          current = journal.dispatch(current, OPERATION_IDS[index])
          replacer = makeReplacer()
          if (!replacer || typeof replacer.replace !== 'function'
            || typeof replacer.dispose !== 'function') unavailable()
          const receipt = await replacer.replace(targets[index], projection.vercel[name], { signal })
          if (!exact(receipt, ['status', 'name', 'id', 'branch', 'target', 'classification'])
            || receipt.status !== 'REPLACED' || receipt.name !== name
            || receipt.id !== targets[index].id || receipt.branch !== targets[index].branch
            || receipt.target !== 'preview' || receipt.classification !== 'sensitive') unavailable()
          current = journal.confirm(current, digest(receipt))
          replacer.dispose(); replacer = undefined
        }
        if (signal.aborted || Date.parse(expiresAt) <= now()) unavailable()
        current = journal.dispatch(current, OPERATION_IDS[5])
        const receipt = await edgeHost.stageSecret({ name: EDGE_PASSWORD_NAME,
          value: projection.supabase[EDGE_PASSWORD_NAME], signal })
        if (!exact(receipt, ['status', 'name', 'projectRef']) || receipt.status !== 'STAGED'
          || receipt.name !== EDGE_PASSWORD_NAME || receipt.projectRef !== PROJECT_REF) unavailable()
        current = journal.confirm(current, digest(receipt))
        if (signal.aborted || Date.parse(expiresAt) <= now()) unavailable()
        current = journal.dispatch(current, OPERATION_IDS[6])
        const gate = await edgeHost.stageSecret({ name: EDGE_READINESS_WINDOW_NAME,
          value: projection.supabase[EDGE_READINESS_WINDOW_NAME], signal })
        if (!exact(gate, ['status', 'name', 'projectRef']) || gate.status !== 'STAGED'
          || gate.name !== EDGE_READINESS_WINDOW_NAME || gate.projectRef !== PROJECT_REF) unavailable()
        current = journal.confirm(current, digest(gate))
        if (current.state !== 'FINISHED' || current.nextIndex !== OPERATION_IDS.length) unavailable()
        return Object.freeze({ status: 'SETTINGS_REPLACED_UNVERIFIED', operationCount: OPERATION_IDS.length })
      } catch {
        if (current && ['READY', 'DISPATCHED'].includes(current.state)) {
          try { current = journal.hold(current) } catch { return Object.freeze({ status: 'JOURNAL_UNCERTAIN' }) }
        }
        return Object.freeze({ status: 'HOLD_RECONCILE',
          completedCount: current?.receiptDigests?.length ?? 0 })
      } finally {
        try { replacer?.dispose?.() } catch {}
        try { edgeHost.dispose?.() } catch {}
        clearStagingGeneration23Projection(projection)
      }
    },
  })
}
