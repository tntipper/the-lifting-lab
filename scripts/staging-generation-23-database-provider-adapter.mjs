/**
 * Disabled composition layer for the already guarded Gen23 database and
 * provider components. It owns no credential, journal or network transport:
 * the supervised worker supplies separately journalled component instances.
 */
import { PASSWORD_PURPOSES } from './staging-generation-22-material.mjs'
import { PROJECT_REF } from './staging-generation-23-password-material.mjs'

export const STAGING_GENERATION_23_DATABASE_PROVIDER_ADAPTER_ENABLED = false
const unavailable = () => { throw Error('Generation 23 database/provider adapter unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const validSignal = signal => signal && !signal.aborted && typeof signal.addEventListener === 'function'
const validDeadline = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
const sameBase = (value, status) => exact(value, ['status', 'receiptSha256'])
  && value.status === status && /^[a-f0-9]{64}$/.test(value.receiptSha256)

function callable(value) {
  return typeof value === 'function' ? value : typeof value?.run === 'function' ? value.run.bind(value) : null
}

/**
 * Components must be constructed from Gen23's one-use database/provider
 * journals before entering here. This adapter only normalises their verified
 * terminal values into the names used by the whole-route controller.
 */
export function createStagingGeneration23DatabaseProviderAdapter({ databaseSetup,
  restrictedConnections, controlsEnable, controlsDisable, databaseRetire,
  providerEnable, providerDisable, readRetiredState,
} = {}) {
  if (!STAGING_GENERATION_23_DATABASE_PROVIDER_ADAPTER_ENABLED) unavailable()
  const setup = callable(databaseSetup)
  const restricted = typeof restrictedConnections === 'function' ? restrictedConnections
    : typeof restrictedConnections?.prove === 'function' ? restrictedConnections.prove.bind(restrictedConnections) : null
  const enableControls = callable(controlsEnable), disableControls = callable(controlsDisable)
  const retire = callable(databaseRetire), enableProvider = callable(providerEnable)
  const disableProvider = callable(providerDisable), readFinal = callable(readRetiredState)
  if (![setup, restricted, enableControls, disableControls, retire, enableProvider,
    disableProvider, readFinal].every(value => typeof value === 'function')) unavailable()
  let setupUsed = false, restrictedUsed = false, controlsEnabled = false, providerEnabled = false
  let controlsDisabled = false, providerDisabled = false, retireUsed = false, finalRead = false
  const baseInput = input => input && typeof input === 'object' && !Array.isArray(input)
    && validSignal(input.signal) && validDeadline(input.expiresAt) && validDeadline(input.deadlineAt)
    && Date.parse(input.deadlineAt) <= Date.parse(input.expiresAt)
  return Object.freeze({
    async setup(input) {
      if (setupUsed || !baseInput(input) || !exact(input.verifiers, PASSWORD_PURPOSES)) unavailable()
      setupUsed = true
      const result = await setup(input)
      if (!sameBase(result, 'SETUP_VERIFIED')) unavailable()
      return Object.freeze({ status: 'PASS_DATABASESETUP' })
    },
    async proveRestricted(input) {
      if (!setupUsed || restrictedUsed || !baseInput(input) || !exact(input.passwords, PASSWORD_PURPOSES)) unavailable()
      restrictedUsed = true
      const result = await restricted(input)
      if (!exact(result, ['status', 'projectRef', 'purposes', 'controlsEnabled'])
        || result.status !== 'PASS_RESTRICTED_CONNECTIONS' || result.projectRef !== PROJECT_REF
        || result.purposes !== PASSWORD_PURPOSES.length || result.controlsEnabled !== false) unavailable()
      return Object.freeze({ status: 'PASS_RESTRICTEDCONNECTIONS' })
    },
    async enableProvider(input) {
      if (!restrictedUsed || providerEnabled || !baseInput(input)) unavailable()
      providerEnabled = true
      const result = await enableProvider({ signal: input.signal, expiresAt: input.expiresAt })
      if (!exact(result, ['status', 'projectRef', 'identifier']) || result.status !== 'PROVIDER_ENABLED_VERIFIED'
        || result.projectRef !== PROJECT_REF || typeof result.identifier !== 'string') unavailable()
      return Object.freeze({ status: 'PASS_PROVIDERENABLE' })
    },
    async enableControls(input) {
      if (!providerEnabled || controlsEnabled || !baseInput(input)) unavailable()
      controlsEnabled = true
      const result = await enableControls(input)
      if (!sameBase(result, 'CONTROL_ACTIVATION_VERIFIED')) unavailable()
      return Object.freeze({ status: 'PASS_DATABASEENABLE' })
    },
    async disableControls(input) {
      if (!controlsEnabled || controlsDisabled || !baseInput(input)) unavailable()
      controlsDisabled = true
      const result = await disableControls(input)
      if (!sameBase(result, 'SHUTDOWN_VERIFIED')) unavailable()
      return Object.freeze({ status: 'PASS_BACKENDDISABLE' })
    },
    async disableProvider(input) {
      if (!controlsDisabled || providerDisabled || !baseInput(input)) unavailable()
      providerDisabled = true
      const result = await disableProvider({ signal: input.signal, expiresAt: input.expiresAt })
      if (!exact(result, ['status', 'projectRef', 'identifier']) || result.status !== 'PROVIDER_DISABLED_VERIFIED'
        || result.projectRef !== PROJECT_REF || typeof result.identifier !== 'string') unavailable()
      return Object.freeze({ status: 'PASS_PROVIDERDISABLE' })
    },
    async retire(input) {
      if (!providerDisabled || retireUsed || !baseInput(input)) unavailable()
      retireUsed = true
      const result = await retire(input)
      if (!sameBase(result, 'RETIREMENT_VERIFIED')) unavailable()
      return Object.freeze({ status: 'PASS_DATABASERETIRE' })
    },
    async readFinal(input) {
      if (!retireUsed || finalRead || !baseInput(input)) unavailable()
      finalRead = true
      const result = await readFinal({ signal: input.signal })
      const normalized = exact(result, ['status', 'projectRef', 'runtimeSessions', 'controlsEnabled'])
        && result.status === 'RETIRED_STATE_VERIFIED' && result.projectRef === PROJECT_REF
        && result.runtimeSessions === 0 && result.controlsEnabled === false
      // The fixed final observer has already validated the Gen23 retirement
      // marker and omitted fields inside its read-only SQL transaction.
      const observed = exact(result, ['status', 'projectRef']) && result.status === 'PASS_FINAL_RETIRED'
        && result.projectRef === PROJECT_REF
      if (!normalized && !observed) unavailable()
      return Object.freeze({ status: 'PASS_FINALREADBACK' })
    },
  })
}
