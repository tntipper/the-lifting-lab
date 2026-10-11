import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveScramVerifier } from '../scripts/staging-generation-6-transport.mjs'
import {
  STAGING_GENERATION_23_PASSWORD_MATERIAL_ENABLED, GENERATION, PROJECT_REF,
  VERCEL_PASSWORD_NAMES, EDGE_PASSWORD_NAME, EDGE_READINESS_WINDOW_NAME, generateStagingGeneration23Passwords,
  eraseStagingGeneration23Passwords, projectStagingGeneration23Passwords,
  clearStagingGeneration23Projection, deriveStagingGeneration23Verifiers,
} from '../scripts/staging-generation-23-password-material.mjs'

const purposes = ['customer', 'cart', 'broker', 'provisional', 'bridge']
const fixture = () => { let byte = 1; return { randomBytes: size => Buffer.alloc(size, byte++) } }
const window = { expiresAt: '2026-09-27T22:00:00.000Z', now: () => Date.parse('2026-09-27T21:30:00.000Z') }

test('replacement scope is only five database passwords, with all host access off', () => {
  assert.equal(STAGING_GENERATION_23_PASSWORD_MATERIAL_ENABLED, false)
  assert.equal(GENERATION, 23)
  assert.equal(PROJECT_REF, 'qdmvngjwkcsilzmqksme')
  assert.deepEqual(VERCEL_PASSWORD_NAMES, purposes.map(
    purpose => `TLL_STAGING_${purpose.toUpperCase()}_DATABASE_PASSWORD`).sort())
  assert.equal(EDGE_PASSWORD_NAME, 'TLL_STAGING_BROKER_DATABASE_PASSWORD')
})

test('five distinct values project to Vercel and one equal broker Edge value, then erase', () => {
  const passwords = generateStagingGeneration23Passwords(fixture())
  const projection = projectStagingGeneration23Passwords(passwords, window)
  assert.deepEqual(Object.keys(projection.vercel).sort(), VERCEL_PASSWORD_NAMES)
  assert.deepEqual(Object.keys(projection.supabase), [EDGE_PASSWORD_NAME, EDGE_READINESS_WINDOW_NAME])
  assert.equal(projection.supabase[EDGE_PASSWORD_NAME], projection.vercel[EDGE_PASSWORD_NAME])
  assert.equal(new Set(Object.values(projection.vercel)).size, 5)
  clearStagingGeneration23Projection(projection)
  assert.equal(Object.values(projection.vercel).every(value => value === undefined), true)
  assert.equal(projection.supabase[EDGE_PASSWORD_NAME], undefined)
  eraseStagingGeneration23Passwords(passwords)
  assert.equal(Object.values(passwords).every(value => value.every(byte => byte === 0)), true)
})

test('partial and duplicate generation fail, wiping all owned buffers', () => {
  const owned = []
  assert.throws(() => generateStagingGeneration23Passwords({ randomBytes: size => {
    if (owned.length === 3) throw new Error('random source failed')
    const value = Buffer.alloc(size, owned.length + 1); owned.push(value); return value
  } }), /random source failed/)
  assert.equal(owned.every(value => value.every(byte => byte === 0)), true)
  const duplicates = []
  assert.throws(() => generateStagingGeneration23Passwords({ randomBytes: size => {
    const value = Buffer.alloc(size, 9); duplicates.push(value); return value
  } }), /unavailable/)
  assert.equal(duplicates.every(value => value.every(byte => byte === 0)), true)
  const wrongSize = Buffer.alloc(47, 7)
  assert.throws(() => generateStagingGeneration23Passwords({ randomBytes: () => wrongSize }), /unavailable/)
  assert.equal(wrongSize.every(byte => byte === 0), true)
})

test('verifiers derive from hosted password text and reject an Edge mismatch', () => {
  const passwords = generateStagingGeneration23Passwords(fixture())
  const projection = projectStagingGeneration23Passwords(passwords, window)
  let saltNo = 1
  const verifiers = deriveStagingGeneration23Verifiers(projection,
    { randomBytes: size => Buffer.alloc(size, saltNo++) })
  for (const [index, purpose] of purposes.entries()) {
    const hosted = projection.vercel[`TLL_STAGING_${purpose.toUpperCase()}_DATABASE_PASSWORD`]
    assert.equal(verifiers[purpose], deriveScramVerifier(hosted, Buffer.alloc(18, index + 1)))
    assert.notEqual(verifiers[purpose], deriveScramVerifier(Buffer.from(hosted, 'base64url'), Buffer.alloc(18, index + 1)))
  }
  projection.supabase[EDGE_PASSWORD_NAME] = 'different'
  assert.throws(() => deriveStagingGeneration23Verifiers(projection), /unavailable/)
  clearStagingGeneration23Projection(projection)
  eraseStagingGeneration23Passwords(passwords)
})
