import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { admin, assertFixture } from './local-pg.mjs'

assertFixture()
for (const control of ['tll_bridge_private.control', 'tll_customer_private.control', 'tll_broker_private.control', 'tll_provisional_private.control'])
  assert.equal(admin(`SELECT enabled FROM ${control}`), 'f')
assert.equal(admin("SELECT r.rolname||':'||c.relrowsecurity||':'||coalesce(c.relacl::text,'NULL') FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid='tll_bridge_private.account_logouts'::regclass"),
  'tll_ao1_bridge_owner:true:{tll_ao1_bridge_owner=arwdDxtm/tll_ao1_bridge_owner}')
assert.equal(admin("SELECT attnotnull::text||':'||atttypid::regtype FROM pg_attribute WHERE attrelid='tll_bridge_private.account_generations'::regclass AND attname='logout_session_id'"), 'false:uuid')

const functions = admin(`SELECT n.nspname||'.'||p.proname||':'||r.rolname||':'||p.prosecdef||':'||array_to_string(p.proconfig,',')||':'||p.proacl::text
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid IN (
 'tll_customer_private.account_logout_token_source(uuid,uuid)'::regprocedure,'tll_broker_private.account_logout(uuid)'::regprocedure,
 'tll_provisional_private.account_logout(uuid)'::regprocedure,'tll_bridge_private.account_logout_repository(text,jsonb)'::regprocedure)
 ORDER BY n.nspname,p.proname`)
assert.equal(functions, [
  'tll_bridge_private.account_logout_repository:tll_ao1_bridge_owner:true:search_path=pg_catalog:{tll_ao1_bridge_owner=X/tll_ao1_bridge_owner,tll_ao1_bridge_executor=X/tll_ao1_bridge_owner}',
  'tll_broker_private.account_logout:tll_ao1_broker_owner:true:search_path=pg_catalog:{tll_ao1_broker_owner=X/tll_ao1_broker_owner,tll_ao1_bridge_owner=X/tll_ao1_broker_owner}',
  'tll_customer_private.account_logout_token_source:tll_ao1_customer_owner:true:search_path=pg_catalog:{tll_ao1_customer_owner=X/tll_ao1_customer_owner,tll_ao1_bridge_owner=X/tll_ao1_customer_owner}',
  'tll_provisional_private.account_logout:tll_ao1_provisional_owner:true:search_path=pg_catalog:{tll_ao1_provisional_owner=X/tll_ao1_provisional_owner,tll_ao1_bridge_owner=X/tll_ao1_provisional_owner}',
].join('\n'))
for (const role of ['anon', 'authenticated', 'service_role', 'tll_ao1_customer_executor', 'tll_ao1_broker_executor', 'tll_ao1_provisional_executor', 'tll_ao1_bridge_executor'])
  assert.equal(admin(`SELECT has_table_privilege('${role}','tll_bridge_private.account_logouts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')`), 'f')
assert.equal(admin("SELECT has_function_privilege('tll_ao1_bridge_executor','tll_bridge_private.account_logout_repository(text,jsonb)','EXECUTE')"), 't')
for (const helper of ['tll_customer_private.account_logout_token_source(uuid,uuid)', 'tll_broker_private.account_logout(uuid)', 'tll_provisional_private.account_logout(uuid)'])
  assert.equal(admin(`SELECT has_function_privilege('tll_ao1_bridge_executor','${helper}','EXECUTE')`), 'f')

const fingerprintSql = `SELECT jsonb_build_object(
 'relation',(SELECT to_jsonb(x) FROM (SELECT oid,relowner,relacl,relrowsecurity FROM pg_class WHERE oid='tll_bridge_private.account_logouts'::regclass)x),
 'column',(SELECT to_jsonb(x) FROM (SELECT attrelid,attname,atttypid,attnotnull FROM pg_attribute WHERE attrelid='tll_bridge_private.account_generations'::regclass AND attname='logout_session_id')x),
 'functions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.oid) FROM (SELECT oid,proowner,prosecdef,proconfig,proacl,prosrc FROM pg_proc WHERE oid IN
   ('tll_customer_private.account_logout_token_source(uuid,uuid)'::regprocedure,'tll_broker_private.account_logout(uuid)'::regprocedure,
    'tll_provisional_private.account_logout(uuid)'::regprocedure,'tll_bridge_private.account_logout_repository(text,jsonb)'::regprocedure))x),
 'members',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.roleid,x.member),'[]') FROM (SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members
   WHERE roleid IN ('tll_ao1_bridge_owner'::regrole,'tll_ao1_customer_owner'::regrole,'tll_ao1_broker_owner'::regrole,'tll_ao1_provisional_owner'::regrole))x),
 'rows',(SELECT count(*) FROM tll_bridge_private.account_logouts))`
const fingerprint = () => createHash('sha256').update(admin(fingerprintSql)).digest('hex'), before = fingerprint()
let migration = readFileSync(new URL('../../supabase/migrations/202609180016_customer_account_logout.sql', import.meta.url), 'utf8')
for (const [from, to] of Object.entries({ tll_customer_owner: 'tll_ao1_customer_owner', tll_customer_executor: 'tll_ao1_customer_executor',
  tll_broker_owner: 'tll_ao1_broker_owner', tll_broker_executor: 'tll_ao1_broker_executor', tll_provisional_owner: 'tll_ao1_provisional_owner',
  tll_provisional_executor: 'tll_ao1_provisional_executor', tll_bridge_owner: 'tll_ao1_bridge_owner', tll_bridge_executor: 'tll_ao1_bridge_executor' }))
  migration = migration.replace(new RegExp(`(?<![A-Za-z0-9_$])${from}(?![A-Za-z0-9_$])`, 'g'), to)
assert.throws(() => admin(migration), /Synthetic account SQL failed/); assert.equal(fingerprint(), before)
console.log(`PASS: migration 016 remains disabled and owner-isolated; only the bridge executor has the fixed logout RPC; repeat install left no drift; fingerprint ${before}`)
