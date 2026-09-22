/**
 * Fixed, injected-only adapter for the staging custom OAuth provider.
 *
 * This deliberately has no credential discovery, process launcher, HTTP
 * default, or live entry point. A later reviewed launcher may inject the
 * official Supabase Auth Admin client and the two already-reviewed secret
 * hosts. Keeping this boundary dependency-injected makes ordinary tests prove
 * the exact request shape without granting this module ambient authority.
 */
import {
  BROKER_CLIENT_ID,
  BROKER_SECRET_NAME,
  PROVIDER_IDENTIFIER,
  STAGING_BROKER_PROVIDER,
  STAGING_PROJECT_REF,
  STAGING_PROVIDER_TARGET,
} from './staging-provider-broker-rotation.mjs'

export const NATIVE_STAGING_PROVIDER_BROKER_ADAPTER_ENABLED = false
// `@supabase/supabase-js` takes the project root and appends `/auth/v1`.
// Keeping the root here prevents an accidental `/auth/v1/auth/v1` request.
export const STAGING_AUTH_URL = `https://${STAGING_PROJECT_REF}.supabase.co`
export const STAGING_PROVIDER_NAME = 'TLL staging subject broker'

const OFFICIAL_PROVIDER_KEYS = new Set([
  'id', 'provider_type', 'identifier', 'name', 'client_id',
  'acceptable_client_ids', 'scopes', 'pkce_enabled', 'attribute_mapping',
  'authorization_params', 'enabled', 'email_optional', 'issuer',
  'discovery_url', 'skip_nonce_check', 'authorization_url', 'token_url',
  'userinfo_url', 'jwks_uri', 'discovery_document', 'created_at', 'updated_at',
])
const unavailable = () => { throw new Error('Staging provider native adapter unavailable') }
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

function validateTarget(value) {
  if (!exactKeys(value, Object.keys(STAGING_PROVIDER_TARGET))) unavailable()
  for (const [key, expected] of Object.entries(STAGING_PROVIDER_TARGET)) if (value[key] !== expected) unavailable()
  return STAGING_PROVIDER_TARGET
}

function copyBuffer(value, minimum = 1, maximum = 24_576) {
  if (!Buffer.isBuffer(value) || value.length < minimum || value.length > maximum) unavailable()
  return Buffer.from(value)
}

function cleanString(value, { minimum = 1, maximum = 2_048 } = {}) {
  return typeof value === 'string' && value.length >= minimum && value.length <= maximum && !/[\x00-\x1f\x7f]/.test(value)
}

function exactStringArray(value, expected) {
  return Array.isArray(value) && value.length === expected.length && value.every((item, index) => item === expected[index])
}

function safeStringArray(value) {
  return value === undefined || value === null || (Array.isArray(value) && value.length <= 32 && value.every(item => cleanString(item, { maximum: 256 })))
}

function safeObject(value) {
  return value === undefined || value === null || (value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length <= 32 && Object.keys(value).every(key => cleanString(key, { maximum: 128 })))
}

function safeOptionalUrl(value) {
  if (value === undefined || value === null || value === '') return true
  if (!cleanString(value, { maximum: 2_048 })) return false
  try { return new URL(value).protocol === 'https:' } catch { return false }
}

function validTimestamp(value) {
  return cleanString(value, { minimum: 20, maximum: 64 }) && Number.isFinite(Date.parse(value))
}

/**
 * Convert the documented Auth Admin custom-provider response without exposing
 * its write-only credential. Unknown fields are rejected so a Supabase API
 * change cannot silently loosen the frozen provider contract.
 */
