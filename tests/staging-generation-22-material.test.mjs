import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  STAGING_GENERATION_22_MATERIAL_ENABLED, GENERATION, PROJECT_REF, MISSING_VERCEL_SECRET_NAMES,
  MISSING_SUPABASE_SECRET_NAMES, DISABLED_VERCEL_CONFIGURATION,
  generateStagingGeneration22Material, eraseStagingGeneration22Material,
  projectStagingGeneration22Material, clearStagingGeneration22Projection,
  deriveStagingGeneration22Verifiers,
} from '../scripts/staging-generation-22-material.mjs'
import { deriveScramVerifier } from '../scripts/staging-generation-6-transport.mjs'

const expected = [
  'TLL_STAGING_BRIDGE_DATABASE_PASSWORD', 'TLL_STAGING_BROKER_DATABASE_PASSWORD',
  'TLL_STAGING_CART_DATABASE_PASSWORD', 'TLL_STAGING_CART_HMAC_KEY_HEX',
  'TLL_STAGING_CART_VAULT_KEY_HEX', 'TLL_STAGING_CART_VAULT_KEY_ID',
  'TLL_STAGING_CUSTOMER_COOKIE_VAULT_KEY_HEX', 'TLL_STAGING_CUSTOMER_COOKIE_VAULT_KEY_ID',
  'TLL_STAGING_CUSTOMER_DATABASE_PASSWORD',
  'TLL_STAGING_CUSTOMER_FINAL_VAULT_KEY_HEX', 'TLL_STAGING_CUSTOMER_FINAL_VAULT_KEY_ID',
  'TLL_STAGING_CUSTOMER_PROVISIONAL_VAULT_KEY_HEX', 'TLL_STAGING_CUSTOMER_PROVISIONAL_VAULT_KEY_ID',
  'TLL_STAGING_CUSTOMER_TOKEN_VAULT_KEY_HEX', 'TLL_STAGING_CUSTOMER_TOKEN_VAULT_KEY_ID',
  'TLL_STAGING_PROVISIONAL_DATABASE_PASSWORD',
].sort()
const fixture = () => {
  let byte = 1, id = 1
  return {
    randomBytes: size => Buffer.alloc(size, byte++),
    randomUUID: () => `00000000-0000-4000-8000-${String(id++).padStart(12, '0')}`,
  }
}

test('successor set equals the observed 16 missing names and preserves broker client secret', () => {
  assert.equal(STAGING_GENERATION_22_MATERIAL_ENABLED, false)
  assert.equal(GENERATION, 22)
  assert.equal(PROJECT_REF, 'qdmvngjwkcsilzmqksme')
  assert.deepEqual(MISSING_VERCEL_SECRET_NAMES, expected)
  assert.deepEqual(MISSING_SUPABASE_SECRET_NAMES, ['TLL_STAGING_BROKER_DATABASE_PASSWORD'])
  assert.equal(MISSING_VERCEL_SECRET_NAMES.includes('TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET'), false)
  assert.deepEqual(DISABLED_VERCEL_CONFIGURATION, {
    TLL_STAGING_CUSTOMER_ENABLED: 'false', TLL_STAGING_CART_ENABLED: 'false',
    NEXT_PUBLIC_TLL_STAGING_CUSTOMER: 'disabled', NEXT_PUBLIC_TLL_STAGING_CART: 'disabled',
  })
})

test('generated staging values are distinct; Supabase broker password matches Vercel and can be erased', () => {
  const material = generateStagingGeneration22Material(fixture())
  const buffers = [...Object.values(material.passwords), ...Object.values(material.customerVaults).map(vault => vault.key),
    material.cartVault.key, material.cartHmac]
  const projected = projectStagingGeneration22Material(material)
  assert.deepEqual(Object.keys(projected.vercel).sort(), expected)
  assert.deepEqual(Object.keys(projected.supabase), MISSING_SUPABASE_SECRET_NAMES)
  assert.equal(projected.supabase.TLL_STAGING_BROKER_DATABASE_PASSWORD,
    projected.vercel.TLL_STAGING_BROKER_DATABASE_PASSWORD)
  assert.equal(new Set(Object.values(projected.vercel)).size, 16)
  assert.equal(projected.vercel.TLL_STAGING_CART_HMAC_KEY_HEX.length, 64)
  clearStagingGeneration22Projection(projected)
  assert.equal(Object.values(projected.vercel).every(value => value === undefined), true)
  assert.equal(Object.values(projected.supabase).every(value => value === undefined), true)
  eraseStagingGeneration22Material(material)
  assert.equal(buffers.every(buffer => buffer.every(byte => byte === 0)), true)
})

test('invalid duplicate material fails and wipes every generated buffer', () => {
  const buffers = []
  assert.throws(() => generateStagingGeneration22Material({
    randomBytes: size => { const value = Buffer.alloc(size, 9); buffers.push(value); return value },
    randomUUID: fixture().randomUUID,
  }), /unavailable/)
  assert.equal(buffers.every(buffer => buffer.every(byte => byte === 0)), true)
})

test('duplicate vault identifiers fail and wipe material', () => {
  const buffers = []
  assert.throws(() => generateStagingGeneration22Material({
    randomBytes: size => { const value = Buffer.alloc(size, buffers.length + 1); buffers.push(value); return value },
    randomUUID: () => '00000000-0000-4000-8000-000000000001',
  }), /unavailable/)
  assert.equal(buffers.every(buffer => buffer.every(byte => byte === 0)), true)
})

test('database verifiers derive from the exact hosted password text', () => {
  const material = generateStagingGeneration22Material(fixture())
  const projected = projectStagingGeneration22Material(material)
  let saltNo = 1
  const verifiers = deriveStagingGeneration22Verifiers(projected,
    { randomBytes: size => Buffer.alloc(size, saltNo++) })
  for (const [index, purpose] of ['customer', 'cart', 'broker', 'provisional', 'bridge'].entries()) {
    const hostedPassword = projected.vercel[`TLL_STAGING_${purpose.toUpperCase()}_DATABASE_PASSWORD`]
    assert.equal(verifiers[purpose], deriveScramVerifier(hostedPassword, Buffer.alloc(18, index + 1)))
    assert.notEqual(verifiers[purpose], deriveScramVerifier(Buffer.from(hostedPassword, 'base64url'), Buffer.alloc(18, index + 1)))
  }
  projected.supabase.TLL_STAGING_BROKER_DATABASE_PASSWORD = 'different'
  assert.throws(() => deriveStagingGeneration22Verifiers(projected), /unavailable/)
  clearStagingGeneration22Projection(projected)
  eraseStagingGeneration22Material(material)
})
