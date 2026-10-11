import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { admin, assertFixture } from './local-pg.mjs'

assertFixture()

const controls = [
  'tll_bridge_private.control',
  'tll_broker_private.control',
  'tll_provisional_private.control',
  'tll_customer_private.control',
]
for (const control of controls) assert.equal(admin(`SELECT enabled FROM ${control}`), 'f')

const relations = admin(`
  SELECT c.oid::regclass||':'||r.rolname||':'||c.relrowsecurity||':'||coalesce(c.relacl::text,'NULL')
  FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner
  WHERE c.oid IN (
    'tll_bridge_private.finalizations'::regclass,
    'tll_bridge_private.final_operations'::regclass,
    'tll_bridge_private.final_fences'::regclass)
  ORDER BY c.oid::regclass::text`)
assert.equal(relations, [
  'tll_bridge_private.final_fences:tll_fr5_bridge_owner:false:{tll_fr5_bridge_owner=rwU/tll_fr5_bridge_owner}',
  'tll_bridge_private.final_operations:tll_fr5_bridge_owner:true:{tll_fr5_bridge_owner=arwdDxtm/tll_fr5_bridge_owner}',
  'tll_bridge_private.finalizations:tll_fr5_bridge_owner:true:{tll_fr5_bridge_owner=arwdDxtm/tll_fr5_bridge_owner}',
].join('\n'))

const functions = admin(`
  SELECT n.nspname||'.'||p.proname||':'||r.rolname||':'||p.prosecdef||':'||array_to_string(p.proconfig,',')||':'||p.proacl::text
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
  WHERE p.oid IN (
    'tll_customer_private.final_lock()'::regprocedure,
    'tll_customer_private.final_source(uuid)'::regprocedure,
    'tll_provisional_private.final_source(uuid,text)'::regprocedure,
    'tll_broker_private.final_source(uuid)'::regprocedure,
    'tll_broker_private.final_promote(uuid,text,uuid)'::regprocedure,
    'tll_bridge_private.final_repository(text,jsonb)'::regprocedure)
  ORDER BY n.nspname,p.proname`)
assert.equal(functions, [
  'tll_bridge_private.final_repository:tll_fr5_bridge_owner:true:search_path=pg_catalog:{tll_fr5_bridge_owner=X/tll_fr5_bridge_owner,tll_fr5_bridge_executor=X/tll_fr5_bridge_owner}',
  'tll_broker_private.final_promote:tll_fr5_broker_owner:true:search_path=pg_catalog:{tll_fr5_broker_owner=X/tll_fr5_broker_owner,tll_fr5_bridge_owner=X/tll_fr5_broker_owner}',
  'tll_broker_private.final_source:tll_fr5_broker_owner:true:search_path=pg_catalog:{tll_fr5_broker_owner=X/tll_fr5_broker_owner,tll_fr5_bridge_owner=X/tll_fr5_broker_owner}',
  'tll_customer_private.final_lock:tll_fr5_customer_owner:true:search_path=pg_catalog:{tll_fr5_customer_owner=X/tll_fr5_customer_owner,tll_fr5_bridge_owner=X/tll_fr5_customer_owner}',
  'tll_customer_private.final_source:tll_fr5_customer_owner:true:search_path=pg_catalog:{tll_fr5_customer_owner=X/tll_fr5_customer_owner,tll_fr5_bridge_owner=X/tll_fr5_customer_owner}',
  'tll_provisional_private.final_source:tll_fr5_provisional_owner:true:search_path=pg_catalog:{tll_fr5_provisional_owner=X/tll_fr5_provisional_owner,tll_fr5_bridge_owner=X/tll_fr5_provisional_owner}',
].join('\n'))

const constraints = admin(`
  SELECT conname||':'||contype::text||':'||pg_get_constraintdef(oid)
  FROM pg_constraint
  WHERE conname IN (
    'subjects_reservation_check','subjects_owner_state','subjects_shop_bound_unique',
    'subjects_bound_user_id_fkey','finalizations_user_id_fkey','final_operations_transaction_id_fkey')
  ORDER BY conname`)
