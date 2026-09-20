/**
 * Transport-independent generation-6 secret and credential window.
 *
 * Committed native/network access remains disabled. Tests inject synthetic
 * ports; a separately reviewed launcher must supply real, fixed transports.
 */
import { createHash, createHmac, pbkdf2Sync, randomBytes as systemRandomBytes, randomUUID as systemRandomUUID } from 'node:crypto'
import { buildGeneration6CredentialSql, createGeneration6DispatchJournal, GENERATION, IDENTITIES, MAX_WINDOW_MS, PACKAGE_ID, PROJECT_REF, WINDOW_ID } from './staging-generation-6-credentials.mjs'

export const NATIVE_TRANSPORT_ENABLED = false
export const SHOPIFY_CREDENTIAL_DEPENDENCIES = Object.freeze([
  'TLL_STAGING_CART_STOREFRONT_TOKEN',
  'TLL_STAGING_SHOPIFY_CUSTOMER_CLIENT_SECRET',
])
export const GENERATED_VERCEL_SECRET_NAMES = Object.freeze([
  ...Object.keys(IDENTITIES).map(purpose => `TLL_STAGING_${purpose.toUpperCase()}_DATABASE_PASSWORD`),
  ...['TOKEN','PROVISIONAL','COOKIE','FINAL'].flatMap(purpose => [
    `TLL_STAGING_CUSTOMER_${purpose}_VAULT_KEY_ID`, `TLL_STAGING_CUSTOMER_${purpose}_VAULT_KEY_HEX`,
  ]),
  'TLL_STAGING_CART_VAULT_KEY_ID', 'TLL_STAGING_CART_VAULT_KEY_HEX', 'TLL_STAGING_CART_HMAC_KEY_HEX',
  'TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET',
].sort())
export const GENERATED_SUPABASE_SECRET_NAMES = Object.freeze([
  'TLL_STAGING_BROKER_DATABASE_PASSWORD', 'TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET',
].sort())
export const DISABLED_VERCEL_CONFIGURATION = Object.freeze({
  TLL_STAGING_CUSTOMER_ENABLED: 'false', TLL_STAGING_CART_ENABLED: 'false',
  NEXT_PUBLIC_TLL_STAGING_CUSTOMER: 'disabled', NEXT_PUBLIC_TLL_STAGING_CART: 'disabled',
})
export const STAGED_VERCEL_NAMES = Object.freeze([...GENERATED_VERCEL_SECRET_NAMES, ...Object.keys(DISABLED_VERCEL_CONFIGURATION)].sort())

const purposes = Object.keys(IDENTITIES)
const unavailable = () => { throw new Error('Generation-6 transport unavailable') }
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const encode = buffer => buffer.toString('base64url')
const hex = buffer => buffer.toString('hex')

function takeRandom(random, size) {
  const value = random(size)
  if (!Buffer.isBuffer(value) || value.length !== size) unavailable()
  return value
}

export function deriveScramVerifier(password, salt = systemRandomBytes(18)) {
  const secret = Buffer.isBuffer(password) ? password : Buffer.from(password)
  const saltBytes = Buffer.isBuffer(salt) ? salt : Buffer.from(salt)
  if (secret.length < 32 || secret.length > 128 || saltBytes.length < 16 || saltBytes.length > 32) unavailable()
  let salted; let clientKey; let storedKey; let serverKey
  try {
    salted = pbkdf2Sync(secret, saltBytes, 4096, 32, 'sha256')
    clientKey = createHmac('sha256', salted).update('Client Key').digest()
    storedKey = createHash('sha256').update(clientKey).digest()
    serverKey = createHmac('sha256', salted).update('Server Key').digest()
    return `SCRAM-SHA-256$4096:${saltBytes.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`
  } finally { salted?.fill(0); clientKey?.fill(0); storedKey?.fill(0); serverKey?.fill(0); if (!Buffer.isBuffer(password)) secret.fill(0) }
}

/** Buffers are owned by the caller and must be erased with eraseMaterial. */
export function generateGeneration6Material({ randomBytes = systemRandomBytes, randomUUID = systemRandomUUID } = {}) {
  const passwords = Object.fromEntries(purposes.map(purpose => [purpose, takeRandom(randomBytes, 48)]))
  const customerVaults = Object.fromEntries(['TOKEN','PROVISIONAL','COOKIE','FINAL'].map(purpose => [purpose, Object.freeze({ id: randomUUID(), key: takeRandom(randomBytes, 32) })]))
  const material = { passwords, customerVaults, cartVault: { id: randomUUID(), key: takeRandom(randomBytes, 32) },
    cartHmac: takeRandom(randomBytes, 32), brokerSecret: takeRandom(randomBytes, 48) }
  const ids = [...Object.values(customerVaults).map(value => value.id), material.cartVault.id]
  const secretBuffers=[...Object.values(passwords),...Object.values(customerVaults).map(value=>value.key),material.cartVault.key,material.cartHmac,material.brokerSecret]
  if (new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id))
    ||new Set(secretBuffers.map(value=>value.toString('hex'))).size!==secretBuffers.length) { eraseGeneration6Material(material); unavailable() }
  return material
}

