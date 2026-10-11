-- Disabled additive account-operation custody. This creates no LOGIN,
-- credential, route, provider configuration or activation.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $preflight$
DECLARE installer name:=current_user; r text;
BEGIN
 IF current_user<>session_user OR current_setting('server_version_num')::int<170000
   OR to_regprocedure('tll_bridge_private.final_repository(text,jsonb)') IS NULL
   OR to_regprocedure('tll_customer_private.shopify_proof_repository(text,jsonb)') IS NULL
   OR to_regprocedure('tll_customer_private.final_lock()') IS NULL
   OR to_regprocedure('tll_bridge_private.gate()') IS NULL
   OR to_regclass('tll_bridge_private.account_generations') IS NOT NULL
   OR to_regclass('tll_bridge_private.account_operations') IS NOT NULL
   OR to_regprocedure('tll_bridge_private.account_lock()') IS NOT NULL
   OR to_regprocedure('tll_customer_private.account_token_source(uuid,uuid)') IS NOT NULL
   OR to_regprocedure('tll_bridge_private.account_repository(text,jsonb)') IS NOT NULL THEN
   RAISE EXCEPTION 'Account operations installation unavailable'; END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='tll_bridge_private.final_repository(text,jsonb)'::regprocedure)<>'6fdac5149231a4055ced04a1048ce43f'
   OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='tll_customer_private.shopify_proof_repository(text,jsonb)'::regprocedure)<>'7d95dcb1616833d24d52b380667ab1ce'
   OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='tll_customer_private.final_lock()'::regprocedure)<>'eb89fa4722b67e0cb54712cd232c1e2a'
   OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='tll_bridge_private.gate()'::regprocedure)<>'507ab740339ae86b72918cf43596472b' THEN
   RAISE EXCEPTION 'Reviewed account prerequisite source required'; END IF;
 FOREACH r IN ARRAY ARRAY['tll_bridge_owner','tll_customer_owner'] LOOP
   IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AND NOT EXISTS(SELECT FROM pg_auth_members
     WHERE roleid=r::regrole AND member=current_user::regrole AND admin_option AND NOT inherit_option AND NOT set_option) THEN
     RAISE EXCEPTION 'Reviewed owner upgrade authority required'; END IF;
   EXECUTE format('GRANT %I TO %I WITH INHERIT TRUE, SET TRUE',r,installer);
 END LOOP;
 PERFORM tll_bridge_private.gate();
 IF tll_bridge_private.operator_status()->'enabled'<>'false'::jsonb
   OR tll_broker_private.operator_status()->'enabled'<>'false'::jsonb
   OR tll_provisional_private.operator_status()->'enabled'<>'false'::jsonb
   OR tll_customer_private.operator_status()->'enabled'<>'false'::jsonb THEN
   RAISE EXCEPTION 'Disable account repositories before upgrade'; END IF;
END $preflight$;

