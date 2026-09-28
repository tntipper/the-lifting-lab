/** Disabled, injected-only control for the extra Preview checkout handoff switch. */
import { STAGING_BRANCH } from './staging-surface-activation-transport.mjs'

export const STAGING_GENERATION_23_CHECKOUT_SETTING_ENABLED = true
export const CHECKOUT_SETTING_NAME = 'TLL_STAGING_CART_CHECKOUT_HANDOFF_ENABLED'
const unavailable = () => { throw Error('Generation 23 checkout setting unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

function validateTarget(value) {
  if (!exact(value, ['name', 'id', 'branch', 'environment', 'classification'])
    || value.name !== CHECKOUT_SETTING_NAME || !/^[A-Za-z0-9_-]{4,128}$/.test(value.id)
    || value.branch !== STAGING_BRANCH || value.environment !== 'preview'
    || value.classification !== 'config') unavailable()
  return value
}

function validateObservation(value, target, expected) {
  if (!exact(value, ['name', 'id', 'branch', 'environment', 'classification', 'enabled'])) unavailable()
  validateTarget({ name: value.name, id: value.id, branch: value.branch,
    environment: value.environment, classification: value.classification })
  if (value.id !== target.id || value.enabled !== expected) unavailable()
}

/** Each action needs its own unused durable journal and reviewed fixed-ID port. */
export async function changeStagingCheckoutSetting({ action, target, journal,
  read, write, signal } = {}) {
  if (!STAGING_GENERATION_23_CHECKOUT_SETTING_ENABLED || !['ENABLE', 'FREEZE'].includes(action)
    || !journal || typeof journal.read !== 'function' || typeof journal.recordIntent !== 'function'
    || typeof journal.transition !== 'function' || journal.read() !== null
    || typeof read !== 'function' || typeof write !== 'function' || !signal
    || typeof signal.addEventListener !== 'function' || signal.aborted) unavailable()
  validateTarget(target)
  const desired = action === 'ENABLE'
  // The setting must already exist as branch-only Config and be in the
  // opposite state. A missing row is a prerequisite failure, not a cue to add
  // one silently inside the short-lived customer-test window.
  validateObservation(await read(target, { signal }), target, !desired)
  if (signal.aborted) unavailable()
  const intent = journal.recordIntent(action, target)
  if (intent?.action !== action || intent.settingId !== target.id
    || intent.state !== 'INTENT_RECORDED') unavailable()
  try {
    const receipt = await write(target, desired, { signal })
    validateObservation(receipt, target, desired)
    validateObservation(await read(target, { signal }), target, desired)
    if (signal.aborted) unavailable()
    journal.transition(intent, desired ? 'ENABLE_VERIFIED' : 'FREEZE_VERIFIED')
    return Object.freeze({ status: desired ? 'CHECKOUT_SETTING_ENABLED_VERIFIED'
      : 'CHECKOUT_SETTING_HELD_VERIFIED', settingId: target.id })
  } catch {
    // The write may have happened even when its reply was lost. Never retry or
    // guess that the old value is still in force.
    try { journal.transition(intent, 'RECONCILIATION_REQUIRED') } catch { /* preserve intent */ }
    return Object.freeze({ status: 'HOLD_RECONCILIATION_REQUIRED', settingId: target.id })
  }
}
