import test, { before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createHash, createHmac, randomUUID } from 'node:crypto'
import { signSubmission, createSubmissionHandler } from '../../lib/submissions/gateway.ts'

// Fixed local Docker target and synthetic database. No environment URL override.
const container = 'tll-stage0-postgres', database = 'tll_submission_test'
const cfg = { enabled: true, vercel: '1', vercelEnvironment: 'preview', allowedOrigins: ['https://forms.example.test'], audience: 'tll-submissions:synthetic', keyId: 'synthetic-1', signingKeyHex: '12'.repeat(32), privacyKeyHex: '34'.repeat(32), supabaseUrl: '', anonKey: '' }
const args = ['exec', '-i', container, 'psql', '-X', '-q', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-tA']
const sql = text => execFileSync('docker', args, { input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
const quote = value => "'" + value.replaceAll("'", "''") + "'"
const rpcSql = signed => 'set role anon; select public.submit_public_form(' + [signed.p_key_id, signed.p_payload, signed.p_signature].map(quote).join(',') + ');'
const call = signed => JSON.parse(sql(rpcSql(signed)))
const contact = () => ({ name: 'Synthetic contact', email: 'user@example.test', message: 'Synthetic message' })
const supplement = () => ({ category: 'creatine', brand: 'Synthetic', product: 'Test product', url: 'https://manufacturer.example.test/product', email: '', notes: '' })
const sign = (body = contact(), id = randomUUID(), ip = '192.0.2.1', kind = 'contact', now = Date.now()) => signSubmission(kind, body, id, ip, cfg, now)
function modify(signed, changes, resign = true) {
  const value = { ...signed, p_payload: JSON.stringify({ ...JSON.parse(signed.p_payload), ...changes }) }
  if (resign) value.p_signature = createHmac('sha256', Buffer.from(cfg.signingKeyHex, 'hex')).update(value.p_payload).digest('hex')
  return value
}
const asyncCall = signed => new Promise((resolve, reject) => {
  const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] }); let output = '', error = ''
  child.stdout.on('data', value => { output += value }); child.stderr.on('data', value => { error += value })
  child.on('error', reject); child.on('close', code => code === 0 ? resolve(JSON.parse(output.trim())) : reject(new Error(error)))
  child.stdin.end(rpcSql(signed))
})

before(() => {
  const exists = execFileSync('docker', ['exec', container, 'psql', '-X', '-q', '-U', 'postgres', '-d', 'postgres', '-tAc', "select 1 from pg_database where datname='tll_submission_test'"], { encoding: 'utf8' }).trim()
  if (exists !== '1') execFileSync('docker', ['exec', container, 'createdb', '-U', 'postgres', database])
  assert.equal(sql('select current_database()'), database)
  sql(readFileSync(new URL('./bootstrap.sql', import.meta.url), 'utf8'))
  sql(readFileSync(new URL('../../supabase/migrations/202609150002_public_submission_gateway.sql', import.meta.url), 'utf8'))
  sql("insert into tll_submission_private.signing_keys values('synthetic-1',decode(repeat('12',32),'hex'),now()-interval '1 day',now()+interval '1 day',false)")
})
beforeEach(() => {
  sql("truncate tll_submission_private.quota,tll_submission_private.receipts; delete from public.contact_submissions where id<>'22222222-2222-4222-8222-222222222222'; truncate public.supplement_submissions; update tll_submission_private.policy set enabled=true,audience='tll-submissions:synthetic',ip_burst_limit=3,ip_daily_limit=10,email_daily_limit=5,global_hourly_limit=100,global_daily_limit=500; update tll_submission_private.signing_keys set revoked=false,valid_from=now()-interval '1 day',expires_at=now()+interval '1 day' where key_id='synthetic-1'")
})