CREATE SEQUENCE tll_bridge_private.account_fences AS bigint NO CYCLE;
CREATE TABLE tll_bridge_private.account_generations(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id),
 generation bigint NOT NULL DEFAULT 0 CHECK(generation>=0),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE tll_bridge_private.account_operations(
 operation_id uuid PRIMARY KEY,
 kind text NOT NULL CHECK(kind='orders'),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 session_id uuid NOT NULL,
 transaction_id uuid NOT NULL REFERENCES tll_bridge_private.finalizations(transaction_id),
 receipt_id uuid NOT NULL,
 generation bigint NOT NULL CHECK(generation>=0),
 fence bigint NOT NULL CHECK(fence>0),
 state text NOT NULL CHECK(state IN ('claimed','completed','held')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 lease_until timestamptz NOT NULL,
 completed_at timestamptz,
 CHECK(lease_until>created_at),
 CHECK((state='claimed')=(completed_at IS NULL))
);
CREATE UNIQUE INDEX account_one_active_orders_per_user
 ON tll_bridge_private.account_operations(user_id) WHERE state='claimed';

CREATE FUNCTION tll_bridge_private.account_lock() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $lock$
DECLARE enabled boolean; BEGIN SELECT c.enabled INTO STRICT enabled FROM tll_bridge_private.control c WHERE singleton FOR UPDATE; RETURN enabled; END $lock$;

-- The customer owner exposes one exact encrypted bundle. The bridge owner can
-- pass it to the server adapter but cannot decrypt it or read the proof table.
CREATE FUNCTION tll_customer_private.account_token_source(rid uuid,expected_receipt uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $source$
DECLARE enabled boolean; r tll_customer_private.shopify_proofs%ROWTYPE;
BEGIN
 SELECT c.enabled INTO STRICT enabled FROM tll_customer_private.control c WHERE singleton FOR UPDATE;
 IF NOT enabled THEN RETURN NULL; END IF;
 SELECT * INTO r FROM tll_customer_private.shopify_proofs
  WHERE transaction_id=rid AND receipt_id=expected_receipt AND state='verified'
    AND access_expires_at>clock_timestamp() AND tokens IS NOT NULL;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('transactionId',r.transaction_id,'receiptId',r.receipt_id,
   'shopId',r.shop_id,'issuer',r.issuer,'subject',r.subject,
   'innerPkceChallenge',r.inner_challenge,
   'verifiedAt',floor(extract(epoch FROM r.verified_at)*1000)::bigint,
   'proofExpiresAt',floor(extract(epoch FROM r.proof_expires_at)*1000)::bigint,
   'proofFence',r.fence::text,
   'accessExpiresAt',floor(extract(epoch FROM r.access_expires_at)*1000)::bigint,
   'tokens',r.tokens);
END $source$;

CREATE FUNCTION tll_bridge_private.account_repository(op text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $repository$
DECLARE enabled_bridge boolean; enabled_customer boolean; ts timestamptz:=clock_timestamp(); oid uuid; uid uuid; sid uuid;
 r tll_bridge_private.account_operations%ROWTYPE; final tll_bridge_private.finalizations%ROWTYPE;
 gen tll_bridge_private.account_generations%ROWTYPE; source jsonb; f bigint;
BEGIN
 IF op IS NULL OR op NOT IN ('claim_orders','finish_orders','hold_orders')
   OR jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>65536
   OR COALESCE(p->>'operationId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   OR COALESCE(p->>'userId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   OR COALESCE(p->>'sessionId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN
   RAISE EXCEPTION 'Invalid account operation request' USING ERRCODE='22023'; END IF;
 oid:=(p->>'operationId')::uuid; uid:=(p->>'userId')::uuid; sid:=(p->>'sessionId')::uuid;
 enabled_bridge:=tll_bridge_private.account_lock(); enabled_customer:=tll_customer_private.final_lock();

 IF op='hold_orders' THEN
   IF p-ARRAY['operationId','userId','sessionId','fence']<>'{}'::jsonb
     OR (p ? 'fence' AND COALESCE(p->>'fence','') !~ '^[1-9][0-9]{0,18}$') THEN
     RAISE EXCEPTION 'Invalid account operation hold' USING ERRCODE='22023'; END IF;
   SELECT * INTO r FROM tll_bridge_private.account_operations WHERE operation_id=oid FOR UPDATE;
   IF NOT FOUND OR r.user_id<>uid OR r.session_id<>sid OR r.state NOT IN ('claimed','completed')
     OR (p ? 'fence' AND r.fence::text<>p->>'fence') THEN RETURN jsonb_build_object('status','rejected'); END IF;
   UPDATE tll_bridge_private.account_operations SET state='held',completed_at=ts WHERE operation_id=oid;
   RETURN jsonb_build_object('status','held');
 END IF;

 IF NOT enabled_bridge OR NOT enabled_customer THEN RETURN jsonb_build_object('status','rejected'); END IF;
 IF p-ARRAY['operationId','userId','sessionId','fence']<>'{}'::jsonb
   OR (op='claim_orders' AND p ? 'fence')
   OR (op='finish_orders' AND COALESCE(p->>'fence','') !~ '^[1-9][0-9]{0,18}$') THEN
   RAISE EXCEPTION 'Invalid account operation payload' USING ERRCODE='22023'; END IF;

 INSERT INTO tll_bridge_private.account_generations(user_id) VALUES(uid) ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT gen FROM tll_bridge_private.account_generations WHERE user_id=uid FOR UPDATE;
 UPDATE tll_bridge_private.account_operations SET state='held',completed_at=ts
  WHERE user_id=uid AND state='claimed' AND lease_until<=ts;

 IF op='finish_orders' THEN
   SELECT * INTO r FROM tll_bridge_private.account_operations WHERE operation_id=oid FOR UPDATE;
   IF NOT FOUND OR r.kind<>'orders' OR r.user_id<>uid OR r.session_id<>sid OR r.state<>'claimed'
     OR r.fence::text<>p->>'fence' OR r.generation<>gen.generation OR r.lease_until<=ts THEN
     RETURN jsonb_build_object('status','rejected'); END IF;
   UPDATE tll_bridge_private.account_operations SET state='completed',completed_at=ts WHERE operation_id=oid;
   RETURN jsonb_build_object('status','completed');
 END IF;

 IF EXISTS(SELECT FROM tll_bridge_private.account_operations WHERE operation_id=oid)
   OR EXISTS(SELECT FROM tll_bridge_private.account_operations WHERE user_id=uid AND state='claimed')
   OR (SELECT count(*) FROM tll_bridge_private.account_operations)>=100000
   OR (SELECT count(*) FROM tll_bridge_private.account_operations WHERE user_id=uid)>=1000 THEN
   RETURN jsonb_build_object('status','rejected'); END IF;
 SELECT * INTO final FROM tll_bridge_private.finalizations
  WHERE user_id=uid AND state='reconciled' AND proof_receipt_id IS NOT NULL
  ORDER BY reconciled_at DESC,transaction_id DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','rejected'); END IF;
 source:=tll_customer_private.account_token_source(final.transaction_id,final.proof_receipt_id);
 IF source IS NULL OR source->>'transactionId' IS DISTINCT FROM final.transaction_id::text
   OR source->>'receiptId' IS DISTINCT FROM final.proof_receipt_id::text THEN RETURN jsonb_build_object('status','rejected'); END IF;
 f:=nextval('tll_bridge_private.account_fences');
 INSERT INTO tll_bridge_private.account_operations(operation_id,kind,user_id,session_id,transaction_id,receipt_id,generation,fence,state,created_at,lease_until)
  VALUES(oid,'orders',uid,sid,final.transaction_id,final.proof_receipt_id,gen.generation,f,'claimed',ts,ts+interval '30 seconds');
 RETURN jsonb_build_object('status','claimed','operationId',oid,'userId',uid,'sessionId',sid,
   'transactionId',final.transaction_id,'receiptId',final.proof_receipt_id,'generation',gen.generation::text,
   'fence',f::text,'leaseExpiresAt',floor(extract(epoch FROM (ts+interval '30 seconds'))*1000)::bigint,
   'tokenSource',source);
END $repository$;

DO $secure$
DECLARE installer name:=current_user; role_name text;
BEGIN
 ALTER SEQUENCE tll_bridge_private.account_fences OWNER TO tll_bridge_owner;
 ALTER TABLE tll_bridge_private.account_generations OWNER TO tll_bridge_owner;
 ALTER TABLE tll_bridge_private.account_operations OWNER TO tll_bridge_owner;
 ALTER TABLE tll_bridge_private.account_generations ENABLE ROW LEVEL SECURITY;
 ALTER TABLE tll_bridge_private.account_operations ENABLE ROW LEVEL SECURITY;
 ALTER FUNCTION tll_bridge_private.account_lock() OWNER TO tll_bridge_owner;
 ALTER FUNCTION tll_customer_private.account_token_source(uuid,uuid) OWNER TO tll_customer_owner;
 ALTER FUNCTION tll_bridge_private.account_repository(text,jsonb) OWNER TO tll_bridge_owner;
 REVOKE ALL ON TABLE tll_bridge_private.account_generations,tll_bridge_private.account_operations FROM PUBLIC;
 REVOKE ALL ON SEQUENCE tll_bridge_private.account_fences FROM PUBLIC;
 REVOKE ALL ON FUNCTION tll_bridge_private.account_lock() FROM PUBLIC;
 REVOKE ALL ON FUNCTION tll_customer_private.account_token_source(uuid,uuid) FROM PUBLIC;
 REVOKE ALL ON FUNCTION tll_bridge_private.account_repository(text,jsonb) FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION tll_customer_private.account_token_source(uuid,uuid) TO tll_bridge_owner;
 GRANT EXECUTE ON FUNCTION tll_bridge_private.account_repository(text,jsonb) TO tll_bridge_executor;
 FOREACH role_name IN ARRAY ARRAY['tll_bridge_owner','tll_customer_owner'] LOOP
   IF (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
     EXECUTE format('GRANT %I TO %I WITH ADMIN TRUE, INHERIT FALSE, SET FALSE',role_name,installer);
   ELSE EXECUTE format('REVOKE %I FROM %I GRANTED BY %I',role_name,installer,installer); END IF;
 END LOOP;
END $secure$;

DO $postflight$
DECLARE role_name text;
BEGIN
 IF tll_bridge_private.operator_status()->'enabled'<>'false'::jsonb
   OR tll_broker_private.operator_status()->'enabled'<>'false'::jsonb
   OR tll_provisional_private.operator_status()->'enabled'<>'false'::jsonb
   OR tll_customer_private.operator_status()->'enabled'<>'false'::jsonb THEN
   RAISE EXCEPTION 'Unexpected account operation activation'; END IF;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','tll_customer_executor','tll_bridge_executor'] LOOP
   IF has_table_privilege(role_name,'tll_bridge_private.account_generations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
     OR has_any_column_privilege(role_name,'tll_bridge_private.account_generations','SELECT,INSERT,UPDATE,REFERENCES')
     OR has_table_privilege(role_name,'tll_bridge_private.account_operations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
     OR has_any_column_privilege(role_name,'tll_bridge_private.account_operations','SELECT,INSERT,UPDATE,REFERENCES') THEN
     RAISE EXCEPTION 'Unexpected account operation data authority'; END IF;
 END LOOP;
 IF NOT has_function_privilege('tll_bridge_executor','tll_bridge_private.account_repository(text,jsonb)','EXECUTE')
   OR has_function_privilege('anon','tll_bridge_private.account_repository(text,jsonb)','EXECUTE')
   OR has_function_privilege('service_role','tll_bridge_private.account_repository(text,jsonb)','EXECUTE')
   OR NOT has_function_privilege('tll_bridge_owner','tll_customer_private.account_token_source(uuid,uuid)','EXECUTE')
   OR has_function_privilege('tll_bridge_executor','tll_customer_private.account_token_source(uuid,uuid)','EXECUTE')
   OR has_function_privilege('tll_bridge_executor','tll_bridge_private.account_lock()','EXECUTE') THEN
   RAISE EXCEPTION 'Unexpected account operation function authority'; END IF;
END $postflight$;
COMMIT;
