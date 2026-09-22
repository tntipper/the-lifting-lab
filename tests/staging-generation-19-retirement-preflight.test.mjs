import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { EXPIRES_AT, FIXED_QUERY, GENERATION, OUTPUT, PRODUCTION_PROJECT_REF, PROJECT_REF, QUERY_ID, WINDOW_ID, validateResult } from '../scripts/staging-generation-19-retirement-preflight.mjs'

test('Gen19 retirement preflight is fixed, read-only, and checked in', () => {
  execFileSync(process.execPath, ['scripts/staging-generation-19-retirement-preflight.mjs', '--check'])
  assert.equal(readFileSync(OUTPUT, 'utf8'), FIXED_QUERY)
  assert.ok(FIXED_QUERY.startsWith('-- GENERATED'))
  assert.equal((FIXED_QUERY.match(/BEGIN READ ONLY;/g) ?? []).length, 1)
  assert.equal((FIXED_QUERY.match(/COMMIT;/g) ?? []).length, 1)
  assert.doesNotMatch(FIXED_QUERY, /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|COMMENT)\b/i)
  assert.match(FIXED_QUERY, new RegExp(PROJECT_REF))
  assert.match(FIXED_QUERY, new RegExp(PRODUCTION_PROJECT_REF))
  assert.match(FIXED_QUERY, new RegExp(WINDOW_ID))
  assert.match(FIXED_QUERY, new RegExp(EXPIRES_AT.replace(/[.]/g, '\\.')))
  assert.doesNotMatch(FIXED_QUERY.replace(EXPIRES_AT, ''), /expiresAt' IS DISTINCT FROM '2026-09-20T11:08:34\.000Z'/)
  assert.match(FIXED_QUERY, /marker_expiry>=clock_timestamp\(\)/)
  assert.match(FIXED_QUERY, /rolvaliduntil.*IS DISTINCT FROM 'infinity'::timestamptz/s)
  assert.match(FIXED_QUERY, /rolpassword IS NOT NULL/)
  assert.match(FIXED_QUERY, /pg_stat_activity/)
  assert.match(FIXED_QUERY, /runtime membership graph mismatch/)
  assert.match(FIXED_QUERY, /NOT e\.admin_option AND e\.inherit_option AND e\.set_option/)
  assert.equal((FIXED_QUERY.match(/NOT e\.admin_option AND e\.inherit_option AND e\.set_option/g) ?? []).length, 1, 'execution edges with ADMIN OPTION must fail the exact-active count')
  assert.match(FIXED_QUERY, /jsonb_typeof\(parsed->'generation'\) IS DISTINCT FROM 'number'/)
  assert.match(FIXED_QUERY, /direct or PUBLIC private authority detected/)
  assert.match(FIXED_QUERY, /a\.grantee=0 AND a\.privilege_type='USAGE'/)
  assert.ok(FIXED_QUERY.indexOf('AS tll_gen19_retirement_preflight;') < FIXED_QUERY.lastIndexOf('COMMIT;'), 'receipt must be read inside the read-only transaction')
  assert.match(FIXED_QUERY, /unexpected private work state/)
})

test('validator accepts only the compact aggregate exact-active receipt', () => {
  const workCounts = { shopifyProofs: { pending: 2 }, cartSessions: {}, cartOperations: { ready: 5 }, cartTransitions: {}, brokerFlows: {}, provisionalIntents: { held: 4, admitted: 3 }, bridgeGrants: { held: 1, pending_browser: 1, browser_admitted: 2 }, bridgeFinalizations: {}, accountOperations: {}, accountLogouts: 0 }
  const receipt = { queryId: QUERY_ID, projectRef: PROJECT_REF, generation: GENERATION, windowId: WINDOW_ID, status: 'PASS_EXACT_ACTIVE_DRIFT', credentialDrift: 'MARKER_EXPIRED_ROLE_UNBOUNDED', migrations: 15, runtimeRoles: 5, runtimeSessions: 0, controlsEnabled: 5, executionEdges: 5, operatorEdges: 5, workCounts }
  assert.equal(validateResult([{ tll_gen19_retirement_preflight: receipt }]).status, 'PASS')
  assert.throws(() => validateResult([{ tll_gen19_retirement_preflight: { ...receipt, runtimeSessions: 1 } }]))
  assert.throws(() => validateResult([{ tll_gen19_retirement_preflight: { ...receipt, unexpected: true } }]))
  assert.throws(() => validateResult([{ tll_gen19_retirement_preflight: { ...receipt, workCounts: { ...workCounts, accountLogouts: -1 } } }]))
})