assert.match(constraints, /subjects_reservation_check:c:CHECK \(\(reservation = ANY \(ARRAY\['provisional'::text, 'pending_migration'::text, 'bound'::text\]\)\)\)/)
assert.match(constraints, /subjects_owner_state:c:CHECK .*reservation = 'bound'::text.*bound_user_id IS NOT NULL/s)
assert.match(constraints, /subjects_shop_bound_unique:u:UNIQUE \(shop_id, bound_user_id\)/)
assert.match(constraints, /subjects_bound_user_id_fkey:f:FOREIGN KEY \(bound_user_id\) REFERENCES auth\.users\(id\)/)
assert.match(constraints, /finalizations_user_id_fkey:f:FOREIGN KEY \(user_id\) REFERENCES auth\.users\(id\)/)
assert.match(constraints, /final_operations_transaction_id_fkey:f:FOREIGN KEY \(transaction_id\) REFERENCES tll_bridge_private\.finalizations\(transaction_id\)/)

const deniedRoles = ['anon', 'authenticated', 'service_role', 'tll_fr5_customer_executor', 'tll_fr5_broker_executor', 'tll_fr5_provisional_executor']
for (const role of [...deniedRoles, 'tll_fr5_bridge_executor']) {
  assert.equal(admin(`SELECT has_table_privilege('${role}','tll_bridge_private.finalizations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')`), 'f')
  assert.equal(admin(`SELECT has_table_privilege('${role}','tll_bridge_private.final_operations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')`), 'f')
  assert.equal(admin(`SELECT has_sequence_privilege('${role}','tll_bridge_private.final_fences','USAGE,SELECT,UPDATE')`), 'f')
}
for (const role of deniedRoles) assert.equal(admin(`SELECT has_function_privilege('${role}','tll_bridge_private.final_repository(text,jsonb)','EXECUTE')`), 'f')
assert.equal(admin("SELECT has_function_privilege('tll_fr5_bridge_executor','tll_bridge_private.final_repository(text,jsonb)','EXECUTE')"), 't')

const bridgeOwner = 'tll_fr5_bridge_owner'
for (const relation of [
  'tll_customer_private.shopify_proofs',
  'tll_provisional_private.intents',
  'tll_broker_private.flows',
  'tll_broker_private.subjects',
]) assert.equal(admin(`SELECT has_table_privilege('${bridgeOwner}','${relation}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')`), 'f')
assert.equal(admin(`SELECT count(*) FROM pg_auth_members WHERE member='${bridgeOwner}'::regrole AND roleid IN ('tll_fr5_customer_owner'::regrole,'tll_fr5_provisional_owner'::regrole,'tll_fr5_broker_owner'::regrole)`), '0')

const fingerprintSql = `SELECT jsonb_build_object(
  'relations',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.oid) FROM (
    SELECT oid,relname,relowner,relacl,relrowsecurity FROM pg_class
    WHERE oid IN ('tll_bridge_private.finalizations'::regclass,'tll_bridge_private.final_operations'::regclass,'tll_bridge_private.final_fences'::regclass))x),
  'functions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.oid) FROM (
    SELECT oid,proowner,prosecdef,proconfig,proacl,prosrc FROM pg_proc WHERE oid IN (
      'tll_customer_private.final_lock()'::regprocedure,'tll_customer_private.final_source(uuid)'::regprocedure,
      'tll_provisional_private.final_source(uuid,text)'::regprocedure,'tll_broker_private.final_source(uuid)'::regprocedure,
      'tll_broker_private.final_promote(uuid,text,uuid)'::regprocedure,'tll_bridge_private.final_repository(text,jsonb)'::regprocedure))x),
  'constraints',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.oid) FROM (
    SELECT oid,conname,contype,convalidated,condeferrable,conkey,confrelid,confkey,conbin FROM pg_constraint
    WHERE conname IN ('subjects_reservation_check','subjects_owner_state','subjects_shop_bound_unique','subjects_bound_user_id_fkey','finalizations_user_id_fkey','final_operations_transaction_id_fkey'))x),
  'members',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.roleid,x.member),'[]') FROM (
    SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members
    WHERE roleid IN ('tll_fr5_bridge_owner'::regrole,'tll_fr5_customer_owner'::regrole,'tll_fr5_provisional_owner'::regrole,'tll_fr5_broker_owner'::regrole))x),
  'rows',(SELECT jsonb_build_array(
    (SELECT count(*) FROM tll_bridge_private.finalizations),
    (SELECT count(*) FROM tll_bridge_private.final_operations))))`
