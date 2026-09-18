import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { ENDPOINT, EXPECTED_RECEIPT, FIXED_QUERY, KEYCHAIN_ACCOUNT, KEYCHAIN_SERVICE, NATIVE_ACCESS_APPROVED, NATIVE_HELPER_TIMEOUT_MS, PROJECT_REF, QUERY_ID, consumeNativeTokenOutput, nativeDesignReference, normalizeKeychainToken, runPreflightOnce, validateResult, validateSupabaseProfile } from '../scripts/staging-readonly-preflight.mjs'

const receipt = EXPECTED_RECEIPT

test('preflight is fixed to the intended staging project and remains disabled', () => {
  assert.equal(NATIVE_ACCESS_APPROVED, false)
  assert.equal(NATIVE_HELPER_TIMEOUT_MS, 15_000)
  assert.equal(PROJECT_REF, 'qdmvngjwkcsilzmqksme')
  assert.deepEqual(ENDPOINT, { hostname: 'api.supabase.com', path: '/v1/projects/qdmvngjwkcsilzmqksme/database/query', method: 'POST' })
  assert.equal(KEYCHAIN_SERVICE, 'Supabase CLI'); assert.equal(KEYCHAIN_ACCOUNT, 'supabase')
  assert.ok(FIXED_QUERY.startsWith('BEGIN READ ONLY;\n'))
  assert.equal((FIXED_QUERY.match(/BEGIN READ ONLY;/g) ?? []).length, 1)
  assert.equal((FIXED_QUERY.match(/COMMIT;/g) ?? []).length, 1)
  assert.equal((FIXED_QUERY.match(/AS tll_staging_preflight;/g) ?? []).length, 1)
  const [assertionPhase, finalReceipt] = FIXED_QUERY.split('COMMIT;\n')
  assert.equal(FIXED_QUERY.split('COMMIT;\n').length, 2)
  assert.match(assertionPhase, /DO \$tll_preflight\$/)
  assert.match(assertionPhase, /IF observed IS DISTINCT FROM/)
  assert.match(assertionPhase, /RAISE EXCEPTION 'staging preflight assertion failed'/)
  for (const reference of ['jsonb_build_object', 'tll_staging_private.environment', 'tll_staging_private.applied_migrations', 'tll_customer_private.operator_status', 'tll_cart_private.control', 'tll_broker_private.operator_status', 'tll_provisional_private.operator_status', 'tll_bridge_private.operator_status', 'pg_roles', 'pg_authid', 'pg_auth_members', 'pg_stat_activity', 'to_regclass']) {
    assert.ok(assertionPhase.includes(reference), `${reference} must be asserted before COMMIT`)
    assert.equal(finalReceipt.includes(reference), false, `${reference} must not appear in the final receipt`)
  }
  assert.equal(finalReceipt, `SELECT '${JSON.stringify(EXPECTED_RECEIPT)}'::jsonb AS tll_staging_preflight;\n`)
  assert.doesNotMatch(finalReceipt, /\b(?:FROM|SELECT\s+\w+\s*\(|jsonb_build_object|to_regclass|pg_)\b/i)
  assert.match(FIXED_QUERY, /"generation":5/); assert.match(FIXED_QUERY, /forbiddenCount/)
  assert.match(FIXED_QUERY, /'notSuperuser',NOT coalesce/)
  assert.match(FIXED_QUERY, /baselinePairCount/); assert.match(FIXED_QUERY, /retiredOperatorEdgeCount/)
  assert.doesNotMatch(FIXED_QUERY, /grantor\.rolname='postgres'/, 'the retirement edge is role-to-operator; PostgreSQL cannot grant ADMIN back to the same grantor/member')
  assert.doesNotMatch(FIXED_QUERY, /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|COMMENT)\b/i)
})