test('legacy data, named staff policy, table owner and grants survive', () => {
  assert.equal(sql('set role tll_submission_test_staff; select count(*) from public.contact_submissions'), '1')
  assert.equal(sql("select pg_get_userbyid(relowner) from pg_class where oid='public.contact_submissions'::regclass"), 'postgres')
  assert.equal(sql("select array_to_string(polroles::regrole[],',') from pg_policy where polname='legacy_mixed_staff' and polrelid='public.contact_submissions'::regclass"), 'tll_submission_test_staff')
  assert.equal(sql("select count(*) from pg_policy where polname='preserve_staff' and polrelid='public.supplement_submissions'::regclass"), '1')
  assert.equal(sql("select has_table_privilege('service_role','public.contact_submissions','SELECT,INSERT,UPDATE,DELETE')"), 't')
})
test('all effective public/anon/auth table and column paths removed; private key/PII unreadable', () => {
  for (const role of ['anon', 'authenticated']) for (const table of ['contact_submissions', 'supplement_submissions']) {
    assert.equal(sql(`select has_table_privilege('${role}','public.${table}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege('${role}','public.${table}','SELECT,INSERT,UPDATE,REFERENCES')`), 'f')
    assert.throws(() => sql(`set role ${role}; select * from public.${table}`))
  }
  assert.throws(() => sql("set role anon; insert into public.contact_submissions(name,email,message) values('x','x@y.test','x')"))
  assert.throws(() => sql("set role authenticated; insert into public.supplement_submissions(category,brand,product_name,url) values('x','x','x','x')"))
  assert.throws(() => sql('set role anon; select secret from tll_submission_private.signing_keys'))
  assert.equal(sql("select rolcanlogin or rolsuper or rolbypassrls or rolcreaterole or rolcreatedb from pg_roles where rolname='tll_submission_owner'"), 'f')
  assert.equal(sql("select has_any_column_privilege('tll_submission_owner','public.contact_submissions','SELECT')"), 'f')
  assert.equal(sql("select has_table_privilege('tll_submission_owner','tll_submission_private.signing_keys','INSERT,UPDATE,DELETE')"), 'f')
})
test('valid contact and supplement enter private inboxes with no notification side effects', () => {
  assert.equal(call(sign()).status, 'accepted')
  assert.equal(call(sign(supplement(), randomUUID(), '192.0.2.2', 'supplement')).status, 'accepted')
  assert.equal(sql('select count(*) from public.contact_submissions'), '2')
  assert.equal(sql('select count(*) from public.supplement_submissions'), '1')
  assert.equal(sql("select notes is null and email is null from public.supplement_submissions"), 't')
})
test('maximum-length escaped content fits both the body and signed envelope limits', () => {
  const value = sign({ ...contact(), message: '"'.repeat(8000) })
  assert.ok(Buffer.byteLength(value.p_payload) > 20000)
  assert.equal(call(value).status, 'accepted')
})
test('exact payload and every envelope field are bound to the MAC', () => {
  const value = sign(), payload = JSON.parse(value.p_payload)
  for (const key of Object.keys(payload)) assert.equal(call(modify(value, { [key]: String(payload[key]) + 'x' }, false)).status, 'rejected', key)
  assert.equal(call({ ...value, p_payload: value.p_payload + ' ' }).status, 'rejected')
  assert.equal(call({ ...value, p_signature: '00'.repeat(32) }).status, 'rejected')
  assert.equal(call({ ...value, p_key_id: 'unknown-key' }).status, 'rejected')
  assert.equal(sql('select count(*) from tll_submission_private.receipts'), '0')
})
test('validly signed wrong audience, stale/future token, body digest and malformed values fail', () => {
  assert.equal(call(modify(sign(), { audience: 'tll-submissions:other' })).status, 'rejected')
  assert.equal(call(sign(contact(), randomUUID(), '192.0.2.1', 'contact', Date.now() - 301000)).status, 'rejected')
  assert.equal(call(sign(contact(), randomUUID(), '192.0.2.1', 'contact', Date.now() + 31000)).status, 'rejected')
  assert.equal(call(modify(sign(), { body_sha256: '00'.repeat(32) })).status, 'invalid')
  assert.equal(call(modify(sign(), { issued_at: '123' })).status, 'invalid')
  assert.equal(call(modify(sign(), { request_id: 'not-a-uuid' })).status, 'invalid')
  assert.equal(call(modify(sign(), { extra: 'unexpected' })).status, 'invalid')
  for (const change of [{ name: '' }, { message: 'x'.repeat(8001) }, { name: 99 }, { email: 'bad' }, { extra: 'x' }]) assert.equal(call(sign({ ...contact(), ...change })).status, 'invalid')
  const badJson = '{', digest = createHash('sha256').update(badJson).digest('hex')
  assert.equal(call(modify(sign(), { body_json: badJson, body_sha256: digest })).status, 'invalid')
  for (const raw of ['[]', 'null', '"text"', '{}', '{']) {
    const value = { p_key_id: cfg.keyId, p_payload: raw, p_signature: createHmac('sha256', Buffer.from(cfg.signingKeyHex, 'hex')).update(raw).digest('hex') }
    assert.equal(call(value).status, 'invalid')
  }
})
test('disabled policy, revoked keys and expiry fail closed; 30-day maximum enforced', () => {
  sql('update tll_submission_private.policy set enabled=false')
  assert.equal(call(sign()).status, 'unavailable')
  sql('update tll_submission_private.policy set enabled=true; update tll_submission_private.signing_keys set revoked=true')
  assert.equal(call(sign()).status, 'rejected')
  sql("update tll_submission_private.signing_keys set revoked=false,expires_at=now()-interval '1 second'")
  assert.equal(call(sign()).status, 'rejected')
  assert.throws(() => sql("insert into tll_submission_private.signing_keys values('too-long',decode(repeat('12',32),'hex'),now(),now()+interval '31 days',false)"))
})
test('key rotation supports overlap and immediate revocation without resetting quotas', () => {
  sql("insert into tll_submission_private.signing_keys values('synthetic-2',decode(repeat('56',32),'hex'),now()-interval '1 hour',now()+interval '1 day',false) on conflict(key_id) do update set revoked=false,valid_from=excluded.valid_from,expires_at=excluded.expires_at")
  assert.equal(call(sign()).status, 'accepted')
  const second = signSubmission('contact', contact(), randomUUID(), '192.0.2.1', { ...cfg, keyId: 'synthetic-2', signingKeyHex: '56'.repeat(32) }, Date.now())
  assert.equal(call(second).status, 'accepted')
  sql("update tll_submission_private.signing_keys set revoked=true where key_id='synthetic-1'")
  assert.equal(call(sign()).status, 'rejected')
  assert.equal(sql("select used from tll_submission_private.quota where scope='ip_burst'"), '2')
})
test('idempotency returns one receipt and rejects reuse with changed payload, form or subject', () => {
  const id = randomUUID(), value = sign(contact(), id)
  assert.equal(call(value).status, 'accepted')
  assert.equal(call(sign(contact(), id)).status, 'duplicate')
  assert.equal(call(sign({ ...contact(), message: 'different' }, id)).status, 'conflict')
  assert.equal(call(sign(contact(), id, '192.0.2.3')).status, 'conflict')
  assert.equal(call(sign(supplement(), id, '192.0.2.1', 'supplement')).status, 'conflict')
  assert.equal(sql("select used from tll_submission_private.quota where scope='global_day'"), '1')
})
test('independent SQL connections cannot exceed quota or duplicate a receipt concurrently', async () => {
  const responses = await Promise.all(Array.from({ length: 10 }, () => asyncCall(sign())))
  assert.equal(responses.filter(value => value.status === 'accepted').length, 3)
  assert.equal(responses.filter(value => value.status === 'rate_limited').length, 7)
  assert.ok(responses.filter(value => value.status === 'rate_limited').every(value => value.retry_after_seconds > 0))
  sql('truncate tll_submission_private.quota,tll_submission_private.receipts')
  const shared = sign()
  const replay = await Promise.all(Array.from({ length: 8 }, () => asyncCall(shared)))
  assert.equal(replay.filter(value => value.status === 'accepted').length, 1)
  assert.equal(replay.filter(value => value.status === 'duplicate').length, 7)
})
test('email quota covers rotating IPs; global hourly/daily caps cover rotating emails and IPs', () => {
  sql('update tll_submission_private.policy set email_daily_limit=2')
  assert.equal(call(sign(contact(), randomUUID(), '192.0.2.1')).status, 'accepted')
  assert.equal(call(sign(contact(), randomUUID(), '192.0.2.2')).status, 'accepted')
  assert.equal(call(sign(contact(), randomUUID(), '192.0.2.3')).status, 'rate_limited')
  sql('truncate tll_submission_private.quota,tll_submission_private.receipts; update tll_submission_private.policy set global_hourly_limit=1')
  assert.equal(call(sign({ ...contact(), email: 'one@example.test' }, randomUUID(), '192.0.2.5')).status, 'accepted')
  assert.equal(call(sign({ ...contact(), email: 'two@example.test' }, randomUUID(), '192.0.2.6')).status, 'rate_limited')
  sql('truncate tll_submission_private.quota,tll_submission_private.receipts; update tll_submission_private.policy set global_hourly_limit=100,global_daily_limit=1')
  assert.equal(call(sign({ ...contact(), email: 'three@example.test' }, randomUUID(), '192.0.2.7')).status, 'accepted')
  assert.equal(call(sign({ ...contact(), email: 'four@example.test' }, randomUUID(), '192.0.2.8')).status, 'rate_limited')
})
test('database expiry cleanup is bounded and does not delete inbox records', () => {
  sql("insert into tll_submission_private.quota values('expired','synthetic',0,1,now()-interval '1 day'); insert into tll_submission_private.receipts values('33333333-3333-4333-8333-333333333333',decode(repeat('00',32),'hex'),now()-interval '5 days',now()-interval '2 days')")
  assert.equal(call(sign()).status, 'accepted')
  assert.equal(sql("select count(*) from tll_submission_private.quota where scope='expired'"), '0')
  assert.equal(sql("select count(*) from tll_submission_private.receipts where request_id='33333333-3333-4333-8333-333333333333'"), '0')
  assert.equal(sql("select count(*) from public.contact_submissions where id='22222222-2222-4222-8222-222222222222'"), '1')
})
test('two stateless handler instances share the durable database quota', async () => {
  const dependencies = { now: Date.now, identity: () => '192.0.2.20', transport: asyncCall }
  const handlers = [createSubmissionHandler(cfg, dependencies), createSubmissionHandler(cfg, dependencies)]
  const request = () => new Request('https://forms.example.test/api/contact', { method: 'POST', headers: { origin: 'https://forms.example.test', 'content-type': 'application/json', 'idempotency-key': randomUUID() }, body: JSON.stringify(contact()) })
  const responses = await Promise.all(Array.from({ length: 6 }, (_, index) => handlers[index % 2](request(), 'contact')))
  assert.equal(responses.filter(value => value.status === 202).length, 3)
  assert.equal(responses.filter(value => value.status === 429).length, 3)
})
test('global quota is atomic across unrelated email and IP subjects', async () => {
  sql('update tll_submission_private.policy set global_hourly_limit=2')
  const responses = await Promise.all(Array.from({ length: 8 }, (_, index) => asyncCall(sign({ ...contact(), email: `global-${index}@example.test` }, randomUUID(), `192.0.2.${index + 30}`))))
  assert.equal(responses.filter(value => value.status === 'accepted').length, 2)
  assert.equal(responses.filter(value => value.status === 'rate_limited').length, 6)
})
test('failed inbox insertion rolls back quota consumption and idempotency together', () => {
  sql("alter table public.contact_submissions add constraint synthetic_failure check(message<>'force-rollback') not valid")
  try {
    assert.throws(() => call(sign({ ...contact(), message: 'force-rollback' })))
    assert.equal(sql('select count(*) from tll_submission_private.quota'), '0')
    assert.equal(sql('select count(*) from tll_submission_private.receipts'), '0')
  } finally { sql('alter table public.contact_submissions drop constraint synthetic_failure') }
})
test('inherited grants cause a transactional preflight stop instead of changing shared staff authority', () => {
  const migration = readFileSync(new URL('../../supabase/migrations/202609150002_public_submission_gateway.sql', import.meta.url), 'utf8')
  try {
    sql("begin; drop function public.submit_public_form(text,text,text); drop schema tll_submission_private cascade; drop policy submission_gateway_contact on public.contact_submissions; drop policy submission_gateway_supplement on public.supplement_submissions; create role tll_submission_test_inherited nologin; grant tll_submission_test_inherited to anon; grant select(email) on public.contact_submissions to tll_submission_test_inherited;" + migration)
    assert.fail('Expected inherited privilege preflight failure')
  } catch (error) {
    assert.ok(String(error.stderr).includes('Inherited inbox privileges remain'))
  }
  assert.equal(sql("select count(*) from pg_roles where rolname='tll_submission_test_inherited'"), '0')
  assert.equal(call(sign()).status, 'accepted')
  assert.equal(sql("select has_any_column_privilege('anon','public.contact_submissions','SELECT,INSERT,UPDATE,REFERENCES')"), 'f')
})
for (const defaultGrant of ['usage on schemas', 'select on tables']) test(`inherited default ${defaultGrant} on NEW private objects causes complete rollback`, () => {
  const migration = readFileSync(new URL('../../supabase/migrations/202609150002_public_submission_gateway.sql', import.meta.url), 'utf8')
  try {
    sql("begin; drop function public.submit_public_form(text,text,text); drop schema tll_submission_private cascade; drop policy submission_gateway_contact on public.contact_submissions; drop policy submission_gateway_supplement on public.supplement_submissions; create role tll_submission_test_defaults nologin; grant tll_submission_test_defaults to anon; alter default privileges for role postgres grant " + defaultGrant + " to tll_submission_test_defaults;" + migration)
    assert.fail('Expected inherited private-object ACL rejection')
  } catch (error) { assert.ok(String(error.stderr).includes('Private gateway privileges inherited')) }
  assert.equal(sql("select count(*) from pg_roles where rolname='tll_submission_test_defaults'"), '0')
  assert.throws(() => sql('set role anon; select count(*) from tll_submission_private.signing_keys'))
  assert.equal(call(sign()).status, 'accepted')
})
test('non-superuser schema owner can migrate with no lasting SET ROLE or CREATE authority', () => {
  let migration = readFileSync(new URL('../../supabase/migrations/202609150002_public_submission_gateway.sql', import.meta.url), 'utf8')
  migration = migration.replace(/^begin;$/m, '').replace(/^commit;$/m, '').replaceAll('tll_submission_owner', 'tll_submission_non_super_owner')
  const setup = "begin; drop function public.submit_public_form(text,text,text); drop schema tll_submission_private cascade; drop policy submission_gateway_contact on public.contact_submissions; drop policy submission_gateway_supplement on public.supplement_submissions; create role tll_submission_migrator nologin nosuperuser createrole; grant create on database tll_submission_test to tll_submission_migrator; alter schema public owner to tll_submission_migrator; alter table public.contact_submissions owner to tll_submission_migrator; alter table public.supplement_submissions owner to tll_submission_migrator; grant usage on schema extensions to tll_submission_migrator with grant option; set session authorization tll_submission_migrator;"
  const checks = "reset session authorization; select not has_schema_privilege('tll_submission_non_super_owner','public','CREATE') and not exists(select 1 from pg_auth_members where roleid='tll_submission_non_super_owner'::regrole or member='tll_submission_non_super_owner'::regrole) and not exists(select 1 from pg_roles where rolname='tll_submission_role_setup') and has_function_privilege('anon','public.submit_public_form(text,text,text)','EXECUTE') and has_function_privilege('authenticated','public.submit_public_form(text,text,text)','EXECUTE') and (select proowner='tll_submission_non_super_owner'::regrole from pg_proc where oid='public.submit_public_form(text,text,text)'::regprocedure); rollback;"
  assert.equal(sql(setup + migration + checks), 't')
  assert.equal(sql("select count(*) from pg_roles where rolname in ('tll_submission_migrator','tll_submission_non_super_owner')"), '0')
})
