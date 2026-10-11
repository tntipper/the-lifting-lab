/** Fixed successor registration contract. Native components remain guarded and v18-incompatible. */
import { createHash } from 'node:crypto'
import { readStagingGeneration23Credentials } from './staging-generation-23-credential-reader.mjs'
import { createStagingGeneration23FixedWorkerAssembly } from './staging-generation-23-fixed-worker-assembly.mjs'
import { WINDOW_ID as EXISTING_NATIVE_WINDOW } from './staging-generation-23-credentials.mjs'
export const OWNER_SUCCESSOR_NATIVE_REGISTRATION_ENABLED = false
export const OWNER_SUCCESSOR_WINDOW_ID = 'cd4130c8-a8b8-462b-bdbe-5c3e6250a02d'
export const OWNER_SUCCESSOR_EDGE_REVISION = 'tll-owner-successor-20261005-1'
export const OWNER_SUCCESSOR_EXPIRY = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'
export const OWNER_SUCCESSOR_TARGETS = Object.freeze({ supabase: 'qdmvngjwkcsilzmqksme',
  vercelProject: 'prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4', vercelTeam: 'team_gf7cgIkkoeMLtODFDDT5MrW4',
  branch: 'codex/tll-integration', environment: 'preview', shop: 'tll-integration-staging.myshopify.com',
  product: '15768467472724', variant: '57160491139412' })
export const OWNER_SUCCESSOR_SELECTORS = Object.freeze([
  Object.freeze(['Supabase CLI', 'supabase']),
  Object.freeze(['TLL Hosted Baseline Vercel API', OWNER_SUCCESSOR_TARGETS.vercelProject]),
  Object.freeze(['TLL Hosted Baseline Preview Bypass', OWNER_SUCCESSOR_TARGETS.vercelProject]),
])
export const OWNER_SUCCESSOR_PORTS = Object.freeze({ baseline: ['readBaseline'], settings: ['replaceSettings', 'readSettings'],
  databaseSetup: ['setupDatabase'], restrictedConnections: ['proveRestrictedConnections'], consumerReadiness: ['proveConsumers'],
  providerEnable: ['enableProvider'], databaseEnable: ['enableDatabase'], surfaceEnable: ['enableSurface'],
  ownerJourney: ['runOwnerJourney'], backendDisable: ['disableDatabase', 'disableProvider'],
  surfaceFreeze: ['freezeSurface'], databaseRetire: ['retireDatabase'], finalReadback: ['readFinal'] })
for (const ports of Object.values(OWNER_SUCCESSOR_PORTS)) Object.freeze(ports)
const statuses = Object.freeze({ readBaseline: 'BASELINE_HELD_VERIFIED', replaceSettings: 'SETTINGS_METADATA_VERIFIED',
  readSettings: 'SETTINGS_METADATA_VERIFIED', setupDatabase: 'SETUP_VERIFIED', proveRestrictedConnections: 'PASS_RESTRICTED_CONNECTIONS',
  proveConsumers: 'CONSUMERS_READY_VERIFIED', enableProvider: 'PROVIDER_ENABLED_VERIFIED', enableDatabase: 'CONTROL_ACTIVATION_VERIFIED',
  enableSurface: 'SURFACES_ENABLED_VERIFIED', runOwnerJourney: 'OWNER_JOURNEY_VERIFIED_NO_PURCHASE', disableDatabase: 'SHUTDOWN_VERIFIED',
  disableProvider: 'PROVIDER_DISABLED_VERIFIED', freezeSurface: 'SURFACES_HELD_VERIFIED', retireDatabase: 'RETIREMENT_VERIFIED', readFinal: 'FINAL_HELD_VERIFIED' })
