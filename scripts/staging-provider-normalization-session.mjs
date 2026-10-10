/** Disabled, injected-only session wiring. No credential source or transport. */
import { PROVIDER_IDENTIFIER, STAGING_PROVIDER_TARGET } from './staging-provider-broker-rotation.mjs'
import { createStagingProviderNormalizationPreflight } from './staging-provider-normalization-preflight.mjs'
import { normalizeStagingProviderOnce } from './staging-provider-normalization-coordinator.mjs'
import { assessProviderNormalizationPhase } from './staging-provider-normalization-phase-journal.mjs'

export const PROVIDER_NORMALIZATION_SESSION_ENABLED = false
const unavailable = () => { throw new Error('Staging provider normalization session unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const fixed = status => Object.freeze({ status, target: STAGING_PROVIDER_TARGET, providerIdentifier: PROVIDER_IDENTIFIER })
const validBuffer = value => Buffer.isBuffer(value) && value.length >= 8 && value.length <= 24_576 && !value.includes(0)
const wipeBuffers = value => {
  if (!value || typeof value !== 'object') return
  for (const item of Object.values(value)) if (Buffer.isBuffer(item)) item.fill(0)
}

/** Journals and factories must be injected; the future live entry point owns them. */
export async function runStagingProviderNormalizationSession({ readCredentials, openSupabase, openVercel, openSurface,
  makeNativePort, phaseJournal, intentJournal, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if ([readCredentials, openSupabase, openVercel, openSurface, makeNativePort, now, setTimer, clearTimer]
    .some(value => typeof value !== 'function')
    || !phaseJournal || ['read', 'start', 'record', 'finish'].some(name => typeof phaseJournal[name] !== 'function')
    || !intentJournal || ['read', 'recordIntent', 'transition'].some(name => typeof intentJournal[name] !== 'function')) unavailable()
  try {
    if (phaseJournal.read() || intentJournal.read()) return fixed('REPLAY_REJECTED')
  } catch { return fixed('RECONCILIATION_REQUIRED') }

  let phase
  try { phase = phaseJournal.start() } catch { return fixed('RECONCILIATION_REQUIRED') }
  const controller = new AbortController()
  let credentials, projectSecret, keyBinding, outcome = 'RECONCILIATION_REQUIRED', cleanupFailed = false
  const mark = name => { phase = phaseJournal.record(phase, name) }
  const bounded = async (operation, cleanupLate = () => {}) => {
    const assessed = assessProviderNormalizationPhase(phase, now())
    if (assessed.status !== 'ACTIVE_WITHIN_PHASE_BOUND' || controller.signal.aborted) unavailable()
    let timer
    const timeout = new Promise((_, reject) => {
      timer = setTimer(() => { controller.abort(); reject(new Error('Staging provider normalization session unavailable')) },
        Math.max(0, assessed.deadlineMs - assessed.elapsedMs))
    })
    const pending = Promise.resolve().then(operation)
    pending.then(value => { if (controller.signal.aborted) cleanupLate(value) }, () => {}).catch(() => {})
    try {
      const value = await Promise.race([pending, timeout])
      if (controller.signal.aborted) { cleanupLate(value); unavailable() }
      return value
    } finally { if (timer !== undefined) clearTimer(timer) }
  }
  try {
    credentials = await bounded(() => readCredentials({ signal: controller.signal }), wipeBuffers)
    if (!exact(credentials, ['supabase', 'vercel', 'bypass']) || Object.values(credentials).some(value => !validBuffer(value))) unavailable()

    keyBinding = openSupabase(credentials.supabase)
    if (!keyBinding || typeof keyBinding.readProjectSecret !== 'function' || typeof keyBinding.dispose !== 'function') unavailable()
    projectSecret = await bounded(() => keyBinding.readProjectSecret({ signal: controller.signal }), value => value?.fill?.(0))
    if (!validBuffer(projectSecret)) unavailable()
    keyBinding.dispose(); keyBinding = undefined

    const preflight = createStagingProviderNormalizationPreflight({
      openSupabase: () => openSupabase(credentials.supabase),
      openVercel: () => openVercel(credentials.vercel),
      openSurface: () => openSurface(credentials.vercel, credentials.bypass),
      signal: controller.signal, now,
    })
    const native = makeNativePort({ projectSecret, signal: controller.signal,
      execute: async operation => ({ status: 'COMPLETED', value: await operation(controller.signal) }) })
    if (!native || typeof native.readProvider !== 'function' || typeof native.updateProvider !== 'function') unavailable()

    let preflights = 0, providerReads = 0, initialPreflight
    const ports = {
      preflight: async target => {
        if (preflights++ === 0) mark('PREFLIGHT')
        const receipt = await bounded(() => preflight.preflight(target))
        if (preflights === 1) initialPreflight = receipt
        return receipt
      },
      readProvider: async target => {
        mark(providerReads++ === 0 ? 'PROVIDER_PREREAD' : 'POSTREAD')
        return bounded(() => native.readProvider(target))
      },
      updateProvider: async (target, before) => {
        if (intentJournal.read()?.state !== 'INTENT_RECORDED' || phase.phase !== 'INTENT_RECORDED') unavailable()
        mark('UPDATE_DISPATCH')
        return bounded(() => {
          const ageMs = now() - Date.parse(initialPreflight?.observedAt)
          if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 30_000) unavailable()
          return native.updateProvider(target, before)
        })
      },
    }
    const journal = {
      read: () => intentJournal.read(),
      recordIntent: hash => {
        const receipt = intentJournal.recordIntent(hash)
        mark('INTENT_RECORDED')
        return receipt
      },
      transition: (receipt, state) => {
        const next = intentJournal.transition(receipt, state)
        if (state === 'UPDATE_ACKNOWLEDGED') mark('UPDATE_ACKNOWLEDGED')
        return next
      },
    }
    const result = await normalizeStagingProviderOnce({ ports, journal, now })
    if (result.status === 'NORMALIZED_VERIFIED') {
      try { phase = phaseJournal.finish(phase, 'VERIFIED'); outcome = 'NORMALIZED_VERIFIED' }
      catch { outcome = 'RECONCILIATION_REQUIRED' }
    } else if (result.status === 'STOPPED_BEFORE_UPDATE') {
      try { phase = phaseJournal.finish(phase, 'STOPPED_BEFORE_UPDATE'); outcome = 'STOPPED_BEFORE_UPDATE' }
      catch { outcome = 'RECONCILIATION_REQUIRED' }
    } else outcome = 'RECONCILIATION_REQUIRED'
  } catch { outcome = 'RECONCILIATION_REQUIRED' } finally {
    controller.abort()
    try { keyBinding?.dispose() } catch { cleanupFailed = true }
    projectSecret?.fill?.(0)
    wipeBuffers(credentials)
  }
  if (cleanupFailed) outcome = 'RECONCILIATION_REQUIRED'
  if (outcome === 'RECONCILIATION_REQUIRED') {
    try {
      if (phaseJournal.read()?.outcome === null) phaseJournal.finish(phase, 'RECONCILIATION_REQUIRED')
    } catch { /* Preserve the one-use file and reconcile separately. */ }
  }
  return fixed(outcome)
}
