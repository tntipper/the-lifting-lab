import test, { before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createHash, randomUUID } from 'node:crypto'
import { admin, assertFixture, pool, close } from './local-pg.mjs'

const bundle = await build({ stdin: { contents: "export * from './lib/identity/customer-account-logout-repository.ts';export * from './lib/identity/customer-account-operations-repository.ts';export * from './lib/identity/customer-token-vault.ts'", resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' })
const { createCustomerAccountLogoutRepository, createCustomerAccountOperationsRepository, createAesGcmEnvelopeVault } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const USER = 'a0000000-0000-4000-8000-000000000001', OTHER = 'a0000000-0000-4000-8000-000000000002'
const SESSION = 'b0000000-0000-4000-8000-000000000001', SHOP = '107532616020', ISSUER = `https://shopify.com/authentication/${SHOP}`
const q = value => "'" + String(value).replaceAll("'", "''") + "'", j = value => q(JSON.stringify(value)) + '::jsonb'
const sha = value => createHash('sha256').update(value).digest('hex')
let vault, verified = false

function reset() {
  admin(`TRUNCATE tll_bridge_private.account_logouts,tll_bridge_private.account_operations,tll_bridge_private.account_generations,
    tll_bridge_private.final_operations,tll_bridge_private.finalizations,tll_bridge_private.operations,tll_bridge_private.grants,
    tll_broker_private.operations,tll_broker_private.flows,tll_broker_private.subjects,
    tll_provisional_private.operations,tll_provisional_private.intents,tll_customer_private.shopify_proofs;
    UPDATE tll_bridge_private.control SET enabled=true; UPDATE tll_customer_private.control SET enabled=true;
    UPDATE tll_broker_private.control SET enabled=true; UPDATE tll_provisional_private.control SET enabled=true;`)
}
function seed(user = USER, { expiredAccess = false } = {}) {
  const tx = randomUUID(), receipt = randomUUID(), identity = randomUUID(), browser = sha('browser' + tx), outer = sha('outer' + tx), config = sha('config' + tx), intent = sha('intent' + tx)
  const challenge = Buffer.from(createHash('sha256').update('challenge' + tx).digest()).toString('base64url'), sub = 'tllb_' + Buffer.from(createHash('sha256').update('sub' + tx).digest()).toString('base64url')
  const now = Date.now(), verifiedAt = now - 120_000, proofExpiresAt = now - 90_000, accessExpiresAt = now + (expiredAccess ? -30_000 : 3_600_000), proofFence = '19'
  const aad = ['tll-shopify-proof/v1', 'qdmvngjwkcsilzmqksme', 'tokens', tx, receipt, SHOP, ISSUER, 'subject-' + user, challenge,
    String(verifiedAt), String(proofExpiresAt), proofFence]
  const tokens = vault.seal({ accessToken: 'access-' + user, refreshToken: 'refresh-' + user, idToken: 'header.' + user + '.signature', accessExpiresAt,
    originalNonce: Buffer.alloc(32, user === USER ? 4 : 5).toString('base64url'), scopes: ['openid', 'email', 'customer-account-api:full'], scopeProvenance: null, refreshTokenProvenance: null }, aad)
  const envelope = vault.seal({ fixture: true }, ['fixture', tx]), metadata = { mode: 'migration', original: { userId: user, sessionId: SESSION }, createdAt: now, expiresAt: now + 240_000 }
  const binding = { transactionId: tx, browserHash: browser, configHash: config, intentHash: intent, applicationPkceChallenge: challenge,
    admissionOperationId: randomUUID(), admissionFence: '1', generation: '0' }
  admin(`INSERT INTO tll_customer_private.shopify_proofs(transaction_id,state_hash,config_hash,callback_url,inner_challenge,created_at,expires_at,state,fence,claim_operation,
      receipt_id,shop_id,issuer,subject,verified_at,proof_expires_at,access_expires_at,tokens)
    VALUES(${q(tx)},${q(sha('state'+tx))},${q(config)},'https://the-lifting-preview-my-lifting-lab-s-projects.vercel.app/auth/customer/shopify/callback',${q(challenge)},
      to_timestamp(${verifiedAt}/1000.0),to_timestamp(${proofExpiresAt}/1000.0),'verified',${proofFence},${q(randomUUID())},${q(receipt)},${q(SHOP)},${q(ISSUER)},${q('subject-'+user)},
      to_timestamp(${verifiedAt}/1000.0),to_timestamp(${proofExpiresAt}/1000.0),to_timestamp(${accessExpiresAt}/1000.0),${j(tokens)});
    INSERT INTO tll_broker_private.subjects(sub,shop_id,issuer,subject,reservation,pending_user_id,bound_user_id,created_at)
      VALUES(${q(sub)},${q(SHOP)},${q(ISSUER)},${q('subject-'+user)},'bound',NULL,${q(user)},clock_timestamp());
    INSERT INTO tll_broker_private.flows(id,config_hash,browser_hash,outer_hash,outer_state,registration,created_at,expires_at,status,generation,fence,sub,proof_receipt_id,shopify_proof,hard_deadline,code_hash,bearer_hash,bearer_expires_at)
      VALUES(${q(tx)},'7c54b659cf0e2ecdf07ce2b34ea10d7fc0a7c6ef3c9f59f38ca8f5cd79e86780',${q(browser)},${q(outer)},${q(randomUUID())},${j({target:{userId:user,sessionId:SESSION}})},
      clock_timestamp(),clock_timestamp()+interval '4 minutes','consumed',0,1,${q(sub)},${q(receipt)},'{}',clock_timestamp()+interval '3 minutes',${q(sha('code'+tx))},${q(sha('bearer'+tx))},clock_timestamp()+interval '2 minutes');
    INSERT INTO tll_provisional_private.intents(id,browser_hash,config_hash,intent_hash,application_challenge,metadata,material,created_at,expires_at,state,generation,fence,outer_request,outer_hash,outer_state,bridge_epoch)
      VALUES(${q(tx)},${q(browser)},${q(config)},${q(intent)},${q(challenge)},${j(metadata)},${j(envelope)},clock_timestamp(),clock_timestamp()+interval '4 minutes','admitted',0,1,'{}',${q(outer)},${q(randomUUID())},1);
    INSERT INTO tll_bridge_private.grants(id,binding,source_snapshot,admission_operation,admission_fence,source_generation,registration_operation,outer_hash,epoch,expires_at,state)
      VALUES(${q(tx)},${j(binding)},${j({metadata})},${q(binding.admissionOperationId)},1,0,${q(randomUUID())},${q(outer)},1,clock_timestamp()+interval '4 minutes','browser_admitted');
    INSERT INTO tll_bridge_private.finalizations(transaction_id,browser_hash,callback_hash,state,fence,generation,claim_operation,finish_operation,mode,original_user_id,config_hash,intent_hash,
      application_challenge,callback_material,provisional_material,proof_receipt_id,reserved_subject,expires_at,user_id,identity_id,authenticated_at,checked_at,session_expires_at,session_material,created_at,reconciled_at)
      VALUES(${q(tx)},${q(browser)},${q(sha('callback'+tx))},'reconciled',1,0,${q(randomUUID())},${q(randomUUID())},'migration',${q(user)},${q(config)},${q(intent)},${q(challenge)},
      ${j(envelope)},${j(envelope)},${q(receipt)},${q(sub)},clock_timestamp()+interval '1 hour',${q(user)},${q(identity)},clock_timestamp()-interval '1 minute',clock_timestamp(),
      clock_timestamp()+interval '1 hour',${j(envelope)},clock_timestamp()-interval '2 minutes',clock_timestamp());`)
  return { tx, receipt, sub, accessExpiresAt }
}
const logoutRepo = fault => createCustomerAccountLogoutRepository({ pool: pool(fault), vault, syntheticExecution: true })
const ordersRepo = () => createCustomerAccountOperationsRepository({ pool: pool(), vault, syntheticExecution: true })
const logoutInput = (operationId = randomUUID(), userId = USER, sessionId = SESSION) => ({ operationId, userId, sessionId })

before(() => { assertFixture(); verified = true; assert.equal(admin('SELECT enabled FROM tll_bridge_private.control'), 'f') })
beforeEach(() => { vault?.destroy(); vault = createAesGcmEnvelopeVault({ activeKeyId: 'actual-logout', keys: new Map([['actual-logout', Buffer.alloc(32, 10)]]) }); reset() })
after(async () => { if (verified) { reset(); admin('UPDATE tll_bridge_private.control SET enabled=false; UPDATE tll_customer_private.control SET enabled=false; UPDATE tll_broker_private.control SET enabled=false; UPDATE tll_provisional_private.control SET enabled=false;') } vault?.destroy(); await close() })

test('atomic logout fences reads and cancels final, bridge, broker and provisional state for only its owner', async () => {
  const mine = seed(), other = seed(OTHER), orders = ordersRepo(), read = logoutInput(randomUUID()), claim = await orders.claimOrders(read); assert.equal(claim.status, 'claimed')
  const request = logoutInput(), result = await logoutRepo().beginLogout(request)
  assert.equal(result.status, 'local_revoked'); assert.equal(result.generation, '1'); assert.equal(result.upstreamLogout.status, 'pending'); assert.match(result.upstreamLogout.idToken, new RegExp(USER))
  assert.equal(admin(`SELECT state FROM tll_bridge_private.account_operations WHERE operation_id=${q(read.operationId)}`), 'held')
  assert.equal(admin(`SELECT state||':'||(user_id IS NULL)||':'||(session_material IS NULL) FROM tll_bridge_private.finalizations WHERE transaction_id=${q(mine.tx)}`), 'held:true:true')
  assert.equal(admin(`SELECT state FROM tll_bridge_private.grants WHERE id=${q(mine.tx)}`), 'cancelled')
  assert.equal(admin(`SELECT status FROM tll_broker_private.flows WHERE id=${q(mine.tx)}`), 'cancelled')
  assert.equal(admin(`SELECT state FROM tll_provisional_private.intents WHERE id=${q(mine.tx)}`), 'cancelled')
  assert.equal(admin(`SELECT state||':'||(user_id IS NOT NULL) FROM tll_bridge_private.finalizations WHERE transaction_id=${q(other.tx)}`), 'reconciled:true')
  assert.equal(admin(`SELECT status FROM tll_broker_private.flows WHERE id=${q(other.tx)}`), 'consumed')
  assert.equal(admin(`SELECT (tokens IS NOT NULL)::text FROM tll_customer_private.shopify_proofs WHERE transaction_id=${q(mine.tx)}`), 'true')
  assert.equal((await orders.claimOrders(logoutInput(randomUUID()))).status, 'rejected')
})

test('same-session repeats are idempotent and operation IDs cannot cross owners', async () => {
  seed(); const repo = logoutRepo(), first = logoutInput(); assert.equal((await repo.beginLogout(first)).generation, '1')
  const repeat = await repo.beginLogout(logoutInput()); assert.equal(repeat.generation, '1'); assert.equal(repeat.upstreamLogout.status, 'not_required')
  assert.equal((await repo.beginLogout(first)).upstreamLogout.status, 'not_required')
  assert.equal((await repo.beginLogout({ ...first, userId: OTHER })).status, 'rejected')
  assert.equal(admin(`SELECT generation FROM tll_bridge_private.account_generations WHERE user_id=${q(USER)}`), '1')
})

test('a verified owner with no Shopify finalization is locally revoked without an upstream hint', async () => {
  const request = logoutInput(randomUUID(), OTHER, randomUUID()), result = await logoutRepo().beginLogout(request)
  assert.equal(result.status, 'local_revoked'); assert.equal(result.generation, '1'); assert.equal(result.upstreamLogout.status, 'not_required')
  assert.equal(admin(`SELECT generation FROM tll_bridge_private.account_generations WHERE user_id=${q(OTHER)}`), '1')
})

test('lost commit acknowledgement stays locally revoked and a new same-session operation does not replay upstream logout', async () => {
  seed(); let lost = false; const request = logoutInput(), faulty = logoutRepo(({ sql, operation }) => { if (!lost && operation === 'logout' && sql === 'COMMIT') { lost = true; return true } return false })
  await assert.rejects(() => faulty.beginLogout(request), /unavailable/)
  assert.equal(admin(`SELECT generation||':'||logout_session_id FROM tll_bridge_private.account_generations WHERE user_id=${q(USER)}`), '1:' + SESSION)
  const repeat = await logoutRepo().beginLogout(logoutInput()); assert.equal(repeat.upstreamLogout.status, 'not_required'); assert.equal(repeat.generation, '1')
})

test('logout remains available with all controls disabled and can return an expired-session ID hint', async () => {
  seed(USER, { expiredAccess: true }); admin('UPDATE tll_bridge_private.control SET enabled=false; UPDATE tll_customer_private.control SET enabled=false; UPDATE tll_broker_private.control SET enabled=false; UPDATE tll_provisional_private.control SET enabled=false')
  const result = await logoutRepo().beginLogout(logoutInput()); assert.equal(result.status, 'local_revoked'); assert.equal(result.upstreamLogout.status, 'pending'); assert.match(result.upstreamLogout.idToken, /^header\./)
})

test('concurrent finish and logout serialize to a revoked owner with no releasable finalization', async () => {
  seed(); const orders = ordersRepo(), read = logoutInput(randomUUID()), claim = await orders.claimOrders(read); assert.equal(claim.status, 'claimed')
  const [finished, loggedOut] = await Promise.all([orders.finishOrders({ ...read, fence: claim.fence }), logoutRepo().beginLogout(logoutInput())])
  assert.equal(loggedOut.status, 'local_revoked'); assert.ok(finished === true || finished === false)
  assert.equal(admin(`SELECT state FROM tll_bridge_private.account_operations WHERE operation_id=${q(read.operationId)}`), 'held')
  assert.equal(admin(`SELECT count(*) FROM tll_bridge_private.finalizations WHERE user_id=${q(USER)} AND state='reconciled'`), '0')
})
