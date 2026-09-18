import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { ENDPOINT, FIXED_QUERY, KEYCHAIN_ACCOUNT, KEYCHAIN_SERVICE, NATIVE_ACCESS_APPROVED, PROJECT_REF, QUERY_ID, consumeNativeTokenOutput, nativeDesignReference, normalizeKeychainToken, runPreflightOnce, validateResult, validateSupabaseProfile } from '../scripts/staging-readonly-preflight.mjs'

const receipt = { queryId: QUERY_ID, projectRef: PROJECT_REF, environmentMarker: true, operator: { current: true, session: true, database: true, notSuperuser: true, createrole: true, readAll: true, writeAll: true, maintain: true }, migrations: { baselineCount: 10, forbiddenCount: 0 }, controls: { customer: true, cart: true, broker: true, provisional: true, bridge: true }, runtime: { roleCount: 5, loginCount: 0, passwordCount: 0, membershipCount: 0, sessionCount: 0, retiredMarkerCount: 5 }, absentObjects: { shopifyProofs: true, finalizations: true, cartTransitions: true, accountGenerations: true, accountLogouts: true } }

test('preflight is fixed to the intended staging project and remains disabled', () => {
  assert.equal(NATIVE_ACCESS_APPROVED, false)
  assert.equal(PROJECT_REF, 'qdmvngjwkcsilzmqksme')
  assert.deepEqual(ENDPOINT, { hostname: 'api.supabase.com', path: '/v1/projects/qdmvngjwkcsilzmqksme/database/query', method: 'POST' })
  assert.equal(KEYCHAIN_SERVICE, 'Supabase CLI'); assert.equal(KEYCHAIN_ACCOUNT, 'supabase')
  assert.ok(FIXED_QUERY.startsWith('BEGIN READ ONLY;\n')); assert.ok(FIXED_QUERY.endsWith('COMMIT;\n'))
  assert.match(FIXED_QUERY, /"generation":5/); assert.match(FIXED_QUERY, /forbiddenCount/)
  assert.match(FIXED_QUERY, /'notSuperuser',NOT coalesce/)
  assert.doesNotMatch(FIXED_QUERY, /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|COMMENT)\b/i)
})

test('only the exact compact receipt is accepted and redacted', () => {
  const result = validateResult([{ tll_staging_preflight: receipt }])
  assert.deepEqual(Object.keys(result).sort(), ['counts', 'queryId', 'receiptHash', 'status', 'target', 'timestamp'])
  assert.equal(result.status, 'PASS'); assert.equal(result.counts.runtimeSessions, 0)
  assert.throws(() => validateResult([{ tll_staging_preflight: { ...receipt, operator: { ...receipt.operator, notSuperuser: false } } }]))
  assert.throws(() => validateResult([{ tll_staging_preflight: { ...receipt, runtime: { ...receipt.runtime, sessionCount: 1 } } }]))
  assert.throws(() => validateResult([{ tll_staging_preflight: { ...receipt, unexpected: true } }]))
})

test('package has no mutation launcher dependency or caller-controlled dispatch fields', () => {
  const source = readFileSync('scripts/staging-readonly-preflight.mjs', 'utf8')
  assert.doesNotMatch(source, /activation-recovery|staging-account-activation-recovery|child_process.*launcher/i)
  assert.match(source, /process\.argv\[1\] === fileURLToPath\(import\.meta\.url\)/)
  assert.match(source, /agent:\s*false/)
  const output = execFileSync(process.execPath, ['scripts/staging-readonly-preflight.mjs'], { encoding: 'utf8' })
  assert.deepEqual(JSON.parse(output), { status: 'NATIVE_ACCESS_DISABLED', target: PROJECT_REF, queryId: QUERY_ID })
})