const fingerprint = () => createHash('sha256').update(admin(fingerprintSql)).digest('hex')
const before = fingerprint()

const guard = `DO $guard$ BEGIN
  IF EXISTS(SELECT FROM pg_class WHERE oid IN ('tll_bridge_private.finalizations'::regclass,'tll_bridge_private.final_operations'::regclass) AND NOT relrowsecurity)
    OR EXISTS(SELECT FROM pg_constraint WHERE conname IN ('subjects_reservation_check','subjects_owner_state','subjects_shop_bound_unique','subjects_bound_user_id_fkey','finalizations_user_id_fkey','final_operations_transaction_id_fkey') AND NOT convalidated)
    OR (SELECT count(*) FROM pg_constraint WHERE conname IN ('subjects_reservation_check','subjects_owner_state','subjects_shop_bound_unique','subjects_bound_user_id_fkey','finalizations_user_id_fkey','final_operations_transaction_id_fkey'))<>6
    OR EXISTS(SELECT FROM pg_proc WHERE oid IN ('tll_customer_private.final_lock()'::regprocedure,'tll_customer_private.final_source(uuid)'::regprocedure,'tll_provisional_private.final_source(uuid,text)'::regprocedure,'tll_broker_private.final_source(uuid)'::regprocedure,'tll_broker_private.final_promote(uuid,text,uuid)'::regprocedure,'tll_bridge_private.final_repository(text,jsonb)'::regprocedure) AND (NOT prosecdef OR proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']))
    OR has_table_privilege('anon','tll_bridge_private.finalizations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    OR has_sequence_privilege('tll_fr5_bridge_executor','tll_bridge_private.final_fences','USAGE,SELECT,UPDATE')
    OR has_function_privilege('anon','tll_customer_private.final_lock()','EXECUTE')
    OR has_function_privilege('tll_fr5_bridge_executor','tll_customer_private.final_lock()','EXECUTE')
    OR has_function_privilege('service_role','tll_bridge_private.final_repository(text,jsonb)','EXECUTE')
    OR NOT has_function_privilege('tll_fr5_bridge_executor','tll_bridge_private.final_repository(text,jsonb)','EXECUTE')
  THEN RAISE EXCEPTION 'Final authority graph mismatch'; END IF;
END $guard$;`

const mutations = [
  'GRANT SELECT ON tll_bridge_private.finalizations TO anon',
  'GRANT USAGE ON SEQUENCE tll_bridge_private.final_fences TO tll_fr5_bridge_executor',
  'GRANT EXECUTE ON FUNCTION tll_customer_private.final_lock() TO anon',
  'GRANT EXECUTE ON FUNCTION tll_customer_private.final_lock() TO tll_fr5_bridge_executor',
  'GRANT EXECUTE ON FUNCTION tll_bridge_private.final_repository(text,jsonb) TO service_role',
  'REVOKE EXECUTE ON FUNCTION tll_bridge_private.final_repository(text,jsonb) FROM tll_fr5_bridge_executor',
  'ALTER TABLE tll_bridge_private.finalizations DISABLE ROW LEVEL SECURITY',
  'ALTER FUNCTION tll_bridge_private.final_repository(text,jsonb) SECURITY INVOKER',
  'ALTER TABLE tll_bridge_private.finalizations DROP CONSTRAINT finalizations_user_id_fkey',
]
for (const mutation of mutations) {
  assert.throws(() => admin(`BEGIN; ${mutation}; ${guard} ROLLBACK;`), /Synthetic final SQL failed/)
  assert.equal(fingerprint(), before)
}

console.log(`PASS: migration 013 authority, ownership, RLS, auth.users bindings and exact function-only graph verified; ${mutations.length} rollback tamper probes rejected; fingerprint ${before}`)
