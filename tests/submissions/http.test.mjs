import test, { before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHmac, randomUUID } from 'node:crypto'
import { signSubmission, createSubmissionHandler } from '../../lib/submissions/gateway.ts'

// Run database.test.mjs first. These fixed targets cannot address a remote service.
const origin = 'http://127.0.0.1:55434'
const cfg = { enabled: true, vercel: '1', vercelEnvironment: 'preview', allowedOrigins: ['https://forms.example.test'], audience: 'tll-submissions:synthetic', keyId: 'synthetic-1', signingKeyHex: '12'.repeat(32), privacyKeyHex: '34'.repeat(32), supabaseUrl: '', anonKey: '' }
const body = () => ({ name: 'HTTP synthetic', email: 'http@example.test', message: 'Synthetic HTTP receipt' })
const sql = text => execFileSync('docker', ['exec', '-i', 'tll-stage0-postgres', 'psql', '-X', '-q', '-U', 'postgres', '-d', 'tll_submission_test', '-v', 'ON_ERROR_STOP=1', '-tA'], { input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
function jwt(role) {
  const data = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')
  return data + '.' + createHmac('sha256', 'tll-submission-synthetic-only-jwt-secret-000000').update(data).digest('base64url')
}
const rpc = async (signed, role = 'anon') => fetch(origin + '/rpc/submit_public_form', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt(role) }, body: JSON.stringify(signed), signal: AbortSignal.timeout(5000) })
const sign = () => signSubmission('contact', body(), randomUUID(), '192.0.2.50', cfg, Date.now())

before(async () => {
  assert.equal(sql('select current_database()'), 'tll_submission_test')
  assert.equal(sql("select to_regprocedure('public.submit_public_form(text,text,text)') is not null"), 't')
  const response = await fetch(origin, { signal: AbortSignal.timeout(5000) })
  assert.equal(response.status, 200, 'Start the documented synthetic PostgREST container first.')
})
beforeEach(() => {
  sql("truncate tll_submission_private.quota,tll_submission_private.receipts; delete from public.contact_submissions where id<>'22222222-2222-4222-8222-222222222222'; truncate public.supplement_submissions; update tll_submission_private.policy set enabled=true,audience='tll-submissions:synthetic',ip_burst_limit=3,ip_daily_limit=10,email_daily_limit=5,global_hourly_limit=100,global_daily_limit=500; update tll_submission_private.signing_keys set revoked=false,valid_from=now()-interval '1 day',expires_at=now()+interval '1 day' where key_id='synthetic-1'")
})
test('direct REST inserts and personal reads fail for both browser roles', async () => {
  for (const role of ['anon', 'authenticated']) for (const table of ['contact_submissions', 'supplement_submissions']) {
    const headers = { Authorization: 'Bearer ' + jwt(role), 'Content-Type': 'application/json' }
    const read = await fetch(origin + '/' + table + '?select=*', { headers })
    assert.ok([401, 403, 404].includes(read.status))
    assert.equal((await read.text()).includes('legacy@example.test'), false)
    const write = await fetch(origin + '/' + table, { method: 'POST', headers, body: JSON.stringify(body()) })
    assert.ok([401, 403, 404].includes(write.status))
  }
})
test('unsigned, tampered, wrong-audience RPCs cannot create rows through HTTP', async () => {
  const unsigned = await rpc({ p_key_id: 'synthetic-1', p_payload: '{}', p_signature: '00'.repeat(32) })
  assert.equal((await unsigned.json()).status, 'rejected')
  const signed = sign()
  assert.equal((await (await rpc({ ...signed, p_payload: signed.p_payload + ' ' })).json()).status, 'rejected')
  const other = signSubmission('contact', body(), randomUUID(), '192.0.2.50', { ...cfg, audience: 'tll-submissions:other' }, Date.now())
  assert.equal((await (await rpc(other)).json()).status, 'rejected')
  assert.equal(sql('select count(*) from tll_submission_private.receipts'), '0')
})
test('valid signed HTTP capability accepts once and exact retry is a duplicate receipt', async () => {
  const signed = sign()
  const first = await rpc(signed)
  assert.equal(first.status, 200)
  assert.deepEqual(await first.json(), { status: 'accepted' })
  assert.deepEqual(await (await rpc(signed, 'authenticated')).json(), { status: 'duplicate' })
  assert.equal(sql('select count(*) from tll_submission_private.receipts'), '1')
})
test('HTTP concurrency and two gateway instances observe the same durable cap', async () => {
  const dependencies = { now: Date.now, identity: () => '192.0.2.50', transport: async signed => {
    const response = await rpc(signed)
    if (!response.ok) throw new Error('Synthetic transport failed')
    return await response.json()
  } }
  const handlers = [createSubmissionHandler(cfg, dependencies), createSubmissionHandler(cfg, dependencies)]
  const request = () => new Request('https://forms.example.test/api/contact', { method: 'POST', headers: { origin: 'https://forms.example.test', 'content-type': 'application/json', 'idempotency-key': randomUUID() }, body: JSON.stringify(body()) })
  const responses = await Promise.all(Array.from({ length: 8 }, (_, index) => handlers[index % 2](request(), 'contact')))
  assert.equal(responses.filter(response => response.status === 202).length, 3)
  assert.equal(responses.filter(response => response.status === 429).length, 5)
})
test('private schema cannot be selected by an HTTP profile header', async () => {
  const response = await fetch(origin + '/signing_keys', { headers: { 'Accept-Profile': 'tll_submission_private', Authorization: 'Bearer ' + jwt('authenticated') } })
  assert.ok([401, 403, 404, 406].includes(response.status))
  assert.equal((await response.text()).includes('1212121212'), false)
})
