/** Disabled, offline-only material for the 16 missing staging credentials. */
import { randomBytes as systemRandomBytes, randomUUID as systemRandomUUID } from 'node:crypto'
import { STAGING_PROJECT_REF } from './staging-provider-broker-rotation.mjs'
import { deriveScramVerifier } from './staging-generation-6-transport.mjs'

export const STAGING_GENERATION_22_MATERIAL_ENABLED = false
export const GENERATION = 22
export const PROJECT_REF = STAGING_PROJECT_REF
export const PASSWORD_PURPOSES = Object.freeze(['customer', 'cart', 'broker', 'provisional', 'bridge'])
export const VAULT_PURPOSES = Object.freeze(['TOKEN', 'PROVISIONAL', 'COOKIE', 'FINAL'])
export const MISSING_VERCEL_SECRET_NAMES = Object.freeze([
  ...PASSWORD_PURPOSES.map(purpose => `TLL_STAGING_${purpose.toUpperCase()}_DATABASE_PASSWORD`),
  ...VAULT_PURPOSES.flatMap(purpose => [
    `TLL_STAGING_CUSTOMER_${purpose}_VAULT_KEY_ID`,
    `TLL_STAGING_CUSTOMER_${purpose}_VAULT_KEY_HEX`,
  ]),
  'TLL_STAGING_CART_VAULT_KEY_ID',
  'TLL_STAGING_CART_VAULT_KEY_HEX',
  'TLL_STAGING_CART_HMAC_KEY_HEX',
].sort())
export const MISSING_SUPABASE_SECRET_NAMES = Object.freeze(['TLL_STAGING_BROKER_DATABASE_PASSWORD'])
export const DISABLED_VERCEL_CONFIGURATION = Object.freeze({
  TLL_STAGING_CUSTOMER_ENABLED: 'false',
  TLL_STAGING_CART_ENABLED: 'false',
  NEXT_PUBLIC_TLL_STAGING_CUSTOMER: 'disabled',
  NEXT_PUBLIC_TLL_STAGING_CART: 'disabled',
})
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const unavailable = () => { throw new Error('Staging generation 22 material unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

/** Caller owns all returned Buffers and must erase them after one window. */
export function generateStagingGeneration22Material({ randomBytes = systemRandomBytes,
  randomUUID = systemRandomUUID } = {}) {
  if (typeof randomBytes !== 'function' || typeof randomUUID !== 'function') unavailable()
  const owned = []
  const take = size => {
    const value = randomBytes(size)
    if (!Buffer.isBuffer(value) || value.length !== size) unavailable()
    owned.push(value)
    return value
  }
  const id = () => {
    const value = randomUUID()
    if (typeof value !== 'string' || !UUID.test(value)) unavailable()
    return value
  }
  let complete = false
  try {
    const passwords = Object.fromEntries(PASSWORD_PURPOSES.map(purpose => [purpose, take(48)]))
    const customerVaults = Object.fromEntries(VAULT_PURPOSES.map(purpose => [purpose, {
      id: id(), key: take(32),
    }]))
    const cartVault = { id: id(), key: take(32) }
    const cartHmac = take(32)
    const ids = [...Object.values(customerVaults).map(vault => vault.id), cartVault.id]
    if (new Set(ids).size !== ids.length || new Set(owned.map(value => value.toString('hex'))).size !== owned.length) unavailable()
    complete = true
    return { passwords, customerVaults, cartVault, cartHmac }
  } finally { if (!complete) for (const value of owned) value.fill(0) }
}

export function eraseStagingGeneration22Material(material) {
  if (!material || typeof material !== 'object') return
  for (const value of Object.values(material.passwords ?? {})) if (Buffer.isBuffer(value)) value.fill(0)
  for (const vault of Object.values(material.customerVaults ?? {})) if (Buffer.isBuffer(vault?.key)) vault.key.fill(0)
  if (Buffer.isBuffer(material.cartVault?.key)) material.cartVault.key.fill(0)
  if (Buffer.isBuffer(material.cartHmac)) material.cartHmac.fill(0)
}

/** Projection stays in this process; the caller must clear references after dispatch. */
export function projectStagingGeneration22Material(material) {
  if (!material || !exact(material.passwords, PASSWORD_PURPOSES)
    || !exact(material.customerVaults, VAULT_PURPOSES)
    || !exact(material.cartVault, ['id', 'key']) || !Buffer.isBuffer(material.cartHmac)
    || material.cartHmac.length !== 32) unavailable()
  const buffers = [...Object.values(material.passwords), ...Object.values(material.customerVaults).map(vault => vault?.key),
    material.cartVault.key, material.cartHmac]
  if (Object.values(material.passwords).some(value => !Buffer.isBuffer(value) || value.length !== 48)
    || Object.values(material.customerVaults).some(value => !value || !UUID.test(value.id)
      || !Buffer.isBuffer(value.key) || value.key.length !== 32)
    || !UUID.test(material.cartVault.id) || !Buffer.isBuffer(material.cartVault.key) || material.cartVault.key.length !== 32
    || new Set(buffers.map(value => value.toString('hex'))).size !== buffers.length) unavailable()
  const vercel = {}
  for (const purpose of PASSWORD_PURPOSES) vercel[`TLL_STAGING_${purpose.toUpperCase()}_DATABASE_PASSWORD`] =
    material.passwords[purpose].toString('base64url')
  for (const purpose of VAULT_PURPOSES) {
    vercel[`TLL_STAGING_CUSTOMER_${purpose}_VAULT_KEY_ID`] = material.customerVaults[purpose].id
    vercel[`TLL_STAGING_CUSTOMER_${purpose}_VAULT_KEY_HEX`] = material.customerVaults[purpose].key.toString('hex')
  }
  vercel.TLL_STAGING_CART_VAULT_KEY_ID = material.cartVault.id
  vercel.TLL_STAGING_CART_VAULT_KEY_HEX = material.cartVault.key.toString('hex')
  vercel.TLL_STAGING_CART_HMAC_KEY_HEX = material.cartHmac.toString('hex')
  if (!exact(vercel, MISSING_VERCEL_SECRET_NAMES)) unavailable()
  const supabase = { TLL_STAGING_BROKER_DATABASE_PASSWORD: vercel.TLL_STAGING_BROKER_DATABASE_PASSWORD }
  return { vercel, supabase }
}

export function clearStagingGeneration22Projection(projection) {
  if (!projection || typeof projection !== 'object') return
  for (const group of [projection.vercel, projection.supabase]) {
    if (!group || typeof group !== 'object') continue
    for (const key of Object.keys(group)) group[key] = undefined
  }
}

/** Derive database checks from the exact encoded passwords sent to Vercel. */
export function deriveStagingGeneration22Verifiers(projection, { randomBytes = systemRandomBytes } = {}) {
  if (!projection || !exact(projection.vercel, MISSING_VERCEL_SECRET_NAMES)
    || !exact(projection.supabase, MISSING_SUPABASE_SECRET_NAMES)
    || typeof randomBytes !== 'function') unavailable()
  const verifiers = {}
  for (const purpose of PASSWORD_PURPOSES) {
    const name = `TLL_STAGING_${purpose.toUpperCase()}_DATABASE_PASSWORD`
    const password = projection.vercel[name]
    if (typeof password !== 'string' || !/^[A-Za-z0-9_-]{64}$/.test(password)
      || (purpose === 'broker' && projection.supabase.TLL_STAGING_BROKER_DATABASE_PASSWORD !== password)) unavailable()
    const salt = randomBytes(18)
    if (!Buffer.isBuffer(salt) || salt.length !== 18) unavailable()
    try { verifiers[purpose] = deriveScramVerifier(password, salt) }
    finally { salt.fill(0) }
  }
  return verifiers
}
