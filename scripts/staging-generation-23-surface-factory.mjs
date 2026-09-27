/**
 * Disabled composition of the Gen23 customer-facing staging surfaces.
 *
 * This is the one place which joins the existing narrow surface controls:
 * Vercel/Edge flags, the one-use Preview builder, the checkout handoff flag,
 * protected Preview reads, and the owner-assisted browser journey.  It does
 * not read Keychain, invent a source commit, or contact a provider on import.
 */
import { createStagingSurfaceNativeBinding } from './staging-surface-activation-native-binding.mjs'
import { createStagingSurfaceNativePorts } from './staging-surface-activation-native-adapter.mjs'
import { createStagingGeneration23PreviewBuildPort } from './staging-generation-23-preview-build-port.mjs'
import { createStagingGeneration23ProtectedFetch } from './staging-generation-23-protected-fetch.mjs'
import { createStagingGeneration23CheckoutSettingPort } from './staging-generation-23-checkout-setting-port.mjs'
import { createStagingGeneration23CheckoutReadinessReader } from './staging-generation-23-checkout-readiness-reader.mjs'
import { changeStagingCheckoutSetting } from './staging-generation-23-checkout-setting.mjs'
import { enableStagingSurfaces, freezeStagingSurfaces, readOnlyHeldStagingSurfaces,
  STAGING_SURFACE_TARGET } from './staging-surface-activation-transport.mjs'
import { runStagingGeneration23OwnerJourney } from './staging-generation-23-owner-journey.mjs'

