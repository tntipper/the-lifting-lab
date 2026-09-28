-- Disabled additive owner-wide account revocation. This creates no LOGIN,
-- credential, route, provider call, redirect or activation.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $preflight$
DECLARE installer name:=current_user; r text;
BEGIN
 IF current_user<>session_user OR current_setting('server_version_num')::int<170000
   OR to_regprocedure('tll_bridge_private.account_repository(text,jsonb)') IS NULL
   OR to_regprocedure('tll_bridge_private.terminal(uuid,text)') IS NULL
   OR to_regprocedure('tll_customer_private.account_token_source(uuid,uuid)') IS NULL
   OR to_regclass('tll_bridge_private.account_logouts') IS NOT NULL
   OR EXISTS(SELECT FROM pg_attribute WHERE attrelid='tll_bridge_private.account_generations'::regclass
     AND attname='logout_session_id' AND NOT attisdropped)
   OR to_regprocedure('tll_customer_private.account_logout_token_source(uuid,uuid)') IS NOT NULL
   OR to_regprocedure('tll_broker_private.account_logout(uuid)') IS NOT NULL
   OR to_regprocedure('tll_provisional_private.account_logout(uuid)') IS NOT NULL
   OR to_regprocedure('tll_bridge_private.account_logout_repository(text,jsonb)') IS NOT NULL THEN
   RAISE EXCEPTION 'Account logout installation unavailable'; END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='tll_bridge_private.account_repository(text,jsonb)'::regprocedure)<>'19b5b2d29289eaf3026454443418063d'
   OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='tll_bridge_private.account_lock()'::regprocedure)<>'1a1387ee95f4560c6888d238926cffcf'
   OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='tll_customer_private.account_token_source(uuid,uuid)'::regprocedure)<>'c56884908bf561fdad2eeb6169b94f44'
   OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='tll_bridge_private.terminal(uuid,text)'::regprocedure)<>'26be94ca67bcf38d9d4ba815707e407e'
   OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='tll_broker_private.bridge_terminal(jsonb,text)'::regprocedure)<>'30090d51de7a26db5740eeeb5f44e947'
   OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='tll_provisional_private.bridge_terminal(jsonb,text)'::regprocedure)<>'c3402aeaa075c957da839b82769e256a' THEN
   RAISE EXCEPTION 'Reviewed logout prerequisite source required'; END IF;
 FOREACH r IN ARRAY ARRAY['tll_bridge_owner','tll_customer_owner','tll_broker_owner','tll_provisional_owner'] LOOP
   IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AND NOT EXISTS(SELECT FROM pg_auth_members
     WHERE roleid=r::regrole AND member=current_user::regrole AND admin_option AND NOT inherit_option AND NOT set_option) THEN
     RAISE EXCEPTION 'Reviewed owner upgrade authority required'; END IF;
   EXECUTE format('GRANT %I TO %I WITH INHERIT TRUE, SET TRUE',r,installer);
 END LOOP;
 PERFORM tll_bridge_private.gate();
 IF tll_bridge_private.operator_status()->'enabled'<>'false'::jsonb OR tll_customer_private.operator_status()->'enabled'<>'false'::jsonb
   OR tll_broker_private.operator_status()->'enabled'<>'false'::jsonb OR tll_provisional_private.operator_status()->'enabled'<>'false'::jsonb THEN
   RAISE EXCEPTION 'Disable all account repositories before logout upgrade'; END IF;
END $preflight$;

ALTER TABLE tll_bridge_private.account_generations ADD COLUMN logout_session_id uuid;
CREATE TABLE tll_bridge_private.account_logouts(
 operation_id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth.users(id),
 session_id uuid NOT NULL,
 generation bigint NOT NULL CHECK(generation>0),
 transaction_id uuid,
 receipt_id uuid,
 upstream_hint boolean NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((transaction_id IS NULL)=(receipt_id IS NULL))
);

