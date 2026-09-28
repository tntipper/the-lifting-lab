/**
 * Disabled composition for the single Gen23 hosted window.
 *
 * This is deliberately only a coordinator.  It does not create credentials,
 * read Keychain, choose a target, or add a fallback transport.  The launcher
 * must pass the already-armed, fixed-target ports and journals from the Gen23
 * modules.  A missing port stops before the whole-route runner is entered.
 */
export const STAGING_GENERATION_23_HOSTED_ASSEMBLY_ENABLED = true

const unavailable = () => { throw Error('Generation 23 hosted assembly unavailable') }
const signalOk = signal => signal && typeof signal.aborted === 'boolean'
  && typeof signal.addEventListener === 'function' && !signal.aborted

// Concrete ports include their own fixed receipt fields (for example the
// immutable Preview deployment).  The coordinator checks the status here and
// lets the port remain the authority for that narrower receipt schema.
const phaseResult = (value, expected) => value && typeof value === 'object' && !Array.isArray(value)
  && value.status === expected
const required = Object.freeze([
  'readBaseline', 'replaceSettings', 'readSettings', 'setupDatabase',
  'proveRestrictedConnections', 'proveConsumers', 'enableProvider', 'enableDatabase',
  'enableSurface', 'runOwnerJourney', 'disableDatabase', 'disableProvider',
  'freezeSurface', 'retireDatabase', 'readFinal',
])

/**
 * Binds the concrete Gen23 ports into the twelve-phase whole-route runner.
 * Every adapter is injected so the launcher can keep credential buffers in
 * its child process.  Each adapter must use the existing one-use journal and
 * fixed target port; this coordinator never retries an adapter.
 *
 * The expected adapter results are intentionally narrow.  If a transport
 * loses a reply or a journal reports HOLD, the outer whole-run records HOLD
 * and the backend-first shutdown path is not guessed or replayed.
 */
export function createStagingGeneration23HostedAssembly({ adapters, runWhole,
  now = Date.now } = {}) {
  if (!STAGING_GENERATION_23_HOSTED_ASSEMBLY_ENABLED || !adapters
    || typeof adapters !== 'object' || Array.isArray(adapters)
    || required.some(name => typeof adapters[name] !== 'function')
    || typeof runWhole !== 'function' || typeof now !== 'function') unavailable()

  let used = false
  let enabledSurface
  let heldConsumerSurface
  const invoke = async (name, input, expected) => {
    if (input.signal.aborted) unavailable()
    const result = await adapters[name](Object.freeze(input))
    if (!phaseResult(result, expected)) unavailable()
    return result
  }

  const operations = Object.freeze({
    async baseline(input) {
      await invoke('readBaseline', input, 'BASELINE_HELD_VERIFIED')
      return Object.freeze({ status: 'PASS_BASELINE' })
    },
    async settings(input) {
      await invoke('replaceSettings', input, 'SETTINGS_METADATA_VERIFIED')
      // A replacement receipt alone cannot prove the settings still point at
      // the exact branch.  The second, value-free read is required before DB setup.
      await invoke('readSettings', input, 'SETTINGS_METADATA_VERIFIED')
      return Object.freeze({ status: 'PASS_SETTINGS' })
    },
    async databaseSetup(input) {
      await invoke('setupDatabase', input, 'SETUP_VERIFIED')
      return Object.freeze({ status: 'PASS_DATABASESETUP' })
    },
    async restrictedConnections(input) {
      await invoke('proveRestrictedConnections', input, 'PASS_RESTRICTED_CONNECTIONS')
      return Object.freeze({ status: 'PASS_RESTRICTEDCONNECTIONS' })
    },
    async consumerReadiness(input) {
      const result = await invoke('proveConsumers', input, 'CONSUMERS_READY_VERIFIED')
      if (!result.deployment || typeof result.deployment !== 'object') unavailable()
      heldConsumerSurface = result.deployment
      return Object.freeze({ status: 'PASS_CONSUMERREADINESS' })
    },
    async providerEnable(input) {
      await invoke('enableProvider', input, 'PROVIDER_ENABLED_VERIFIED')
      return Object.freeze({ status: 'PASS_PROVIDERENABLE' })
    },
    async databaseEnable(input) {
      await invoke('enableDatabase', input, 'CONTROL_ACTIVATION_VERIFIED')
      return Object.freeze({ status: 'PASS_DATABASEENABLE' })
    },
    async surfaceEnable(input) {
      if (!heldConsumerSurface) unavailable()
      const result = await invoke('enableSurface', Object.freeze({ ...input,
        heldEvidence: heldConsumerSurface }), 'SURFACES_ENABLED_VERIFIED')
      // Keep the immutable deployment identity only in memory.  It is passed
      // to the browser guard and then to the OFF deployment; no alias may be
      // substituted halfway through a customer test.
      if (!result.deployment || typeof result.deployment !== 'object') unavailable()
      enabledSurface = result.deployment
      heldConsumerSurface = undefined
      return Object.freeze({ status: 'PASS_SURFACEENABLE' })
    },
    async ownerJourney(input) {
      if (!enabledSurface) unavailable()
      const result = await adapters.runOwnerJourney(Object.freeze({ ...input, deployment: enabledSurface }))
      if (phaseResult(result, 'OWNER_JOURNEY_FAILED_VERIFIED')) return result
      if (!phaseResult(result, 'OWNER_JOURNEY_VERIFIED_NO_PURCHASE')) unavailable()
      return Object.freeze({ status: 'PASS_OWNERJOURNEY' })
    },
    async backendDisable(input) {
      // The database is disabled before the provider.  This preserves the
      // existing fail-closed order and avoids an enabled provider with a live
      // application backend after a partial shutdown.
      await invoke('disableDatabase', input, 'SHUTDOWN_VERIFIED')
      await invoke('disableProvider', input, 'PROVIDER_DISABLED_VERIFIED')
      return Object.freeze({ status: 'PASS_BACKENDDISABLE' })
    },
    async surfaceFreeze(input) {
      if (!enabledSurface) unavailable()
      await invoke('freezeSurface', Object.freeze({ ...input, deployment: enabledSurface }), 'SURFACES_HELD_VERIFIED')
      return Object.freeze({ status: 'PASS_SURFACEFREEZE' })
    },
    async databaseRetire(input) {
      await invoke('retireDatabase', input, 'RETIREMENT_VERIFIED')
      return Object.freeze({ status: 'PASS_DATABASERETIRE' })
    },
    async finalReadback(input) {
      await invoke('readFinal', input, 'FINAL_HELD_VERIFIED')
      enabledSurface = undefined
      heldConsumerSurface = undefined
      return Object.freeze({ status: 'PASS_FINALREADBACK' })
    },
  })

  return Object.freeze({
    operations,
    async run({ signal, windowExpiresAt, journal } = {}) {
      if (used || !signalOk(signal) || typeof windowExpiresAt !== 'string') unavailable()
      used = true
      try {
        const result = await runWhole({ operations, now, signal, windowExpiresAt, journal })
        if (!result || typeof result !== 'object' || Array.isArray(result)) unavailable()
        return result
      } finally {
        // An aborted or held route must not leave a deployment identity that a
        // later call could accidentally reuse.  Durable state is in the ports'
        // journals and must be reconciled separately.
        enabledSurface = undefined
        heldConsumerSurface = undefined
      }
    },
    dispose() { enabledSurface = undefined; heldConsumerSurface = undefined },
  })
}