export const STAGING_GENERATION_23_SURFACE_FACTORY_ENABLED = false
export const STAGING_GENERATION_23_SHOPIFY_VARIANT_ID = 'gid://shopify/ProductVariant/57160491139412'
const unavailable = () => { throw Error('Generation 23 surface factory unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const token = value => Buffer.isBuffer(value) && value.length >= 8 && value.length <= 1024
  && /^[\x21-\x7e]+$/.test(value.toString('utf8'))
const signalOk = signal => signal && typeof signal.aborted === 'boolean'
  && typeof signal.addEventListener === 'function' && !signal.aborted
const immutable = value => typeof value === 'string' && /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(value)
const deployment = value => value && typeof value === 'object' && !Array.isArray(value)
  && /^dpl_[A-Za-z0-9]+$/.test(value.deploymentId ?? '') && immutable(value.immutableUrl)
  && /^[a-f0-9]{40}$/.test(value.sourceCommit ?? '') && /^[a-f0-9]{64}$/.test(value.manifestSha256 ?? '')
  && value.ready === true && Number.isFinite(Date.parse(value.createdAt))
const requirements = (value, now) => exact(value, ['sourceCommit', 'manifestSha256', 'observedAt'])
  && /^[a-f0-9]{40}$/.test(value.sourceCommit) && /^[a-f0-9]{64}$/.test(value.manifestSha256)
  && Number.isFinite(Date.parse(value.observedAt)) && Date.parse(value.observedAt) <= now
  && now - Date.parse(value.observedAt) <= 5 * 60_000
const heldEvidence = (value, required) => deployment(value)
  && exact(value.target, Object.keys(STAGING_SURFACE_TARGET))
  && Object.entries(STAGING_SURFACE_TARGET).every(([key, item]) => value.target[key] === item)
  && value.sourceCommit === required.sourceCommit && value.manifestSha256 === required.manifestSha256

function checkedPrice(value, now) {
  if (!exact(value, ['status', 'variantId', 'pricePence', 'observedAt'])
    || value.status !== 'SHOPIFY_STAGING_VARIANT_PRICE_VERIFIED'
    || value.variantId !== STAGING_GENERATION_23_SHOPIFY_VARIANT_ID
    || !Number.isSafeInteger(value.pricePence) || value.pricePence < 1 || value.pricePence > 1_000_000
    || !Number.isFinite(Date.parse(value.observedAt)) || Date.parse(value.observedAt) > now
    || now - Date.parse(value.observedAt) > 5 * 60_000) unavailable()
  return value.pricePence
}

/**
 * The static protected-read helper is intentionally bound to a known immutable
 * build. This small router authorises only identities already verified by the
 * Vercel binding, plus the fixed branch alias. It prevents the bypass token
 * being sent to a URL merely because it looks like a Vercel URL.
 */
export function createProtectedRouter({ fetcher, bypass, initialDeployment, makeProtectedFetch }) {
  const readers = new Map()
  let current
  const authorise = identity => {
    if (!deployment(identity) || readers.has(identity.immutableUrl)) return
    const reader = makeProtectedFetch({ fetch: fetcher, bypass, immutableUrl: identity.immutableUrl })
    if (!reader || typeof reader.fetch !== 'function' || typeof reader.dispose !== 'function') unavailable()
    readers.set(identity.immutableUrl, reader)
    current = reader
  }
  authorise(initialDeployment)
  return Object.freeze({
    authorise,
    renew(identity) {
      if (!deployment(identity) || !readers.has(identity.immutableUrl)) unavailable()
      const prior = readers.get(identity.immutableUrl)
      prior.dispose()
      readers.delete(identity.immutableUrl)
      authorise(identity)
    },
    async fetch(url, options) {
      const parsed = new URL(url)
      const reader = parsed.origin === STAGING_SURFACE_TARGET.alias ? current : readers.get(parsed.origin)
      if (!reader) unavailable()
      return reader.fetch(url, options)
    },
    dispose() { for (const reader of readers.values()) reader.dispose(); readers.clear(); current = undefined },
  })
}

/**
 * Creates only the three customer-facing adapters consumed by the whole-run
 * coordinator: enable, owner journey, and freeze. All mutable ports are
 * constructed from one supplied Vercel token and have independent journals.
 */
export function createStagingGeneration23SurfaceFactory({ credentials, fetch: fetcher, runCli,
  execute, preflight, preview, journals, checkoutTarget, readVariantPrice,
  now = Date.now, factories = {} } = {}) {
  if (!STAGING_GENERATION_23_SURFACE_FACTORY_ENABLED
    || !exact(credentials, ['vercelToken', 'previewBypass']) || !token(credentials.vercelToken)
    || !token(credentials.previewBypass) || typeof fetcher !== 'function' || typeof runCli !== 'function'
    || typeof execute !== 'function' || !exact(preflight, ['heldEvidence', 'requirements'])
    || !requirements(preflight.requirements, now()) || !heldEvidence(preflight.heldEvidence, preflight.requirements)
    || !preview || !journals || !checkoutTarget
    || typeof readVariantPrice !== 'function' || typeof now !== 'function'
    || factories === null || typeof factories !== 'object' || Array.isArray(factories)) unavailable()
  const make = (name, fallback) => factories[name] ?? fallback
  const makeBinding = make('createBinding', createStagingSurfaceNativeBinding)
  const makePorts = make('createPorts', createStagingSurfaceNativePorts)
  const makePreview = make('createPreviewPort', createStagingGeneration23PreviewBuildPort)
  const makeProtected = make('createProtectedFetch', createStagingGeneration23ProtectedFetch)
  const makeCheckout = make('createCheckoutPort', createStagingGeneration23CheckoutSettingPort)
  const makeCheckoutReadiness = make('createCheckoutReadinessReader', createStagingGeneration23CheckoutReadinessReader)
  const enable = make('enableSurfaces', enableStagingSurfaces)
  const freeze = make('freezeSurfaces', freezeStagingSurfaces)
  const finalRead = make('readFinalHeld', readOnlyHeldStagingSurfaces)
  const changeCheckout = make('changeCheckoutSetting', changeStagingCheckoutSetting)
  const ownerJourney = make('runOwnerJourney', runStagingGeneration23OwnerJourney)
  if ([makeBinding, makePorts, makePreview, makeProtected, makeCheckout, makeCheckoutReadiness,
    enable, freeze, finalRead, changeCheckout, ownerJourney].some(value => typeof value !== 'function')) unavailable()
  if (!exact(preview, ['enabledJournal', 'heldJournal', 'runBuild'])
    || !exact(journals, ['enableSurface', 'freezeSurface', 'checkoutEnable', 'checkoutFreeze'])
    || Object.values(journals).some(value => !value) || typeof preview.runBuild !== 'function') unavailable()

  const router = createProtectedRouter({ fetcher, bypass: credentials.previewBypass,
    initialDeployment: preflight.heldEvidence, makeProtectedFetch: makeProtected })
  let disposed = false, enabled = false, frozen = false, activeDeployment, cachedPrice
  const requireLive = signal => { if (disposed || !signalOk(signal)) unavailable() }
  let binding
  try {
    binding = makeBinding({ runCli, fetch: fetcher, protectedFetch: router.fetch,
      vercelToken: credentials.vercelToken })
    if (!binding || typeof binding.readDeployment !== 'function'
      || typeof binding.readPublishedGitDeployment !== 'function'
      || typeof binding.resolveAlias !== 'function') unavailable()
    // The native surface adapter deliberately uses a compact six-field Vercel
    // receipt, while the Preview bridge deliberately requires the staging
    // target as a seventh field. Keep the conversion at this boundary rather
    // than weakening either existing receipt contract.
    const nativeReadDeployment = async (...args) => {
      const initial = args[1] === preflight.heldEvidence.deploymentId
      const observed = initial
        ? await binding.readPublishedGitDeployment(...args)
        : await binding.readDeployment(...args)
      // The first held build was made by Git and has no custom manifest field.
      // Only its exact preflight identity may inherit the independently proved
      // manifest. Builds created by this run must carry their own metadata.
      if (initial && (observed.deploymentId !== preflight.heldEvidence.deploymentId
        || observed.immutableUrl !== preflight.heldEvidence.immutableUrl
        || observed.sourceCommit !== preflight.requirements.sourceCommit
        || observed.ready !== true
        || observed.createdAt !== preflight.heldEvidence.createdAt)) unavailable()
      const identity = initial
        ? Object.freeze({ ...observed, manifestSha256: preflight.requirements.manifestSha256 })
        : observed
      router.authorise(identity)
      return identity
    }
    const refreshPinnedRequirements = async (identity, signal) => {
      const read = await nativeReadDeployment(STAGING_SURFACE_TARGET, identity.deploymentId, { signal })
      if (!deployment(read) || read.deploymentId !== identity.deploymentId
        || read.immutableUrl !== identity.immutableUrl
        || read.sourceCommit !== preflight.requirements.sourceCommit
        || read.manifestSha256 !== preflight.requirements.manifestSha256) unavailable()
      return Object.freeze({ ...preflight.requirements, observedAt: new Date(now()).toISOString() })
    }
    const previewReadDeployment = async (...args) => {
      const identity = await nativeReadDeployment(...args)
      return Object.freeze({ target: STAGING_SURFACE_TARGET, ...identity })
    }
    const resolveAlias = async (...args) => {
      const identity = await binding.resolveAlias(...args)
      // The alias itself is a fixed safe destination. Reading the immutable
      // identity before a protected runtime read makes the exact build explicit.
      await nativeReadDeployment(STAGING_SURFACE_TARGET, identity.deploymentId, { signal: args.at(-1)?.signal })
      return identity
    }
    const previewPort = makePreview({ enabledJournal: preview.enabledJournal, heldJournal: preview.heldJournal,
      runBuild: preview.runBuild, readDeployment: previewReadDeployment })
    const ports = makePorts({ execute, ...binding, createDeployment: previewPort.createDeployment,
      readDeployment: nativeReadDeployment, resolveAlias })
    if (!ports || typeof ports.readSurfaceFlags !== 'function') unavailable()

    const checkoutChange = async (action, journal, signal) => {
      const port = makeCheckout({ fetch: fetcher, token: credentials.vercelToken, target: checkoutTarget })
      if (!port || typeof port.read !== 'function' || typeof port.write !== 'function' || typeof port.dispose !== 'function') unavailable()
      try { return await changeCheckout({ action, target: checkoutTarget, journal, read: port.read, write: port.write, signal }) }
      finally { port.dispose() }
    }
    const checkoutRuntime = async (identity, expected, signal) => {
      // Route this through the same build-authorised protected reader used by
      // readiness. The checkout reader still owns its separate response
      // schema, but cannot send the bypass to an unverified Preview origin.
      router.authorise(identity)
      const reader = makeCheckoutReadiness({ fetch: router.fetch, bypass: credentials.previewBypass,
        deploymentId: identity.deploymentId, immutableUrl: identity.immutableUrl })
      if (!reader || typeof reader.read !== 'function' || typeof reader.dispose !== 'function') unavailable()
      try {
        const result = await reader.read({ expected, signal })
        if (result?.status !== 'CHECKOUT_RUNTIME_VERIFIED' || result.checkoutHandoffEnabled !== expected) unavailable()
      } finally { reader.dispose() }
    }

    return Object.freeze({
      ports: Object.freeze({
        async enableSurface({ signal } = {}) {
          requireLive(signal)
          if (enabled || frozen) unavailable()
          // This exact Shopify read happens before any customer-facing switch.
          // A stale RRP can therefore stop the window before it becomes visible.
          cachedPrice = checkedPrice(await readVariantPrice({ variantId: STAGING_GENERATION_23_SHOPIFY_VARIANT_ID, signal }), now())
          // Settings and restricted-login checks can legitimately take more
          // than five minutes. Refresh the pinned held build before the first
          // checkout or customer-facing setting changes.
          const currentRequirements = await refreshPinnedRequirements(preflight.heldEvidence, signal)
          const checkout = await checkoutChange('ENABLE', journals.checkoutEnable, signal)
          if (checkout?.status !== 'CHECKOUT_SETTING_ENABLED_VERIFIED') return Object.freeze({ status: 'HOLD_RECONCILIATION_REQUIRED' })
          const result = await enable({ ports, heldEvidence: preflight.heldEvidence,
            requirements: currentRequirements, journal: journals.enableSurface, now })
          if (result?.status !== 'SURFACES_ENABLED_VERIFIED' || !deployment(result.deployment)) return result
          await checkoutRuntime(result.deployment, true, signal)
          activeDeployment = result.deployment; enabled = true
          return result
        },
        async runOwnerJourney({ signal, phaseDeadlineAt, deployment: requested } = {}) {
          requireLive(signal)
          if (!enabled || frozen || !deployment(activeDeployment) || requested?.deploymentId !== activeDeployment.deploymentId
            || !Number.isSafeInteger(cachedPrice)) unavailable()
          // Do not use a hard-coded product price. The price was read from the
          // named staging Shopify variant immediately before surface activation.
          const verifyAlias = async ({ signal: checkSignal } = {}) => {
            requireLive(checkSignal)
            const current = await ports.resolveAlias(STAGING_SURFACE_TARGET, STAGING_SURFACE_TARGET.alias)
            if (current?.alias !== STAGING_SURFACE_TARGET.alias
              || current?.deploymentId !== activeDeployment.deploymentId
              || current?.immutableUrl !== activeDeployment.immutableUrl) unavailable()
          }
          return ownerJourney({ immutableUrl: activeDeployment.immutableUrl,
            applicationOrigin: STAGING_SURFACE_TARGET.alias, verifyAlias,
            bypass: credentials.previewBypass, expectedUnitPricePence: cachedPrice,
            signal, deadlineAt: phaseDeadlineAt })
        },
        async freezeSurface({ signal, deployment: requested } = {}) {
          requireLive(signal)
          if (!enabled || frozen || !deployment(activeDeployment) || requested?.deploymentId !== activeDeployment.deploymentId) unavailable()
          // Disable the checkout handoff before building the held Preview.
          const checkout = await checkoutChange('FREEZE', journals.checkoutFreeze, signal)
          if (checkout?.status !== 'CHECKOUT_SETTING_HELD_VERIFIED') return Object.freeze({ status: 'HOLD_RECONCILIATION_REQUIRED' })
          const currentRequirements = await refreshPinnedRequirements(activeDeployment, signal)
          const result = await freeze({ ports, currentEvidence: activeDeployment,
            requirements: currentRequirements, journal: journals.freezeSurface, now })
          if (result?.status !== 'SURFACES_HELD_VERIFIED' || !deployment(result.deployment)) return result
          await checkoutRuntime(result.deployment, false, signal)
          activeDeployment = result.deployment; frozen = true
          return result
        },
        async readFinalSurface({ signal } = {}) {
          requireLive(signal)
          if (!frozen || !deployment(activeDeployment)) unavailable()
          const currentRequirements = await refreshPinnedRequirements(activeDeployment, signal)
          // Freeze consumed the held build's three permitted reads. A fresh,
          // equally bounded reader is required for the final independent read.
          router.renew(activeDeployment)
          const result = await finalRead({ ports, heldEvidence: activeDeployment,
            requirements: currentRequirements, now })
          if (result?.status !== 'FINAL_SURFACES_HELD_VERIFIED'
            || result.deployment?.deploymentId !== activeDeployment.deploymentId) unavailable()
          await checkoutRuntime(activeDeployment, false, signal)
          const checkout = makeCheckout({ fetch: fetcher, token: credentials.vercelToken, target: checkoutTarget })
          if (!checkout || typeof checkout.read !== 'function' || typeof checkout.dispose !== 'function') unavailable()
          try {
            const row = await checkout.read(checkoutTarget, { signal })
            if (!row || row.id !== checkoutTarget.id || row.enabled !== false) unavailable()
          } finally { checkout.dispose() }
          return Object.freeze({ status: 'FINAL_SURFACES_HELD_VERIFIED' })
        },
      }),
      dispose() { if (!disposed) { disposed = true; cachedPrice = undefined; activeDeployment = undefined; router.dispose() } },
    })
  } catch {
    router.dispose()
    unavailable()
  }
}