-- Logout may need an ID-token hint after the access token has expired. The
-- server adapter still receives only the original authenticated envelope.
CREATE FUNCTION tll_customer_private.account_logout_token_source(rid uuid,expected_receipt uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $source$
DECLARE r tll_customer_private.shopify_proofs%ROWTYPE;
BEGIN
 PERFORM 1 FROM tll_customer_private.control WHERE singleton FOR UPDATE;
 SELECT * INTO r FROM tll_customer_private.shopify_proofs
  WHERE transaction_id=rid AND receipt_id=expected_receipt AND state='verified' AND tokens IS NOT NULL;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('transactionId',r.transaction_id,'receiptId',r.receipt_id,
   'shopId',r.shop_id,'issuer',r.issuer,'subject',r.subject,'innerPkceChallenge',r.inner_challenge,
   'verifiedAt',floor(extract(epoch FROM r.verified_at)*1000)::bigint,
   'proofExpiresAt',floor(extract(epoch FROM r.proof_expires_at)*1000)::bigint,'proofFence',r.fence::text,
   'accessExpiresAt',floor(extract(epoch FROM r.access_expires_at)*1000)::bigint,'tokens',r.tokens);
END $source$;

CREATE FUNCTION tll_broker_private.account_logout(uid uuid) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $logout$
DECLARE changed bigint;
BEGIN
 PERFORM 1 FROM tll_broker_private.control WHERE singleton FOR UPDATE;
 PERFORM 1 FROM tll_broker_private.subjects WHERE bound_user_id=uid OR pending_user_id=uid FOR UPDATE;
 UPDATE tll_broker_private.flows SET status='cancelled',generation=generation+1,
   fence=nextval('tll_broker_private.fences')
  WHERE status NOT IN ('held','cancelled') AND (
    sub IN (SELECT sub FROM tll_broker_private.subjects WHERE bound_user_id=uid OR pending_user_id=uid)
    OR registration->'target'->>'userId'=uid::text);
 GET DIAGNOSTICS changed=ROW_COUNT; RETURN changed;
END $logout$;

CREATE FUNCTION tll_provisional_private.account_logout(uid uuid) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $logout$
DECLARE changed bigint;
BEGIN
 PERFORM 1 FROM tll_provisional_private.control WHERE singleton FOR UPDATE;
 UPDATE tll_provisional_private.intents SET state='cancelled',material=NULL,generation=generation+1,
   fence=nextval('tll_provisional_private.fences')
  WHERE state NOT IN ('held','cancelled') AND metadata->'original'->>'userId'=uid::text;
 GET DIAGNOSTICS changed=ROW_COUNT; RETURN changed;
END $logout$;

CREATE FUNCTION tll_bridge_private.account_logout_repository(op text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $repository$
DECLARE oid uuid; uid uuid; sid uuid; ts timestamptz:=clock_timestamp(); source jsonb;
 prior tll_bridge_private.account_logouts%ROWTYPE; gen tll_bridge_private.account_generations%ROWTYPE;
 final tll_bridge_private.finalizations%ROWTYPE; rid uuid; next_generation bigint;
BEGIN
 IF op IS DISTINCT FROM 'logout' OR jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>65536
   OR p-ARRAY['operationId','userId','sessionId']<>'{}'::jsonb
   OR COALESCE(p->>'operationId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   OR COALESCE(p->>'userId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   OR COALESCE(p->>'sessionId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN
   RAISE EXCEPTION 'Invalid account logout request' USING ERRCODE='22023'; END IF;
 oid:=(p->>'operationId')::uuid; uid:=(p->>'userId')::uuid; sid:=(p->>'sessionId')::uuid;
 PERFORM tll_bridge_private.account_lock(); PERFORM tll_customer_private.final_lock();
 SELECT * INTO prior FROM tll_bridge_private.account_logouts WHERE operation_id=oid;
 IF FOUND THEN
   IF prior.user_id<>uid OR prior.session_id<>sid THEN RETURN jsonb_build_object('status','rejected'); END IF;
   RETURN jsonb_build_object('status','local_revoked','operationId',oid,'userId',uid,'sessionId',sid,
     'generation',prior.generation::text,'upstreamLogout','not_required');
 END IF;
 INSERT INTO tll_bridge_private.account_generations(user_id) VALUES(uid) ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT gen FROM tll_bridge_private.account_generations WHERE user_id=uid FOR UPDATE;
 IF gen.logout_session_id=sid THEN
   INSERT INTO tll_bridge_private.account_logouts(operation_id,user_id,session_id,generation,upstream_hint)
    VALUES(oid,uid,sid,gen.generation,false);
   RETURN jsonb_build_object('status','local_revoked','operationId',oid,'userId',uid,'sessionId',sid,
     'generation',gen.generation::text,'upstreamLogout','not_required');
 END IF;

 SELECT * INTO final FROM tll_bridge_private.finalizations WHERE user_id=uid AND state='reconciled'
  ORDER BY reconciled_at DESC,transaction_id DESC LIMIT 1 FOR UPDATE;
 IF FOUND THEN source:=tll_customer_private.account_logout_token_source(final.transaction_id,final.proof_receipt_id); END IF;
 next_generation:=gen.generation+1;
 UPDATE tll_bridge_private.account_generations SET generation=next_generation,logout_session_id=sid,updated_at=ts WHERE user_id=uid;
 UPDATE tll_bridge_private.account_operations SET state='held',completed_at=COALESCE(completed_at,ts)
  WHERE user_id=uid AND state IN ('claimed','completed');

 FOR rid IN
   SELECT transaction_id FROM tll_bridge_private.finalizations WHERE user_id=uid
   UNION SELECT id FROM tll_bridge_private.grants WHERE source_snapshot->'metadata'->'original'->>'userId'=uid::text
 LOOP PERFORM tll_bridge_private.terminal(rid,'cancelled'); END LOOP;
 UPDATE tll_bridge_private.finalizations SET state='held',generation=generation+1,
   fence=nextval('tll_bridge_private.final_fences'),user_id=NULL,identity_id=NULL,authenticated_at=NULL,
   checked_at=NULL,session_expires_at=NULL,session_material=NULL,reconciled_at=NULL WHERE user_id=uid;
 UPDATE tll_bridge_private.grants SET state='cancelled',release_hash=NULL
  WHERE source_snapshot->'metadata'->'original'->>'userId'=uid::text AND state NOT IN ('held','cancelled');
 PERFORM tll_broker_private.account_logout(uid); PERFORM tll_provisional_private.account_logout(uid);

 INSERT INTO tll_bridge_private.account_logouts(operation_id,user_id,session_id,generation,transaction_id,receipt_id,upstream_hint,created_at)
  VALUES(oid,uid,sid,next_generation,final.transaction_id,final.proof_receipt_id,source IS NOT NULL,ts);
 RETURN jsonb_build_object('status','local_revoked','operationId',oid,'userId',uid,'sessionId',sid,
   'generation',next_generation::text,'upstreamLogout',CASE WHEN source IS NULL THEN 'not_required' ELSE 'pending' END,
   'tokenSource',source);
END $repository$;

DO $secure$
DECLARE installer name:=current_user; role_name text;
BEGIN
 ALTER TABLE tll_bridge_private.account_logouts OWNER TO tll_bridge_owner;
 ALTER TABLE tll_bridge_private.account_logouts ENABLE ROW LEVEL SECURITY;
 ALTER FUNCTION tll_customer_private.account_logout_token_source(uuid,uuid) OWNER TO tll_customer_owner;
 ALTER FUNCTION tll_broker_private.account_logout(uuid) OWNER TO tll_broker_owner;
 ALTER FUNCTION tll_provisional_private.account_logout(uuid) OWNER TO tll_provisional_owner;
 ALTER FUNCTION tll_bridge_private.account_logout_repository(text,jsonb) OWNER TO tll_bridge_owner;
 REVOKE ALL ON TABLE tll_bridge_private.account_logouts FROM PUBLIC;
 REVOKE ALL ON FUNCTION tll_customer_private.account_logout_token_source(uuid,uuid),tll_broker_private.account_logout(uuid),
   tll_provisional_private.account_logout(uuid),tll_bridge_private.account_logout_repository(text,jsonb) FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION tll_customer_private.account_logout_token_source(uuid,uuid),tll_broker_private.account_logout(uuid),
   tll_provisional_private.account_logout(uuid) TO tll_bridge_owner;
 GRANT EXECUTE ON FUNCTION tll_bridge_private.account_logout_repository(text,jsonb) TO tll_bridge_executor;
 FOREACH role_name IN ARRAY ARRAY['tll_bridge_owner','tll_customer_owner','tll_broker_owner','tll_provisional_owner'] LOOP
   IF (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
     EXECUTE format('GRANT %I TO %I WITH ADMIN TRUE, INHERIT FALSE, SET FALSE',role_name,installer);
   ELSE EXECUTE format('REVOKE %I FROM %I GRANTED BY %I',role_name,installer,installer); END IF;
 END LOOP;
END $secure$;

DO $postflight$
DECLARE role_name text;
BEGIN
 IF tll_bridge_private.operator_status()->'enabled'<>'false'::jsonb OR tll_customer_private.operator_status()->'enabled'<>'false'::jsonb
   OR tll_broker_private.operator_status()->'enabled'<>'false'::jsonb OR tll_provisional_private.operator_status()->'enabled'<>'false'::jsonb THEN
   RAISE EXCEPTION 'Unexpected account logout activation'; END IF;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','tll_customer_executor','tll_broker_executor','tll_provisional_executor','tll_bridge_executor'] LOOP
   IF has_table_privilege(role_name,'tll_bridge_private.account_logouts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
     OR has_any_column_privilege(role_name,'tll_bridge_private.account_logouts','SELECT,INSERT,UPDATE,REFERENCES') THEN
     RAISE EXCEPTION 'Unexpected account logout data authority'; END IF;
 END LOOP;
 IF NOT has_function_privilege('tll_bridge_executor','tll_bridge_private.account_logout_repository(text,jsonb)','EXECUTE')
   OR has_function_privilege('service_role','tll_bridge_private.account_logout_repository(text,jsonb)','EXECUTE')
   OR has_function_privilege('tll_bridge_executor','tll_customer_private.account_logout_token_source(uuid,uuid)','EXECUTE')
   OR has_function_privilege('tll_bridge_executor','tll_broker_private.account_logout(uuid)','EXECUTE')
   OR has_function_privilege('tll_bridge_executor','tll_provisional_private.account_logout(uuid)','EXECUTE') THEN
   RAISE EXCEPTION 'Unexpected account logout function authority'; END IF;
END $postflight$;
COMMIT;
