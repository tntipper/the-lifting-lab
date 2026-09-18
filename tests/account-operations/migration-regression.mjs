import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { admin, assertFixture } from './local-pg.mjs'

assertFixture()
for (const control of ['tll_bridge_private.control', 'tll_customer_private.control']) assert.equal(admin(`SELECT enabled FROM ${control}`), 'f')

const relations = admin(`SELECT c.oid::regclass||':'||r.rolname||':'||c.relrowsecurity||':'||coalesce(c.relacl::text,'NULL')
 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid IN (
 'tll_bridge_private.account_fences'::regclass,'tll_bridge_private.account_generations'::regclass,'tll_bridge_private.account_operations'::regclass)
 ORDER BY c.oid::regclass::text`)
assert.equal(relations, [
  'tll_bridge_private.account_fences:tll_ao1_bridge_owner:false:{tll_ao1_bridge_owner=rwU/tll_ao1_bridge_owner}',
  'tll_bridge_private.account_generations:tll_ao1_bridge_owner:true:{tll_ao1_bridge_owner=arwdDxtm/tll_ao1_bridge_owner}',
  'tll_bridge_private.account_operations:tll_ao1_bridge_owner:true:{tll_ao1_bridge_owner=arwdDxtm/tll_ao1_bridge_owner}',
].join('\n'))

const functions = admin(`SELECT n.nspname||'.'||p.proname||':'||r.rolname||':'||p.prosecdef||':'||array_to_string(p.proconfig,',')||':'||p.proacl::text
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
 WHERE p.oid IN ('tll_bridge_private.account_lock()'::regprocedure,'tll_customer_private.account_token_source(uuid,uuid)'::regprocedure,
 'tll_bridge_private.account_repository(text,jsonb)'::regprocedure) ORDER BY n.nspname,p.proname`)
assert.equal(functions, [
  'tll_bridge_private.account_lock:tll_ao1_bridge_owner:true:search_path=pg_catalog:{tll_ao1_bridge_owner=X/tll_ao1_bridge_owner}',
  'tll_bridge_private.account_repository:tll_ao1_bridge_owner:true:search_path=pg_catalog:{tll_ao1_bridge_owner=X/tll_ao1_bridge_owner,tll_ao1_bridge_executor=X/tll_ao1_bridge_owner}',
  'tll_customer_private.account_token_source:tll_ao1_customer_owner:true:search_path=pg_catalog:{tll_ao1_customer_owner=X/tll_ao1_customer_owner,tll_ao1_bridge_owner=X/tll_ao1_customer_owner}',
].join('\n'))

for (const role of ['anon', 'authenticated', 'service_role', 'tll_ao1_customer_executor', 'tll_ao1_bridge_executor']) {
  for (const relation of ['account_generations', 'account_operations']) assert.equal(admin(`SELECT has_table_privilege('${role}','tll_bridge_private.${relation}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')`), 'f')
  assert.equal(admin(`SELECT has_sequence_privilege('${role}','tll_bridge_private.account_fences','USAGE,SELECT,UPDATE')`), 'f')
}
assert.equal(admin("SELECT has_function_privilege('tll_ao1_bridge_executor','tll_bridge_private.account_repository(text,jsonb)','EXECUTE')"), 't')
assert.equal(admin("SELECT has_function_privilege('tll_ao1_bridge_executor','tll_customer_private.account_token_source(uuid,uuid)','EXECUTE')"), 'f')
assert.equal(admin("SELECT count(*) FROM pg_auth_members WHERE member='tll_ao1_bridge_owner'::regrole AND roleid='tll_ao1_customer_owner'::regrole"), '0')

const fingerprintSql = `SELECT jsonb_build_object(
 'relations',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.oid) FROM (SELECT oid,relowner,relacl,relrowsecurity FROM pg_class WHERE oid IN
   ('tll_bridge_private.account_fences'::regclass,'tll_bridge_private.account_generations'::regclass,'tll_bridge_private.account_operations'::regclass))x),
 'functions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.oid) FROM (SELECT oid,proowner,prosecdef,proconfig,proacl,prosrc FROM pg_proc WHERE oid IN
   ('tll_bridge_private.account_lock()'::regprocedure,'tll_customer_private.account_token_source(uuid,uuid)'::regprocedure,'tll_bridge_private.account_repository(text,jsonb)'::regprocedure))x),
 'members',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.roleid,x.member),'[]') FROM (SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members
   WHERE roleid IN ('tll_ao1_bridge_owner'::regrole,'tll_ao1_customer_owner'::regrole))x),
 'rows',(SELECT jsonb_build_array((SELECT count(*) FROM tll_bridge_private.account_generations),(SELECT count(*) FROM tll_bridge_private.account_operations))) )`
const fingerprint = () => createHash('sha256').update(admin(fingerprintSql)).digest('hex'), before = fingerprint()
let migration = readFileSync(new URL('../../supabase/migrations/202609180015_customer_account_operations.sql', import.meta.url), 'utf8')
for (const [from, to] of Object.entries({ tll_customer_owner: 'tll_ao1_customer_owner', tll_customer_executor: 'tll_ao1_customer_executor', tll_bridge_owner: 'tll_ao1_bridge_owner', tll_bridge_executor: 'tll_ao1_bridge_executor' }))
  migration = migration.replace(new RegExp(`(?<![A-Za-z0-9_$])${from}(?![A-Za-z0-9_$])`, 'g'), to)
assert.throws(() => admin(migration), /Synthetic account SQL failed/)
assert.equal(fingerprint(), before)
console.log(`PASS: migration 015 remains disabled, owner-isolated and fixed-RPC only; repeat install was refused without catalog/data drift; fingerprint ${before}`)
