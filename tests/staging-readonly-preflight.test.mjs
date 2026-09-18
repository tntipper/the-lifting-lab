import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { ENDPOINT, FIXED_QUERY, KEYCHAIN_ACCOUNT, KEYCHAIN_SERVICE, NATIVE_ACCESS_APPROVED, PROJECT_REF, QUERY_ID, nativeDesignReference, validateResult } from '../scripts/staging-readonly-preflight.mjs'

const receipt = { queryId: QUERY_ID, projectRef: PROJECT_REF, environmentMarker: true, operator: { current: true, session: true, database: true, superuser: true, createrole: true, readAll: true, writeAll: true, maintain: true }, migrations: { baselineCount: 10, forbiddenCount: 0 }, controls: { customer: true, cart: true, broker: true, provisional: true, bridge: true }, runtime: { roleCount: 5, loginCount: 0, passwordCount: 0, membershipCount: 0, sessionCount: 0, retiredMarkerCount: 5 }, absentObjects: { shopifyProofs: true, finalizations: true, cartTransitions: true, accountGenerations: true, accountLogouts: true } }

test('preflight is fixed to the intended staging project and remains disabled', () => {
  assert.equal(NATIVE_ACCESS_APPROVED, false)
  assert.equal(PROJECT_REF, 'qdmvngjwkcsilzmqksme')
  assert.deepEqual(ENDPOINT, { hostname: 'api.supabase.com', path: '/v1/projects/qdmvngjwkcsilzmqksme/database/query', method: 'POST' })
  assert.equal(KEYCHAIN_SERVICE, 'Supabase CLI'); assert.equal(KEYCHAIN_ACCOUNT, 'supabase')
  assert.ok(FIXED_QUERY.startsWith('BEGIN READ ONLY;\n')); assert.ok(FIXED_QUERY.endsWith('COMMIT;\n'))
  assert.match(FIXED_QUERY, /"generation":5/); assert.match(FIXED_QUERY, /forbiddenCount/)
  assert.doesNotMatch(FIXED_QUERY, /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|COMMENT)\b/i)
})

test('only the exact compact receipt is accepted and redacted', () => {
  const result = validateResult([{ tll_staging_preflight: receipt }])
  assert.deepEqual(Object.keys(result).sort(), ['counts', 'queryId', 'receiptHash', 'status', 'target', 'timestamp'])
  assert.equal(result.status, 'PASS'); assert.equal(result.counts.runtimeSessions, 0)
  assert.throws(() => validateResult([{ tll_staging_preflight: { ...receipt, runtime: { ...receipt.runtime, sessionCount: 1 } } }]))
  assert.throws(() => validateResult([{ tll_staging_preflight: { ...receipt, unexpected: true } }]))
})

test('package has no mutation launcher dependency or caller-controlled dispatch fields', () => {
  const source = readFileSync('scripts/staging-readonly-preflight.mjs', 'utf8')
  assert.doesNotMatch(source, /activation-recovery|staging-account-activation-recovery|child_process.*launcher/i)
  assert.match(source, /process\.argv\[1\] === fileURLToPath\(import\.meta\.url\)/)
  assert.match(source, /agent:\s*false/)
  const output = execFileSync(process.execPath, ['scripts/staging-readonly-preflight.mjs'], { encoding: 'utf8' })
  assert.deepEqual(Object.keys(JSON.parse(output)).sort(), ['nativeDesign', 'queryId', 'status', 'target'])
})

test('reviewed native Keychain design is hash-pinned without enabling it', () => {
  const reference = nativeDesignReference()
  const manifest = JSON.parse(readFileSync('config/staging-readonly-preflight-manifest.json', 'utf8'))
  assert.equal(reference.service, 'Supabase CLI'); assert.equal(reference.account, 'supabase')
  assert.match(reference.sha256, /^[a-f0-9]{64}$/)
  assert.equal(manifest.nativeAccessApproved, false)
  assert.equal(manifest.target, PROJECT_REF)
  assert.equal(manifest.keychain.reviewedDesignSha256, reference.sha256)
  assert.equal(manifest.transport.maxRequests, 1)
})