export function projectOfficialProviderSchema(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.prototype.hasOwnProperty.call(value, 'client_secret')) unavailable()
  for (const key of Object.keys(value)) if (!OFFICIAL_PROVIDER_KEYS.has(key)) unavailable()
  if (!cleanString(value.id, { minimum: 1, maximum: 128 }) || value.provider_type !== 'oauth2' || value.identifier !== PROVIDER_IDENTIFIER
    || !cleanString(value.name, { minimum: 1, maximum: 128 }) || !cleanString(value.client_id, { minimum: 1, maximum: 256 })
    || !validTimestamp(value.created_at) || !validTimestamp(value.updated_at) || !safeStringArray(value.acceptable_client_ids)
    || !safeStringArray(value.scopes) || typeof value.pkce_enabled !== 'boolean' || typeof value.enabled !== 'boolean'
    || typeof value.email_optional !== 'boolean' || !safeObject(value.attribute_mapping) || !safeObject(value.authorization_params)
    || !safeOptionalUrl(value.issuer) || !safeOptionalUrl(value.discovery_url)
    || !(value.skip_nonce_check === undefined || value.skip_nonce_check === null || typeof value.skip_nonce_check === 'boolean')
    || !safeOptionalUrl(value.authorization_url) || !safeOptionalUrl(value.token_url) || !safeOptionalUrl(value.userinfo_url)
    || !safeOptionalUrl(value.jwks_uri) || !(value.discovery_document === undefined || value.discovery_document === null || safeObject(value.discovery_document))) unavailable()

  return Object.freeze({
    id: value.id,
    providerType: value.provider_type,
    identifier: value.identifier,
    name: value.name,
    clientId: value.client_id,
    acceptableClientIds: Object.freeze([...(value.acceptable_client_ids ?? [])]),
    scopes: Object.freeze([...(value.scopes ?? [])]),
    pkce: value.pkce_enabled,
    attributeMappingPresent: Object.keys(value.attribute_mapping ?? {}).length > 0,
    authorizationParamsPresent: Object.keys(value.authorization_params ?? {}).length > 0,
    enabled: value.enabled,
    emailOptional: value.email_optional,
    issuer: value.issuer ?? '',
    discoveryUrl: value.discovery_url ?? '',
    skipNonceCheck: value.skip_nonce_check ?? false,
    authorizationUrl: value.authorization_url ?? '',
    tokenUrl: value.token_url ?? '',
    userinfoUrl: value.userinfo_url ?? '',
    jwksUrl: value.jwks_uri ?? '',
    discoveryDocumentPresent: value.discovery_document !== undefined && value.discovery_document !== null,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  })
}

/** Strict desired-state projection used only by the rotation state machine. */
export function projectOfficialStagingProvider(value) {
  const projected = projectOfficialProviderSchema(value)
  if (projected.name !== STAGING_PROVIDER_NAME || projected.clientId !== BROKER_CLIENT_ID
    || !exactStringArray(projected.acceptableClientIds, []) || !exactStringArray(projected.scopes, ['subject'])
    || projected.pkce !== true || projected.enabled !== false || projected.emailOptional !== true
    || projected.attributeMappingPresent || projected.authorizationParamsPresent || projected.issuer !== '' || projected.discoveryUrl !== ''
    || projected.skipNonceCheck !== false || projected.jwksUrl !== '' || projected.discoveryDocumentPresent
    || projected.authorizationUrl !== STAGING_BROKER_PROVIDER.authorizationUrl || projected.tokenUrl !== STAGING_BROKER_PROVIDER.tokenUrl
    || projected.userinfoUrl !== STAGING_BROKER_PROVIDER.userinfoUrl) unavailable()
  return projected
}

function rotationProjection(value) {
  const full = projectOfficialStagingProvider(value)
  return Object.freeze({
    authorizationUrl: full.authorizationUrl,
    callbackUrl: STAGING_BROKER_PROVIDER.callbackUrl,
    clientId: full.clientId,
    emailOptional: full.emailOptional,
    enabled: full.enabled,
    identifier: full.identifier,
    jwksUrl: full.jwksUrl,
    pkce: full.pkce,
    scopes: Object.freeze([...full.scopes]),
    tokenUrl: full.tokenUrl,
    userinfoUrl: full.userinfoUrl,
  })
}

function providerResult(value) {
  if (!exactKeys(value, ['data', 'error']) || value.error !== null || !value.data || typeof value.data !== 'object' || Array.isArray(value.data)) unavailable()
  return value.data
}

function clientFor(createProviderClient, projectSecret, signal) {
  if (!signal || typeof signal.aborted !== 'boolean' || typeof signal.addEventListener !== 'function' || signal.aborted) unavailable()
  const material = copyBuffer(projectSecret)
  try {
    const client = createProviderClient(Object.freeze({
      target: STAGING_PROVIDER_TARGET,
      authUrl: STAGING_AUTH_URL,
      projectSecret: material,
      signal,
    }))
    if (!client || typeof client !== 'object' || !client.auth?.admin?.customProviders
      || typeof client.auth.admin.customProviders.getProvider !== 'function'
      || typeof client.auth.admin.customProviders.updateProvider !== 'function') unavailable()
    return client
  } finally { material.fill(0) }
}

async function invokeBounded(execute, operation) {
  let result
  try {
    result = await execute(async signal => {
      if (!signal || typeof signal.aborted !== 'boolean' || typeof signal.addEventListener !== 'function' || signal.aborted) unavailable()
      return operation(signal)
    })
  } catch { unavailable() }
  if (!exactKeys(result, ['status', 'value']) || result.status !== 'COMPLETED') unavailable()
  return result.value
}

async function withProviderClient(execute, createProviderClient, projectSecret, callback) {
  return invokeBounded(execute, async signal => {
    const client = clientFor(createProviderClient, projectSecret, signal)
    try { return await callback(client.auth.admin.customProviders, signal) } catch { unavailable() }
  })
}

