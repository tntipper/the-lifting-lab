/** Offline-only replacement material for the five retired Generation 22 logins. */
import { randomBytes as systemRandomBytes } from 'node:crypto'
import { STAGING_PROJECT_REF } from './staging-provider-broker-rotation.mjs'
import { PASSWORD_PURPOSES } from './staging-generation-22-material.mjs'
import { deriveScramVerifier } from './staging-generation-6-transport.mjs'

export const OWNER_SUCCESSOR_NATIVE_PASSWORD_MATERIAL_ENABLED = false
export const GENERATION = 23
export const PROJECT_REF = STAGING_PROJECT_REF
export const VERCEL_PASSWORD_NAMES = Object.freeze(PASSWORD_PURPOSES.map(
  purpose => `TLL_STAGING_${purpose.toUpperCase()}_DATABASE_PASSWORD`).sort())
export const EDGE_PASSWORD_NAME = 'TLL_STAGING_BROKER_DATABASE_PASSWORD'
export const EDGE_READINESS_WINDOW_NAME = 'TLL_STAGING_BROKER_READINESS_WINDOW'
export { WINDOW_ID as READINESS_WINDOW_ID } from './staging-owner-successor-sql-context.mjs'
import { WINDOW_ID as READINESS_WINDOW_ID, ACTIVE_WINDOW_STARTED_AT, assertOwnerSuccessorSetupClock } from './staging-owner-successor-sql-context.mjs'
const unavailable = () => { throw new Error('Staging generation 23 password material unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

/** The caller owns these buffers and must erase them at the end of one window. */
export function generateStagingGeneration23Passwords({ randomBytes = systemRandomBytes } = {}) {
  if (typeof randomBytes !== 'function') unavailable()
  const owned = []
  let complete = false
  try {
    for (let index = 0; index < PASSWORD_PURPOSES.length; index++) {
      const value = randomBytes(48)
      if (!Buffer.isBuffer(value) || value.length !== 48) {
        if (Buffer.isBuffer(value)) value.fill(0)
        unavailable()
      }
      owned.push(value)
    }
    if (new Set(owned.map(value => value.toString('hex'))).size !== PASSWORD_PURPOSES.length) unavailable()
    complete = true
    return Object.fromEntries(PASSWORD_PURPOSES.map((purpose, index) => [purpose, owned[index]]))
  } finally { if (!complete) for (const value of owned) value.fill(0) }
}

export function eraseStagingGeneration23Passwords(passwords) {
  if (!passwords || typeof passwords !== 'object') return
  for (const value of Object.values(passwords)) if (Buffer.isBuffer(value)) value.fill(0)
}

/** Projection stays in memory; no vault, cart or Shopify client material is changed. */
export function projectStagingGeneration23Passwords(passwords, { expiresAt, now = Date.now } = {}) {
  if (!exact(passwords, PASSWORD_PURPOSES)) unavailable()
  const end = Date.parse(expiresAt), current = now()
  if (typeof expiresAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(expiresAt)
    || !Number.isFinite(current) || !Number.isFinite(end) || end <= current || end - current > 3_600_000) unavailable()
  const buffers = Object.values(passwords)
  if (buffers.some(value => !Buffer.isBuffer(value) || value.length !== 48)
    || new Set(buffers.map(value => value.toString('hex'))).size !== PASSWORD_PURPOSES.length) unavailable()
  const vercel = Object.fromEntries(PASSWORD_PURPOSES.map(purpose => [
    `TLL_STAGING_${purpose.toUpperCase()}_DATABASE_PASSWORD`, passwords[purpose].toString('base64url'),
  ]))
  if (!exact(vercel, VERCEL_PASSWORD_NAMES)) unavailable()
  assertOwnerSuccessorSetupClock(expiresAt, current)
  const startsAt = ACTIVE_WINDOW_STARTED_AT
  return { vercel, supabase: { [EDGE_PASSWORD_NAME]: vercel[EDGE_PASSWORD_NAME],
    [EDGE_READINESS_WINDOW_NAME]: `${READINESS_WINDOW_ID}|${startsAt}|${expiresAt}` } }
}

export function clearStagingGeneration23Projection(projection) {
  for (const group of [projection?.vercel, projection?.supabase]) {
    if (!group || typeof group !== 'object') continue
    for (const key of Object.keys(group)) group[key] = undefined
  }
}

/** Database verifiers must correspond to the exact text sent to the hosts. */
export function deriveStagingGeneration23Verifiers(projection, { randomBytes = systemRandomBytes } = {}) {
  if (!projection || !exact(projection.vercel, VERCEL_PASSWORD_NAMES)
    || !exact(projection.supabase, [EDGE_PASSWORD_NAME, EDGE_READINESS_WINDOW_NAME]) || typeof randomBytes !== 'function') unavailable()
  const values = Object.values(projection.vercel)
  if (values.some(value => typeof value !== 'string' || !/^[A-Za-z0-9_-]{64}$/.test(value))
    || new Set(values).size !== PASSWORD_PURPOSES.length
    || projection.supabase[EDGE_PASSWORD_NAME] !== projection.vercel[EDGE_PASSWORD_NAME]
    || typeof projection.supabase[EDGE_READINESS_WINDOW_NAME] !== 'string'
    || !projection.supabase[EDGE_READINESS_WINDOW_NAME].startsWith(`${READINESS_WINDOW_ID}|`)) unavailable()
  return Object.fromEntries(PASSWORD_PURPOSES.map(purpose => {
    const salt = randomBytes(18)
    if (!Buffer.isBuffer(salt) || salt.length !== 18) {
      if (Buffer.isBuffer(salt)) salt.fill(0)
      unavailable()
    }
    try { return [purpose, deriveScramVerifier(
      projection.vercel[`TLL_STAGING_${purpose.toUpperCase()}_DATABASE_PASSWORD`], salt)] }
    finally { salt.fill(0) }
  }))
}