const capabilities = new WeakMap(), unavailable = () => { throw Error('Successor registration unavailable') }
const exact = (value, names) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...names].sort().join('|')
const hash = (v, n) => typeof v === 'string' && new RegExp(`^[a-f0-9]{${n}}$`).test(v)
export function ownerSuccessorRegistrationDescriptor(pins) {
  if (!exact(pins, ['sourceSha', 'reviewedSha', 'manifestSha256', 'dependencySha256', 'windowId', 'edgeRevision'])
    || !hash(pins.sourceSha, 40) || pins.reviewedSha !== pins.sourceSha || !hash(pins.manifestSha256, 64)
    || !hash(pins.dependencySha256, 64) || pins.windowId !== OWNER_SUCCESSOR_WINDOW_ID
    || pins.edgeRevision !== OWNER_SUCCESSOR_EDGE_REVISION) unavailable()
  const descriptor = Object.freeze({ schema: 'tll-owner-successor-registration/v1', pins: Object.freeze({ ...pins }),
    targets: OWNER_SUCCESSOR_TARGETS, selectors: OWNER_SUCCESSOR_SELECTORS, ports: OWNER_SUCCESSOR_PORTS })
  return Object.freeze({ descriptor, digest: createHash('sha256').update(JSON.stringify(descriptor)).digest('hex') })
}
/** Synthetic action-time capability only; never asserts Toby approved hosted access. */
export function issueSyntheticRegistrationCapability({ pins, approvedAtMs, validUntilMs } = {}) {
  const { digest } = ownerSuccessorRegistrationDescriptor(pins)
  if (!Number.isSafeInteger(approvedAtMs) || approvedAtMs < 0 || !Number.isSafeInteger(validUntilMs)
    || validUntilMs <= approvedAtMs || validUntilMs - approvedAtMs > 30_000) unavailable()
  const value = Object.freeze({})
  capabilities.set(value, { digest, approvedAtMs, validUntilMs }); return value
}
const wipe = values => { for (const value of Object.values(values ?? {})) if (Buffer.isBuffer(value)) value.fill(0) }
const validCredentials = values => exact(values, ['managementToken', 'vercelToken', 'previewBypass'])
  && Object.values(values).every(v => Buffer.isBuffer(v) && v.length >= 8 && v.length <= 1024
    && /^[\x21-\x7e]+$/.test(v.toString('utf8')))
  && /^sbp_(?:oauth_|v0_)?[a-f0-9]{40}$/.test(values.managementToken.toString('utf8'))
  && new Set(Object.values(values)).size === 3 && !values.managementToken.equals(values.vercelToken)
  && !values.managementToken.equals(values.previewBypass) && !values.vercelToken.equals(values.previewBypass)

/** Bind actual port interfaces against synthetic stubs; no native factory is accepted by this path. */
export async function openSyntheticRegisteredSuccessor(options) {
  const capability = options?.capability, grant = capabilities.get(capability)
  capabilities.delete(capability)
  const { digest, descriptor } = ownerSuccessorRegistrationDescriptor(options?.pins), pins = descriptor.pins, now = options?.nowMs
  if (!grant || digest !== grant.digest || !Number.isSafeInteger(now)
    || now < grant.approvedAtMs || now >= grant.validUntilMs || options?.supervisorAccepted !== true) unavailable()
  const readStub = options.readStub, makeStubPorts = options.makeStubPorts
  if (typeof readStub !== 'function' || typeof makeStubPorts !== 'function') unavailable()
  let credentials, disposed = false
  try {
    credentials = await readStub(OWNER_SUCCESSOR_SELECTORS)
    if (!validCredentials(credentials)) unavailable()
    const bundle = await makeStubPorts({ credentials, descriptor: Object.freeze({ descriptor, digest }) })
    const names = Object.keys(statuses)
    if (!exact(bundle, ['kind', 'windowId', 'edgeRevision', 'adapters']) || bundle.kind !== 'SYNTHETIC_STUB'
      || bundle.windowId !== pins.windowId || bundle.edgeRevision !== pins.edgeRevision
      || !exact(bundle.adapters, names) || names.some(name => typeof bundle.adapters[name] !== 'function')) unavailable()
    const consumed = new Set()
    return Object.freeze({ authorization: 'NONE', provenance: 'SYNTHETIC_STUB',
      async runPhase(phase, input) {
        if (disposed || !Object.hasOwn(OWNER_SUCCESSOR_PORTS, phase) || consumed.has(phase)) unavailable()
        consumed.add(phase)
        try {
          for (const name of OWNER_SUCCESSOR_PORTS[phase]) {
            if (disposed) unavailable()
            const result = await bundle.adapters[name](input)
            if (disposed || result?.status !== statuses[name]) unavailable()
          }
          if (disposed) unavailable()
          return Object.freeze({ status: `PASS_${phase.toUpperCase()}`, authorization: 'NONE', provenance: 'SYNTHETIC_STUB' })
        } catch { disposed = true; wipe(credentials); unavailable() }
      },
      dispose() { disposed = true; wipe(credentials) },
    })
  } catch { wipe(credentials); unavailable() }
}
/** Real refs are fixed here, not caller-selected. This entry never reads options while OFF. */
export function registerOwnerSuccessorNativeComponents() {
  if (!OWNER_SUCCESSOR_NATIVE_REGISTRATION_ENABLED) return Object.freeze({ status: 'NATIVE_REGISTRATION_DISABLED', authorization: 'NONE' })
  // A gate flip cannot silently reuse old SQL/readiness/journals or mint live authority.
  if (EXISTING_NATIVE_WINDOW !== OWNER_SUCCESSOR_WINDOW_ID) return Object.freeze({ status: 'SUCCESSOR_WINDOW_BINDINGS_REQUIRED', authorization: 'NONE' })
  // Kept as inert references for a later separately reviewed native-window factory and opaque authority issuer.
  void readStagingGeneration23Credentials; void createStagingGeneration23FixedWorkerAssembly
  return Object.freeze({ status: 'ACTION_TIME_HOSTED_CAPABILITY_REQUIRED', authorization: 'NONE' })
}