function providerUpdatePayload(secret) {
  const broker = copyBuffer(secret, 32, 512)
  const clientSecret = broker.toString('utf8')
  if (!cleanString(clientSecret, { minimum: 32, maximum: 512 })) {
    broker.fill(0); unavailable()
  }
  return Object.freeze({
    broker,
    payload: Object.freeze({
      name: STAGING_PROVIDER_NAME,
      client_id: BROKER_CLIENT_ID,
      client_secret: clientSecret,
      acceptable_client_ids: [],
      scopes: ['subject'],
      pkce_enabled: true,
      attribute_mapping: {},
      authorization_params: {},
      enabled: false,
      email_optional: true,
      issuer: '',
      discovery_url: '',
      skip_nonce_check: false,
      authorization_url: STAGING_BROKER_PROVIDER.authorizationUrl,
      token_url: STAGING_BROKER_PROVIDER.tokenUrl,
      userinfo_url: STAGING_BROKER_PROVIDER.userinfoUrl,
      jwks_uri: '',
    }),
  })
}

function validateHostReceipt(value, status) {
  if (!exactKeys(value, ['status', 'target', 'name']) || value.status !== status || value.name !== BROKER_SECRET_NAME) unavailable()
  validateTarget(value.target)
  return Object.freeze({ status, target: STAGING_PROVIDER_TARGET, name: BROKER_SECRET_NAME })
}

function validateNameReadback(value) {
  if (!exactKeys(value, ['target', 'supabase', 'vercel']) || !Array.isArray(value.supabase) || !Array.isArray(value.vercel)) unavailable()
  validateTarget(value.target)
  for (const names of [value.supabase, value.vercel]) {
    if (names.some(name => typeof name !== 'string' || name.length < 1 || name.length > 256) || new Set(names).size !== names.length) unavailable()
  }
  return Object.freeze({ target: STAGING_PROVIDER_TARGET, supabase: Object.freeze([...value.supabase].sort()), vercel: Object.freeze([...value.vercel].sort()) })
}

function validateFrozen(value) {
  if (!exactKeys(value, ['target', 'providerIdentifier', 'providerEnabled', 'edgeEnabled', 'privateEnabled', 'publicEnabled', 'supabase', 'vercel'])) unavailable()
  validateTarget(value.target)
  if (value.providerIdentifier !== PROVIDER_IDENTIFIER || typeof value.providerEnabled !== 'boolean' || typeof value.edgeEnabled !== 'boolean'
    || typeof value.privateEnabled !== 'boolean' || typeof value.publicEnabled !== 'boolean' || !Array.isArray(value.supabase) || !Array.isArray(value.vercel)) unavailable()
  const names = validateNameReadback({ target: value.target, supabase: value.supabase, vercel: value.vercel })
  return Object.freeze({ target: STAGING_PROVIDER_TARGET, providerIdentifier: PROVIDER_IDENTIFIER, providerEnabled: value.providerEnabled,
    edgeEnabled: value.edgeEnabled, privateEnabled: value.privateEnabled, publicEnabled: value.publicEnabled,
    supabase: names.supabase, vercel: names.vercel })
}

/**
 * Create only the ports consumed by rotateStagingProviderBroker. Every host is
 * injected and must return its fixed acknowledgement; a resolved transport
 * promise without an exact acknowledgement is deliberately ambiguous.
 */