export function eraseGeneration6Material(material) {
  if (!material || typeof material !== 'object') return
  for (const value of Object.values(material.passwords ?? {})) if (Buffer.isBuffer(value)) value.fill(0)
  for (const value of Object.values(material.customerVaults ?? {})) if (Buffer.isBuffer(value?.key)) value.key.fill(0)
  if (Buffer.isBuffer(material.cartVault?.key)) material.cartVault.key.fill(0)
  if (Buffer.isBuffer(material.cartHmac)) material.cartHmac.fill(0)
  if (Buffer.isBuffer(material.brokerSecret)) material.brokerSecret.fill(0)
}

export function projectGeneration6Secrets(material) {
  if (!material || !exactKeys(material.passwords, purposes) || !exactKeys(material.customerVaults, ['TOKEN','PROVISIONAL','COOKIE','FINAL'])) unavailable()
  const vercel = {}
  for (const purpose of purposes) vercel[`TLL_STAGING_${purpose.toUpperCase()}_DATABASE_PASSWORD`] = encode(material.passwords[purpose])
  for (const [purpose, vault] of Object.entries(material.customerVaults)) {
    vercel[`TLL_STAGING_CUSTOMER_${purpose}_VAULT_KEY_ID`] = vault.id
    vercel[`TLL_STAGING_CUSTOMER_${purpose}_VAULT_KEY_HEX`] = hex(vault.key)
  }
  Object.assign(vercel, { TLL_STAGING_CART_VAULT_KEY_ID: material.cartVault.id, TLL_STAGING_CART_VAULT_KEY_HEX: hex(material.cartVault.key),
    TLL_STAGING_CART_HMAC_KEY_HEX: hex(material.cartHmac), TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET: encode(material.brokerSecret) })
  const supabase = { TLL_STAGING_BROKER_DATABASE_PASSWORD: vercel.TLL_STAGING_BROKER_DATABASE_PASSWORD,
    TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET: vercel.TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET }
  if (!exactKeys(vercel, GENERATED_VERCEL_SECRET_NAMES) || !exactKeys(supabase, GENERATED_SUPABASE_SECRET_NAMES)
    || new Set(purposes.map(purpose => vercel[`TLL_STAGING_${purpose.toUpperCase()}_DATABASE_PASSWORD`])).size !== 5) unavailable()
  return { vercel, supabase, passwords: Object.fromEntries(purposes.map(purpose => [purpose, vercel[`TLL_STAGING_${purpose.toUpperCase()}_DATABASE_PASSWORD`]])) }
}

export function validateGeneration6Receipt(rows, expiresAt) {
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || Object.keys(rows[0]).join('|') !== 'tll_generation_6_credential_receipt') unavailable()
  const value = rows[0].tll_generation_6_credential_receipt
  const expected = { controlsEnabled: false, expiresAt, generation: GENERATION, packageId: PACKAGE_ID, projectRef: PROJECT_REF,
    runtimeCount: 5, status: 'PASS', windowId: WINDOW_ID }
  if (!exactKeys(value, Object.keys(expected))) unavailable()
  for (const [key, expectedValue] of Object.entries(expected)) if (value[key] !== expectedValue) unavailable()
  return Object.freeze(expected)
}

function eraseProjection(projection) {
  if (!projection) return
  for (const group of [projection.vercel, projection.supabase, projection.passwords]) {
    if (!group) continue
    for (const key of Object.keys(group)) group[key] = undefined
  }
}

/**
 * Synthetic-port orchestration. No caller error or provider response is exposed.
 * Once database dispatch starts, every failure requires recovery and no retry.
 */