test('only the exact compact receipt is accepted and redacted', () => {
  const result = validateResult([{ tll_staging_preflight: receipt }])
  assert.deepEqual(Object.keys(result).sort(), ['counts', 'queryId', 'receiptHash', 'status', 'target', 'timestamp'])
  assert.equal(result.status, 'PASS'); assert.equal(result.counts.runtimeSessions, 0)
  assert.throws(() => validateResult([{ tll_staging_preflight: { ...receipt, operator: { ...receipt.operator, notSuperuser: false } } }]))
  assert.throws(() => validateResult([{ tll_staging_preflight: { ...receipt, runtime: { ...receipt.runtime, sessionCount: 1 } } }]))
  assert.throws(() => validateResult([{ tll_staging_preflight: { ...receipt, migrations: { ...receipt.migrations, totalCount: 11 } } }]))
  assert.throws(() => validateResult([{ tll_staging_preflight: { ...receipt, runtime: { ...receipt.runtime, edgeCount: 6 } } }]))
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
  assert.equal(manifest.schema, 'tll-staging-readonly-preflight/v4')
  assert.equal(manifest.keychain.reviewedDesignSha256, reference.sha256)
  assert.equal(manifest.transport.maxRequests, 1)
  assert.equal(manifest.query.id, QUERY_ID)
  assert.equal(manifest.query.assertionsInReadOnlyTransaction, true)
  assert.equal(manifest.query.finalStatementLiteralReceipt, true)
  assert.match(manifest.query.sha256, /^[a-f0-9]{64}$/)
  assert.deepEqual(manifest.sourcePins.map(pin => pin.path), ['scripts/staging-readonly-preflight.mjs', 'scripts/staging-readonly-preflight-keychain.py'])
  assert.match(readFileSync('scripts/staging-readonly-preflight-manifest.mjs', 'utf8'), /native access flags disagree/)
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
  assert.match(source, /const deadline = now\(\) \+ MAX_AGE_MS\n  let token\n  try \{ token = readToken\(\) \}/)
  assert.match(source, /status: 'PRE_DISPATCH_UNAVAILABLE', target: PROJECT_REF, queryId: QUERY_ID/)
  assert.match(source, /request\?\.destroy\(\); finish\(new Error\('timeout'\)\)/)
  assert.match(source, /response\.on\('aborted'/)
  assert.match(source, /const wipeChunks = \(\) =>/)
  for (const key of ['NODE_DEBUG', 'NODE_DEBUG_NATIVE', 'NODE_OPTIONS', 'SSLKEYLOGFILE', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'OPENSSL_CONF', 'OPENSSL_MODULES']) assert.match(source, new RegExp(`'${key}'`))
})

test('enabled-path outcome handling distinguishes pre-dispatch token failure from uncertain post-dispatch failures without retrying', async () => {
  // Native access remains disabled on disk. This in-memory module copy covers
  // the enabled-path boundary with injected ports only: it opens neither
  // Keychain nor a network socket.
  const source = readFileSync('scripts/staging-readonly-preflight.mjs', 'utf8')
  const enabledSource = source
    .replace('export const NATIVE_ACCESS_APPROVED = false', 'export const NATIVE_ACCESS_APPROVED = true')
    .replace('if (process.argv[1] === fileURLToPath(import.meta.url)) {', 'if (false) {')
  const enabled = await import(`data:text/javascript;base64,${Buffer.from(enabledSource).toString('base64')}`)
  assert.match(source, /try \{ token = readToken\(\) \} catch \{ return Object\.freeze\(\{ status: 'PRE_DISPATCH_UNAVAILABLE'/)
  assert.match(source, /status: 'UNCERTAIN_POST_DISPATCH'.*nextAction: 'MANUAL_REVIEW_REQUIRED'/s)
  let posts = 0
  const keychainFailure = await enabled.runPreflightOnce({
    readToken: () => { throw new Error('Keychain denied') },
    post: async () => { posts += 1 },
    now: () => 1,
  })
  assert.deepEqual(keychainFailure, { status: 'PRE_DISPATCH_UNAVAILABLE', target: PROJECT_REF, queryId: QUERY_ID })
  assert.equal(posts, 0)

  for (const kind of ['response-status', 'response-body', 'timeout']) {
    const result = await enabled.runPreflightOnce({
      readToken: () => 'opaque',
      post: async () => { posts += 1; throw new Error(kind) },
      now: () => 1,
    })
    assert.deepEqual(result, { status: 'UNCERTAIN_POST_DISPATCH', target: PROJECT_REF, queryId: QUERY_ID, nextAction: 'MANUAL_REVIEW_REQUIRED' })
  }
  assert.equal(posts, 3)
})