test('reviewed native Keychain design is hash-pinned without enabling it', () => {
  const reference = nativeDesignReference()
  execFileSync(process.execPath, ['scripts/staging-readonly-preflight-manifest.mjs', '--check'], { stdio: 'pipe' })
  const manifest = JSON.parse(readFileSync('config/staging-readonly-preflight-manifest.json', 'utf8'))
  assert.equal(reference.service, 'Supabase CLI'); assert.equal(reference.account, 'supabase')
  assert.match(reference.sha256, /^[a-f0-9]{64}$/)
  assert.equal(manifest.nativeAccessApproved, false)
  assert.equal(manifest.target, PROJECT_REF)
  assert.equal(manifest.schema, 'tll-staging-readonly-preflight/v2')
  assert.equal(manifest.keychain.reviewedDesignSha256, reference.sha256)
  assert.equal(manifest.transport.maxRequests, 1)
  assert.equal(manifest.query.id, QUERY_ID)
  assert.match(manifest.query.sha256, /^[a-f0-9]{64}$/)
  assert.deepEqual(manifest.sourcePins.map(pin => pin.path), ['scripts/staging-readonly-preflight.mjs', 'scripts/staging-readonly-preflight-keychain.py'])
})

test('profile absence is permitted but every present profile must be exact', () => {
  assert.doesNotThrow(() => validateSupabaseProfile(undefined))
  assert.doesNotThrow(() => validateSupabaseProfile('supabase\n'))
  assert.throws(() => validateSupabaseProfile('other'))
})

test('native helper uses one exact Keychain item and the Node parent redacts and wipes output', () => {
  const helper = readFileSync('scripts/staging-readonly-preflight-keychain.py', 'utf8')
  assert.match(helper, /SecItemCopyMatching/)
  assert.match(helper, /kSecAttrService.*kSecAttrAccount.*kSecMatchLimit.*kSecReturnData/)
  assert.match(helper, /kSecMatchLimitOne/)
  assert.match(helper, /base64\.b64decode\([^\n]+validate=True\)/)
  assert.doesNotMatch(helper, /SecItem(?:Add|Update|Delete)|find-generic-password|security\s+find/i)
  const stdout = Buffer.from(`sbp_${'a'.repeat(40)}\n`), stderr = Buffer.from('')
  assert.equal(consumeNativeTokenOutput({ status: 0, stdout, stderr }), `sbp_${'a'.repeat(40)}`)
  assert.ok(stdout.every(byte => byte === 0)); assert.ok(stderr.every(byte => byte === 0))
  const rejected = Buffer.from('untrusted')
  assert.throws(() => consumeNativeTokenOutput({ status: 0, stdout: rejected, stderr: Buffer.from('') }))
  assert.ok(rejected.every(byte => byte === 0))
})

test('strictly normalizes the audited go-keyring base64 representation', () => {
  const token = `sbp_${'a'.repeat(40)}`
  const encoded = Buffer.from(token, 'utf8').toString('base64')
  assert.equal(normalizeKeychainToken(`go-keyring-base64:${encoded}`), token)
  assert.throws(() => normalizeKeychainToken('go-keyring-base64:not base64'))
  assert.throws(() => normalizeKeychainToken(`go-keyring-base64:${Buffer.from('wrong').toString('base64')}`))
})

test('disabled run path performs zero native reads and zero management requests', async () => {
  let reads = 0, requests = 0
  const result = await runPreflightOnce({ readToken: () => { reads += 1; return 'unreachable' }, post: async () => { requests += 1 }, now: () => 1 })
  assert.deepEqual(result, { status: 'NATIVE_ACCESS_DISABLED', target: PROJECT_REF, queryId: QUERY_ID })
  assert.equal(reads, 0); assert.equal(requests, 0)
  const source = readFileSync('scripts/staging-readonly-preflight.mjs', 'utf8')
  assert.match(source, /if \(!NATIVE_ACCESS_APPROVED\) return Object\.freeze/)
  assert.match(source, /const deadline = now\(\) \+ MAX_AGE_MS\n  const token = readToken\(\)\n  try \{ return await post\(token, deadline\)/)
  assert.match(source, /status: 'UNAVAILABLE', target: PROJECT_REF, queryId: QUERY_ID/)
  assert.match(source, /request\?\.destroy\(\); finish\(new Error\('timeout'\)\)/)
  assert.match(source, /response\.on\('aborted'/)
  assert.match(source, /const wipeChunks = \(\) =>/)
})