export async function executeGeneration6CredentialWindow({ ports, journal = createGeneration6DispatchJournal(), now = Date.now,
  randomBytes = systemRandomBytes, randomUUID = systemRandomUUID } = {}) {
  const required = ['preflightDatabase','stageVercel','stageSupabase','readbackNames','dispatchDatabase','verifyConnections','recoverDatabase','removeVercel','removeSupabase']
  if (!ports || required.some(name => typeof ports[name] !== 'function')) unavailable()
  const nowMs = now(), expiryMs = Math.floor((nowMs + MAX_WINDOW_MS - 5 * 60 * 1000) / 1000) * 1000
  const expiresAt = new Date(expiryMs).toISOString()
  let material; let projection; let intent; let dispatchAttempted = false; let providerAttempted = false; let preflightPassed = false; let phase='ENTRY_PREFLIGHT'
  try {
    try { await ports.preflightDatabase() }
    catch { phase='ENTRY_PREFLIGHT_RETRY';await ports.preflightDatabase() }
    preflightPassed = true
    phase='MATERIAL_GENERATION'
    material = generateGeneration6Material({ randomBytes, randomUUID }); projection = projectGeneration6Secrets(material)
    providerAttempted = true;phase='VERCEL_STAGE'
    await ports.stageVercel({ secrets: projection.vercel, configuration: DISABLED_VERCEL_CONFIGURATION })
    phase='SUPABASE_STAGE'
    await ports.stageSupabase({ secrets: projection.supabase })
    phase='PROVIDER_READBACK'
    const names = await ports.readbackNames()
    if (!names || !Array.isArray(names.vercel) || !Array.isArray(names.supabase)
      || STAGED_VERCEL_NAMES.some(name => !names.vercel.includes(name))
      || GENERATED_SUPABASE_SECRET_NAMES.some(name => !names.supabase.includes(name))) unavailable()
    phase='DATABASE_PACKAGE'
    const verifiers = Object.fromEntries(purposes.map((purpose, index) => [purpose, deriveScramVerifier(material.passwords[purpose], Buffer.alloc(18, index + 1))]))
    const sql = buildGeneration6CredentialSql({ expiresAt, verifiers, nowMs })
    phase='JOURNAL_INTENT'
    intent = journal.recordIntent({ expiresAt, nowMs }); dispatchAttempted = true
    phase='DATABASE_DISPATCH'
    const receipt = validateGeneration6Receipt(await ports.dispatchDatabase(sql), expiresAt)
    phase='CONNECTION_VERIFICATION'
    await ports.verifyConnections({ passwords: projection.passwords, expiresAt })
    journal.transition(intent, 'RECEIPT_VALIDATED')
    return Object.freeze({ status: 'CREDENTIALS_VERIFIED_CONTROLS_DISABLED', target: PROJECT_REF, generation: GENERATION,
      windowId: WINDOW_ID, expiresAt, receipt, missingProviderCredentials: SHOPIFY_CREDENTIAL_DEPENDENCIES })
  } catch {
    let recovery = 'NOT_REQUIRED'
    if (dispatchAttempted) {
      try { await ports.recoverDatabase(); recovery = 'RECOVERY_VERIFIED' } catch { recovery = 'RECOVERY_REQUIRED' }
      try { journal.transition(intent, 'RECONCILIATION_REQUIRED') } catch { /* retained intent still forbids retry */ }
    }
    if (providerAttempted) {
      try { await ports.removeVercel(STAGED_VERCEL_NAMES) } catch { /* fixed failure result below */ }
      try { await ports.removeSupabase(GENERATED_SUPABASE_SECRET_NAMES) } catch { /* fixed failure result below */ }
    }
    return Object.freeze({ status: dispatchAttempted ? recovery : preflightPassed ? 'STOPPED_BEFORE_DATABASE' : 'ENTRY_BASELINE_FAILED', phase, target: PROJECT_REF,
      generation: GENERATION, windowId: WINDOW_ID, nextAction: dispatchAttempted ? 'NO_RETRY_RECONCILE' : preflightPassed ? 'REVIEW_PROVIDER_STAGING' : 'REVIEW_ENTRY_BASELINE' })
  } finally { eraseProjection(projection); eraseGeneration6Material(material) }
}

export async function runNativeGeneration6CredentialWindow() {
  if (!NATIVE_TRANSPORT_ENABLED) return Object.freeze({ status: 'NATIVE_TRANSPORT_DISABLED', target: PROJECT_REF, generation: GENERATION, windowId: WINDOW_ID })
  const [{ stageVercelSecrets,stageSupabaseSecrets,readbackProviderNames,removeVercelSecrets,removeSupabaseSecrets },
    { readSupabaseTokenFromKeychain,dispatchGeneration6Database,recoverGeneration6Database,verifyGeneration6EntryBaseline,verifyGeneration6ZeroSessions },
    { verifyGeneration6Connections },{ createStagingPostgresRuntime }]=await Promise.all([
      import('./staging-generation-6-provider-transport.mjs'),import('./staging-generation-6-database-transport.mjs'),
      import('./staging-generation-6-connection-verifier.mjs'),import('../lib/server/staging-postgres.ts')])
  const token=readSupabaseTokenFromKeychain()
  return executeGeneration6CredentialWindow({ports:{
    preflightDatabase:()=>verifyGeneration6EntryBaseline({token}),
    stageVercel:stageVercelSecrets,stageSupabase:stageSupabaseSecrets,readbackNames:readbackProviderNames,
    dispatchDatabase:sql=>dispatchGeneration6Database(sql,{token}),
    verifyConnections:async input=>{await verifyGeneration6Connections({...input,createRuntime:createStagingPostgresRuntime});await verifyGeneration6ZeroSessions({token})},
    recoverDatabase:()=>recoverGeneration6Database({token}),removeVercel:removeVercelSecrets,removeSupabase:removeSupabaseSecrets,
  }})
}
