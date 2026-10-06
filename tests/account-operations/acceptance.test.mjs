import test, { before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { randomUUID } from 'node:crypto'
import { admin, assertFixture, pool, close } from './local-pg.mjs'

const bundle = await build({ stdin: { contents: "export * from './lib/identity/customer-account-operations-repository.ts';export * from './lib/identity/customer-token-vault.ts'", resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' })
const { createCustomerAccountOperationsRepository, createAesGcmEnvelopeVault } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const USER = 'a0000000-0000-4000-8000-000000000001', OTHER = 'a0000000-0000-4000-8000-000000000002'
const SESSION = 'b0000000-0000-4000-8000-000000000001', SHOP = '107532616020', ISSUER = `https://shopify.com/authentication/${SHOP}`
const CHALLENGE = Buffer.alloc(32, 2).toString('base64url'), SUBJECT = 'tllb_' + Buffer.alloc(32, 3).toString('base64url')
const q = value => "'" + String(value).replaceAll("'", "''") + "'", j = value => q(JSON.stringify(value)) + '::jsonb'
let vault, verified = false
const tokenBundle = accessExpiresAt => ({ accessToken: 'actual-private-access', refreshToken: 'actual-private-refresh', idToken: 'actual-private-id', accessExpiresAt,
  originalNonce: Buffer.alloc(32, 4).toString('base64url'), scopes: ['openid', 'email', 'customer-account-api:full'], scopeProvenance: null, refreshTokenProvenance: null })

function reset() {
  admin(`TRUNCATE tll_bridge_private.account_operations,tll_bridge_private.account_generations,tll_bridge_private.final_operations,tll_bridge_private.finalizations,tll_customer_private.shopify_proofs;
    UPDATE tll_bridge_private.control SET enabled=true; UPDATE tll_customer_private.control SET enabled=true;`)
}
function seed(user = USER) {
  const transactionId = randomUUID(), receiptId = randomUUID(), identityId = randomUUID(), claim = randomUUID(), finish = randomUUID()
  const now = Date.now(), verifiedAt = now - 60_000, proofExpiresAt = now - 30_000, accessExpiresAt = now + 3_600_000, proofFence = '19'
  const aad = ['tll-shopify-proof/v1', 'qdmvngjwkcsilzmqksme', 'tokens', transactionId, receiptId, SHOP, ISSUER, 'customer-subject', CHALLENGE,
    String(verifiedAt), String(proofExpiresAt), proofFence]
  const tokens = vault.seal(tokenBundle(accessExpiresAt), aad), envelope = vault.seal({ fixture: true }, ['fixture', 'account'])
  admin(`INSERT INTO tll_customer_private.shopify_proofs(transaction_id,state_hash,config_hash,callback_url,inner_challenge,created_at,expires_at,state,fence,claim_operation,
      receipt_id,shop_id,issuer,subject,verified_at,proof_expires_at,access_expires_at,tokens)
    VALUES(${q(transactionId)},${q('1'.repeat(64))},${q('2'.repeat(64))},'https://the-lifting-preview-my-lifting-lab-s-projects.vercel.app/auth/customer/shopify/callback',${q(CHALLENGE)},
      to_timestamp(${verifiedAt}/1000.0),to_timestamp(${proofExpiresAt}/1000.0),'verified',${proofFence},${q(randomUUID())},${q(receiptId)},${q(SHOP)},${q(ISSUER)},'customer-subject',
      to_timestamp(${verifiedAt}/1000.0),to_timestamp(${proofExpiresAt}/1000.0),to_timestamp(${accessExpiresAt}/1000.0),${j(tokens)});
    INSERT INTO tll_bridge_private.finalizations(transaction_id,browser_hash,callback_hash,state,fence,generation,claim_operation,finish_operation,mode,config_hash,intent_hash,
      application_challenge,callback_material,provisional_material,proof_receipt_id,reserved_subject,expires_at,user_id,identity_id,authenticated_at,checked_at,session_expires_at,
      session_material,created_at,reconciled_at)
    VALUES(${q(transactionId)},${q('3'.repeat(64))},${q('4'.repeat(64))},'reconciled',1,0,${q(claim)},${q(finish)},'sign_in',${q('5'.repeat(64))},${q('6'.repeat(64))},
      ${q(CHALLENGE)},${j(envelope)},${j(envelope)},${q(receiptId)},${q(SUBJECT)},clock_timestamp()+interval '1 hour',${q(user)},${q(identityId)},clock_timestamp()-interval '1 minute',
      clock_timestamp(),clock_timestamp()+interval '1 hour',${j(envelope)},clock_timestamp()-interval '2 minutes',clock_timestamp());`)
  return { transactionId, receiptId, accessExpiresAt }
}
const repository = fault => createCustomerAccountOperationsRepository({ pool: pool(fault), vault, syntheticExecution: true })
const input = (operationId = randomUUID(), userId = USER, sessionId = SESSION) => ({ operationId, userId, sessionId })

before(() => { assertFixture(); verified = true; assert.equal(admin('SELECT enabled FROM tll_bridge_private.control'), 'f'); assert.equal(admin('SELECT enabled FROM tll_customer_private.control'), 'f') })
beforeEach(() => { vault?.destroy(); vault = createAesGcmEnvelopeVault({ activeKeyId: 'actual-account', keys: new Map([['actual-account', Buffer.alloc(32, 8)]]) }); reset() })
after(async () => { if (verified) admin('UPDATE tll_bridge_private.control SET enabled=false; UPDATE tll_customer_private.control SET enabled=false; TRUNCATE tll_bridge_private.account_operations,tll_bridge_private.account_generations,tll_bridge_private.final_operations,tll_bridge_private.finalizations,tll_customer_private.shopify_proofs;'); vault?.destroy(); await close() })

test('actual PG claim decrypts the exact receipt only after commit and exact finish completes it', async () => {
  const seeded = seed(), repo = repository(), request = input(), claim = await repo.claimOrders(request)
  assert.equal(claim.status, 'claimed'); assert.equal(claim.receiptId, seeded.receiptId); assert.equal(claim.accessToken, 'actual-private-access')
  assert.equal(await repo.finishOrders({ ...request, fence: claim.fence }), true)
  assert.equal(admin(`SELECT state||':'||(completed_at IS NOT NULL) FROM tll_bridge_private.account_operations WHERE operation_id=${q(request.operationId)}`), 'completed:true')
})

test('account and proof-receipt substitution are rejected without creating custody', async t => {
  await t.test('account', async () => { seed(); assert.equal((await repository().claimOrders(input(randomUUID(), OTHER))).status, 'rejected') })
  await t.test('receipt', async () => { const seeded = seed(); admin(`UPDATE tll_bridge_private.finalizations SET proof_receipt_id=${q(randomUUID())} WHERE transaction_id=${q(seeded.transactionId)}`); assert.equal((await repository().claimOrders(input())).status, 'rejected') })
  assert.equal(admin('SELECT count(*) FROM tll_bridge_private.account_operations'), '0')
})

test('concurrent claims yield one winner and an expired lease is held before the next claim', async () => {
  seed(); const first = input(), second = input(), values = await Promise.all([repository().claimOrders(first), repository().claimOrders(second)])
  assert.deepEqual(values.map(value => value.status).sort(), ['claimed', 'rejected'])
  const winner = values[0].status === 'claimed' ? first : second
  admin(`UPDATE tll_bridge_private.account_operations SET created_at=clock_timestamp()-interval '2 minutes',lease_until=clock_timestamp()-interval '1 second' WHERE operation_id=${q(winner.operationId)}`)
  const next = await repository().claimOrders(input()); assert.equal(next.status, 'claimed')
  assert.equal(admin(`SELECT state FROM tll_bridge_private.account_operations WHERE operation_id=${q(winner.operationId)}`), 'held')
})

test('logout generation invalidates finish and the exact claim can still be held', async () => {
  seed(); const repo = repository(), request = input(), claim = await repo.claimOrders(request); assert.equal(claim.status, 'claimed')
  assert.equal(await repo.finishOrders({ ...request, sessionId: randomUUID(), fence: claim.fence }), false)
  admin(`UPDATE tll_bridge_private.account_generations SET generation=generation+1 WHERE user_id=${q(USER)}`)
  assert.equal(await repo.finishOrders({ ...request, fence: claim.fence }), false)
  await repo.holdOrders({ ...request, fence: claim.fence })
  assert.equal(admin(`SELECT state FROM tll_bridge_private.account_operations WHERE operation_id=${q(request.operationId)}`), 'held')
})

test('disabled controls reject new work but cannot prevent exact quarantine', async () => {
  seed(); admin('UPDATE tll_bridge_private.control SET enabled=false'); assert.equal((await repository().claimOrders(input())).status, 'rejected')
  admin('UPDATE tll_bridge_private.control SET enabled=true'); const repo = repository(), request = input(), claim = await repo.claimOrders(request); assert.equal(claim.status, 'claimed')
  admin('UPDATE tll_bridge_private.control SET enabled=false; UPDATE tll_customer_private.control SET enabled=false')
  await repo.holdOrders({ ...request, fence: claim.fence }); assert.equal(admin(`SELECT state FROM tll_bridge_private.account_operations WHERE operation_id=${q(request.operationId)}`), 'held')
})

test('lost claim and finish acknowledgements release no result and are quarantined without replay', async () => {
  seed(); let lost = false; const request = input(), claimLost = repository(({ sql, operation }) => { if (!lost && operation === 'claim_orders' && sql === 'COMMIT') { lost = true; return true } return false })
  await assert.rejects(() => claimLost.claimOrders(request), /unavailable/)
  assert.equal(admin(`SELECT state FROM tll_bridge_private.account_operations WHERE operation_id=${q(request.operationId)}`), 'held')
  const next = input(), base = repository(), claim = await base.claimOrders(next); assert.equal(claim.status, 'claimed'); lost = false
  const finishLost = repository(({ sql, operation }) => { if (!lost && operation === 'finish_orders' && sql === 'COMMIT') { lost = true; return true } return false })
  await assert.rejects(() => finishLost.finishOrders({ ...next, fence: claim.fence }), /unavailable/)
  await base.holdOrders({ ...next, fence: claim.fence }); assert.equal(admin(`SELECT state FROM tll_bridge_private.account_operations WHERE operation_id=${q(next.operationId)}`), 'held')
})

test('runtime roles have fixed function-only authority and cannot read ciphertext', () => {
  reset(); for (const role of ['anon', 'authenticated', 'service_role', 'tll_ao1_bridge_executor'])
    assert.throws(() => admin(`SET SESSION AUTHORIZATION ${role}; SELECT * FROM tll_bridge_private.account_operations;`), /Synthetic account SQL failed/)
  assert.equal(admin("SELECT has_function_privilege('tll_ao1_bridge_executor','tll_bridge_private.account_repository(text,jsonb)','EXECUTE')::text||':'||has_function_privilege('service_role','tll_bridge_private.account_repository(text,jsonb)','EXECUTE')::text||':'||has_function_privilege('tll_ao1_bridge_executor','tll_customer_private.account_token_source(uuid,uuid)','EXECUTE')::text"), 'true:false:false')
})