export function createStagingProviderBrokerNativeAdapter({ target = STAGING_PROVIDER_TARGET, projectSecret, createProviderClient,
  readFrozenState, vercel, supabase, execute } = {}) {
  validateTarget(target)
  if (!Buffer.isBuffer(projectSecret) || typeof createProviderClient !== 'function' || typeof readFrozenState !== 'function' || typeof execute !== 'function'
    || !vercel || !supabase || ['stage', 'remove'].some(name => typeof vercel[name] !== 'function' || typeof supabase[name] !== 'function')
    || typeof vercel.readNames !== 'function' || typeof supabase.readNames !== 'function') unavailable()

  const inspect = async ({ strict }) => withProviderClient(execute, createProviderClient, projectSecret, async customProviders => {
    const result = providerResult(await customProviders.getProvider(PROVIDER_IDENTIFIER))
    return strict ? rotationProjection(result) : projectOfficialProviderSchema(result)
  })
  const stage = async (host, material) => {
    const copy = copyBuffer(material, 32, 512)
    try {
      return validateHostReceipt(await invokeBounded(execute, signal => host.stage(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, copy, { signal })), 'STAGED')
    } catch { unavailable() } finally { copy.fill(0) }
  }
  const remove = async host => {
    try { return validateHostReceipt(await invokeBounded(execute, signal => host.remove(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, { signal })), 'REMOVED') } catch { unavailable() }
  }
  const readback = async () => {
    try {
      const [supabaseNames, vercelNames] = await Promise.all([
        invokeBounded(execute, signal => supabase.readNames(STAGING_PROVIDER_TARGET, { signal })),
        invokeBounded(execute, signal => vercel.readNames(STAGING_PROVIDER_TARGET, { signal })),
      ])
      return validateNameReadback({ target: STAGING_PROVIDER_TARGET, supabase: supabaseNames, vercel: vercelNames })
    } catch { unavailable() }
  }

  return Object.freeze({
    preflight: async callerTarget => {
      validateTarget(callerTarget)
      try { return validateFrozen(await invokeBounded(execute, signal => readFrozenState(STAGING_PROVIDER_TARGET, { signal }))) } catch { unavailable() }
    },
    stageVercelBrokerSecret: async (callerTarget, name, material) => {
      validateTarget(callerTarget); if (name !== BROKER_SECRET_NAME) unavailable(); return stage(vercel, material)
    },
    stageSupabaseBrokerSecret: async (callerTarget, name, material) => {
      validateTarget(callerTarget); if (name !== BROKER_SECRET_NAME) unavailable(); return stage(supabase, material)
    },
    getProvider: async (callerTarget, identifier) => {
      validateTarget(callerTarget); if (identifier !== PROVIDER_IDENTIFIER) unavailable()
      // Rotation validates only its safe precondition fields before generating
      // material. It must be able to repair blank scopes and other desired
      // drift, while its own JWKS check still holds unexpected dependencies.
      return Object.freeze({ target: STAGING_PROVIDER_TARGET, provider: await inspect({ strict: false }) })
    },
    updateProvider: async (callerTarget, settings, material) => {
      validateTarget(callerTarget)
      if (!exactKeys(settings, Object.keys(STAGING_BROKER_PROVIDER))) unavailable()
      for (const [key, expected] of Object.entries(STAGING_BROKER_PROVIDER)) {
        if (Array.isArray(expected) ? !exactStringArray(settings[key], expected) : settings[key] !== expected) unavailable()
      }
      const update = providerUpdatePayload(material)
      try {
        await withProviderClient(execute, createProviderClient, projectSecret, async customProviders => {
          projectOfficialStagingProvider(providerResult(await customProviders.updateProvider(PROVIDER_IDENTIFIER, update.payload)))
        })
      } finally {
        // The SDK contract requires a string body. This adapter never returns,
        // journals, logs, or reuses that string; Buffer material is still wiped.
        // A later launcher must keep the process lifetime bounded.
        update.broker.fill(0)
      }
      return Object.freeze({ status: 'UPDATED', target: STAGING_PROVIDER_TARGET, providerIdentifier: PROVIDER_IDENTIFIER })
    },
    readProvider: async (callerTarget, identifier) => {
      validateTarget(callerTarget); if (identifier !== PROVIDER_IDENTIFIER) unavailable()
      return Object.freeze({ target: STAGING_PROVIDER_TARGET, provider: await inspect({ strict: true }) })
    },
    removeVercelBrokerSecret: async (callerTarget, name) => { validateTarget(callerTarget); if (name !== BROKER_SECRET_NAME) unavailable(); return remove(vercel) },
    removeSupabaseBrokerSecret: async (callerTarget, name) => { validateTarget(callerTarget); if (name !== BROKER_SECRET_NAME) unavailable(); return remove(supabase) },
    readbackSecretNames: async callerTarget => { validateTarget(callerTarget); return readback() },
    /** Separate prerequisite: disable, then obtain a complete redacted readback. */
    disableProviderAndReadback: async callerTarget => {
      validateTarget(callerTarget)
      let before
      try {
        before = await inspect({ strict: false })
        if (before.enabled) {
          await withProviderClient(execute, createProviderClient, projectSecret, async customProviders => {
            const result = providerResult(await customProviders.updateProvider(PROVIDER_IDENTIFIER, { enabled: false }))
            const updated = projectOfficialProviderSchema(result)
            if (updated.enabled !== false) unavailable()
          })
        }
        const after = await inspect({ strict: false })
        if (after.enabled !== false) unavailable()
        return Object.freeze({ status: 'PROVIDER_DISABLED_VERIFIED', target: STAGING_PROJECT_REF, providerIdentifier: PROVIDER_IDENTIFIER, provider: after })
      } catch {
        return Object.freeze({ status: 'RECONCILIATION_REQUIRED', target: STAGING_PROJECT_REF, providerIdentifier: PROVIDER_IDENTIFIER })
      }
    },
  })
}
