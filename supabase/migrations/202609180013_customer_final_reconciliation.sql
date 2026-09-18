-- Disabled additive final reconciliation store. No LOGIN, credential, route,
-- provider configuration, auth-table write or activation is created.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preflight$
DECLARE installer name:=current_user; r text;
BEGIN
 IF current_user<>session_user OR current_setting('server_version_num')::int<170000
   OR to_regprocedure('tll_bridge_private.repository(text,jsonb)') IS NULL
   OR to_regprocedure('tll_customer_private.shopify_proof_repository(text,jsonb)') IS NULL
   OR to_regclass('tll_bridge_private.finalizations') IS NOT NULL
   OR to_regprocedure('tll_bridge_private.final_repository(text,jsonb)') IS NOT NULL THEN
   RAISE EXCEPTION 'Final reconciliation installation unavailable'; END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='tll_bridge_private.repository(text,jsonb)'::regprocedure)<>'5ab7163c673663e76a6b2e071faecd8c'
   OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='tll_broker_private.repository(text,jsonb)'::regprocedure)<>'3a73033597ae0b514f29c66b6b5f6bf8'
   OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='tll_provisional_private.repository(text,jsonb)'::regprocedure)<>'c81cd90f775d744f0f7b0b466359a7d6'
   OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='tll_customer_private.shopify_proof_repository(text,jsonb)'::regprocedure)<>'7d95dcb1616833d24d52b380667ab1ce'
   OR NOT EXISTS(SELECT FROM pg_constraint WHERE conrelid='tll_provisional_private.intents'::regclass
     AND conname='provisional_browser_once' AND contype='u' AND convalidated AND NOT condeferrable) THEN
   RAISE EXCEPTION 'Reviewed final prerequisite source required'; END IF;
 FOREACH r IN ARRAY ARRAY['tll_bridge_owner','tll_broker_owner','tll_provisional_owner','tll_customer_owner'] LOOP
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
   RAISE EXCEPTION 'Disable all customer repositories before final upgrade'; END IF;
END $preflight$;

ALTER TABLE tll_broker_private.subjects DROP CONSTRAINT subjects_reservation_check;
ALTER TABLE tll_broker_private.subjects DROP CONSTRAINT subjects_check;
ALTER TABLE tll_broker_private.subjects ADD COLUMN bound_user_id uuid REFERENCES auth.users(id);
ALTER TABLE tll_broker_private.subjects ADD CONSTRAINT subjects_reservation_check CHECK(reservation IN ('provisional','pending_migration','bound'));
ALTER TABLE tll_broker_private.subjects ADD CONSTRAINT subjects_owner_state CHECK(
 (reservation='provisional' AND pending_user_id IS NULL AND bound_user_id IS NULL)
 OR(reservation='pending_migration' AND pending_user_id IS NOT NULL AND bound_user_id IS NULL)
 OR(reservation='bound' AND pending_user_id IS NULL AND bound_user_id IS NOT NULL));
ALTER TABLE tll_broker_private.subjects ADD CONSTRAINT subjects_shop_bound_unique UNIQUE(shop_id,bound_user_id);

CREATE SEQUENCE tll_bridge_private.final_fences AS bigint NO CYCLE;
CREATE TABLE tll_bridge_private.finalizations(
 transaction_id uuid PRIMARY KEY,
 browser_hash text NOT NULL CHECK(browser_hash ~ '^[a-f0-9]{64}$'),
 callback_hash text NOT NULL UNIQUE CHECK(callback_hash ~ '^[a-f0-9]{64}$'),
 state text NOT NULL CHECK(state IN ('exchanging','reconciled','held')),
 fence bigint NOT NULL CHECK(fence>0), generation bigint NOT NULL DEFAULT 0 CHECK(generation>=0),
 claim_operation uuid UNIQUE, finish_operation uuid UNIQUE,
 mode text CHECK(mode IN ('sign_in','migration')), original_user_id uuid,
 config_hash text CHECK(config_hash ~ '^[a-f0-9]{64}$'), intent_hash text CHECK(intent_hash ~ '^[a-f0-9]{64}$'),
 application_challenge text CHECK(application_challenge ~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$'),
 callback_material jsonb, provisional_material jsonb,
 proof_receipt_id uuid, reserved_subject text CHECK(reserved_subject ~ '^tllb_[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$'),
 expires_at timestamptz, user_id uuid REFERENCES auth.users(id), identity_id uuid,
 authenticated_at timestamptz, checked_at timestamptz, session_expires_at timestamptz, session_material jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), reconciled_at timestamptz,
 CHECK(state='held' OR (claim_operation IS NOT NULL AND mode IS NOT NULL AND config_hash IS NOT NULL AND intent_hash IS NOT NULL
   AND application_challenge IS NOT NULL AND callback_material IS NOT NULL AND provisional_material IS NOT NULL
   AND proof_receipt_id IS NOT NULL AND reserved_subject IS NOT NULL AND expires_at>created_at)),
 CHECK((mode='migration')=(original_user_id IS NOT NULL)),
 CHECK(state<>'reconciled' OR (finish_operation IS NOT NULL AND user_id IS NOT NULL AND identity_id IS NOT NULL
   AND authenticated_at IS NOT NULL AND checked_at IS NOT NULL AND session_expires_at>checked_at
   AND session_material IS NOT NULL AND reconciled_at IS NOT NULL)),
 CHECK(state='reconciled' OR (user_id IS NULL AND identity_id IS NULL AND authenticated_at IS NULL AND checked_at IS NULL
   AND session_expires_at IS NULL AND session_material IS NULL AND reconciled_at IS NULL)),
 CHECK(callback_material IS NULL OR tll_customer_private.envelope_valid(callback_material)),
 CHECK(provisional_material IS NULL OR tll_customer_private.envelope_valid(provisional_material)),
 CHECK(session_material IS NULL OR tll_customer_private.envelope_valid(session_material))
);
CREATE TABLE tll_bridge_private.final_operations(
 id uuid PRIMARY KEY, transaction_id uuid NOT NULL REFERENCES tll_bridge_private.finalizations(transaction_id),
 phase text NOT NULL CHECK(phase IN ('claim','finish','hold')), generation bigint NOT NULL,
 claim_fence bigint NOT NULL, completed boolean NOT NULL, created_at timestamptz NOT NULL
);

-- Owner-held cross-store snapshots. The bridge owner receives EXECUTE only;
-- it never receives table authority or membership in another owner role.
CREATE FUNCTION tll_customer_private.final_lock() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE enabled boolean; BEGIN SELECT c.enabled INTO STRICT enabled FROM tll_customer_private.control c WHERE singleton FOR UPDATE; RETURN enabled; END $f$;
CREATE FUNCTION tll_customer_private.final_source(rid uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $f$
 SELECT jsonb_build_object('receiptId',receipt_id,'shopId',shop_id,'issuer',issuer,'subject',subject,
   'proofExpiresAt',floor(extract(epoch FROM proof_expires_at)*1000)::bigint)
 FROM tll_customer_private.shopify_proofs WHERE transaction_id=rid AND state='verified' AND proof_expires_at>clock_timestamp()
$f$;
CREATE FUNCTION tll_provisional_private.final_source(rid uuid,browser text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $f$
 SELECT jsonb_build_object('browserHash',browser_hash,'configHash',config_hash,'intentHash',intent_hash,
   'applicationPkceChallenge',application_challenge,'metadata',metadata,'material',material,
   'expiresAt',floor(extract(epoch FROM expires_at)*1000)::bigint)
 FROM tll_provisional_private.intents WHERE id=rid AND browser_hash=browser AND state='admitted' AND expires_at>clock_timestamp()
$f$;
CREATE FUNCTION tll_broker_private.final_source(rid uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $f$
 SELECT jsonb_build_object('status',f.status,'sub',f.sub,'receiptId',f.proof_receipt_id,'shopifyProof',f.shopify_proof,
   'registration',f.registration,'hardDeadline',floor(extract(epoch FROM f.hard_deadline)*1000)::bigint,
   'reservation',s.reservation,'pendingUserId',s.pending_user_id,'boundUserId',s.bound_user_id)
 FROM tll_broker_private.flows f JOIN tll_broker_private.subjects s ON s.sub=f.sub
 WHERE f.id=rid AND f.status='consumed' AND f.hard_deadline>clock_timestamp()
$f$;
CREATE FUNCTION tll_broker_private.final_promote(rid uuid,stable_sub text,final_user uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE f tll_broker_private.flows%ROWTYPE; s tll_broker_private.subjects%ROWTYPE; mode text; target uuid;
BEGIN
 SELECT * INTO f FROM tll_broker_private.flows WHERE id=rid AND status='consumed' AND sub=stable_sub AND hard_deadline>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO s FROM tll_broker_private.subjects WHERE sub=stable_sub FOR UPDATE; mode:=f.registration->>'mode';
 target:=NULLIF(f.registration->'target'->>'userId','')::uuid;
 IF s.reservation='bound' THEN RETURN s.bound_user_id=final_user; END IF;
 IF (mode='sign_in' AND (target IS NOT NULL OR s.reservation<>'provisional'))
   OR(mode='migration' AND (target IS DISTINCT FROM final_user OR s.reservation<>'pending_migration' OR s.pending_user_id IS DISTINCT FROM final_user)) THEN RETURN false; END IF;
 IF EXISTS(SELECT FROM tll_broker_private.subjects x WHERE x.shop_id=s.shop_id AND x.bound_user_id=final_user AND x.sub<>stable_sub) THEN RETURN false; END IF;
 UPDATE tll_broker_private.subjects SET reservation='bound',pending_user_id=NULL,bound_user_id=final_user WHERE sub=stable_sub;
 RETURN true;
END $f$;

CREATE FUNCTION tll_bridge_private.final_repository(op text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $repository$
DECLARE gate jsonb; enabled_customer boolean; r tll_bridge_private.finalizations%ROWTYPE; previous tll_bridge_private.final_operations%ROWTYPE; g tll_bridge_private.grants%ROWTYPE;
 ps jsonb; bs jsonb; cs jsonb; meta jsonb; proof jsonb; reg jsonb; rid uuid; oid uuid; ts timestamptz:=clock_timestamp(); f bigint;
 expiry timestamptz; authenticated timestamptz; checked timestamptz; session_expiry timestamptz; final_user uuid; final_identity uuid;
BEGIN
 IF op IS NULL OR op NOT IN ('claim','finish','release','hold') OR jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>65536
   OR NOT tll_provisional_private.uuid_valid(p->>'transactionId') OR (op<>'finish' AND NOT tll_provisional_private.hash_valid(p->>'browserHash'))
   OR NOT tll_provisional_private.hash_valid(p->>'callbackHash') OR (op<>'release' AND NOT tll_provisional_private.uuid_valid(p->>'operationId')) THEN
   RAISE EXCEPTION 'Invalid final reconciliation request' USING ERRCODE='22023'; END IF;
 gate:=tll_bridge_private.gate(); enabled_customer:=tll_customer_private.final_lock(); rid:=(p->>'transactionId')::uuid;
 SELECT * INTO r FROM tll_bridge_private.finalizations WHERE transaction_id=rid FOR UPDATE;
 IF op='release' THEN
   IF gate->'enabled'<>'true'::jsonb OR NOT enabled_customer OR p-ARRAY['transactionId','browserHash','callbackHash']<>'{}'::jsonb OR r.state<>'reconciled' OR r.browser_hash<>p->>'browserHash'
     OR r.callback_hash<>p->>'callbackHash' OR r.session_expires_at<=ts THEN RETURN jsonb_build_object('status','rejected'); END IF;
   RETURN jsonb_build_object('status','reconciled','transactionId',r.transaction_id,'callbackHash',r.callback_hash,
     'userId',r.user_id,'identityId',r.identity_id,'reservedSubject',r.reserved_subject,'generation',r.generation::text,'sessionMaterial',r.session_material);
 END IF;
 oid:=(p->>'operationId')::uuid; SELECT * INTO previous FROM tll_bridge_private.final_operations WHERE id=oid;
 IF op='hold' THEN
   IF p-ARRAY['operationId','transactionId','browserHash','callbackHash','fence','generation']<>'{}'::jsonb
     OR (p ? 'fence')<>(p ? 'generation') OR (p ? 'fence' AND (COALESCE(p->>'fence','')!~'^[1-9][0-9]{0,18}$' OR COALESCE(p->>'generation','')!~'^(0|[1-9][0-9]{0,18})$'))
     OR previous.id IS NOT NULL OR (r.transaction_id IS NOT NULL AND (r.browser_hash<>p->>'browserHash' OR r.callback_hash<>p->>'callbackHash'))
     OR (p ? 'fence' AND (r.transaction_id IS NULL OR r.fence::text<>p->>'fence' OR r.generation::text<>p->>'generation')) THEN RETURN jsonb_build_object('status','rejected'); END IF;
   IF r.transaction_id IS NULL THEN
     f:=nextval('tll_bridge_private.final_fences');
     INSERT INTO tll_bridge_private.finalizations(transaction_id,browser_hash,callback_hash,state,fence) VALUES(rid,p->>'browserHash',p->>'callbackHash','held',f);
     INSERT INTO tll_bridge_private.final_operations VALUES(oid,rid,'hold',0,f,true,ts);
   ELSIF r.state<>'held' THEN
     INSERT INTO tll_bridge_private.final_operations VALUES(oid,rid,'hold',r.generation,r.fence,true,ts);
     UPDATE tll_bridge_private.finalizations SET state='held',generation=generation+1,fence=nextval('tll_bridge_private.final_fences'),
       callback_material=NULL,provisional_material=NULL,user_id=NULL,identity_id=NULL,authenticated_at=NULL,checked_at=NULL,
       session_expires_at=NULL,session_material=NULL,reconciled_at=NULL WHERE transaction_id=rid;
   ELSE RETURN jsonb_build_object('status','rejected'); END IF;
   PERFORM tll_bridge_private.terminal(rid,'held'); RETURN jsonb_build_object('status','held');
 END IF;
 IF gate->'enabled'<>'true'::jsonb OR NOT enabled_customer THEN RETURN jsonb_build_object('status','rejected'); END IF;
 IF op='claim' THEN
   IF p-ARRAY['operationId','transactionId','browserHash','callbackHash','callbackMaterial']<>'{}'::jsonb OR previous.id IS NOT NULL OR r.transaction_id IS NOT NULL
     OR NOT tll_customer_private.envelope_valid(p->'callbackMaterial') THEN RETURN jsonb_build_object('status','rejected'); END IF;
   SELECT * INTO g FROM tll_bridge_private.grants WHERE id=rid;
   ps:=tll_provisional_private.final_source(rid,p->>'browserHash'); bs:=tll_broker_private.final_source(rid); cs:=tll_customer_private.final_source(rid);
   IF g.id IS NULL OR g.state<>'browser_admitted' OR g.expires_at<=ts OR g.binding->>'browserHash' IS DISTINCT FROM p->>'browserHash'
     OR ps IS NULL OR bs IS NULL OR cs IS NULL THEN RETURN jsonb_build_object('status','rejected'); END IF;
   meta:=ps->'metadata'; reg:=bs->'registration'; proof:=bs->'shopifyProof';
   IF reg->>'mode' IS DISTINCT FROM meta->>'mode' OR reg->>'applicationPkceChallenge' IS DISTINCT FROM ps->>'applicationPkceChallenge'
     OR bs->>'sub' IS NULL OR bs->>'receiptId' IS DISTINCT FROM cs->>'receiptId' OR proof->>'receiptId' IS DISTINCT FROM cs->>'receiptId'
     OR proof->>'shopId' IS DISTINCT FROM cs->>'shopId' OR proof->>'issuer' IS DISTINCT FROM cs->>'issuer' OR proof->>'subject' IS DISTINCT FROM cs->>'subject'
     OR (meta->>'mode'='migration' AND (meta->'original'->>'userId' IS DISTINCT FROM reg->'target'->>'userId' OR bs->>'reservation'<>'pending_migration'))
     OR (meta->>'mode'='sign_in' AND (meta->'original' IS DISTINCT FROM 'null'::jsonb OR reg->'target' IS DISTINCT FROM 'null'::jsonb OR bs->>'reservation' NOT IN ('provisional','bound'))) THEN
     RETURN jsonb_build_object('status','rejected'); END IF;
   expiry:=LEAST(tll_provisional_private.ms(ps->'expiresAt'),tll_provisional_private.ms(bs->'hardDeadline'),tll_provisional_private.ms(cs->'proofExpiresAt'));
   IF expiry<=ts THEN RETURN jsonb_build_object('status','rejected'); END IF;
   f:=nextval('tll_bridge_private.final_fences');
   INSERT INTO tll_bridge_private.finalizations(transaction_id,browser_hash,callback_hash,state,fence,claim_operation,mode,original_user_id,
     config_hash,intent_hash,application_challenge,callback_material,provisional_material,proof_receipt_id,reserved_subject,expires_at)
   VALUES(rid,p->>'browserHash',p->>'callbackHash','exchanging',f,oid,meta->>'mode',NULLIF(meta->'original'->>'userId','')::uuid,
     ps->>'configHash',ps->>'intentHash',ps->>'applicationPkceChallenge',p->'callbackMaterial',ps->'material',(cs->>'receiptId')::uuid,bs->>'sub',expiry);
   INSERT INTO tll_bridge_private.final_operations VALUES(oid,rid,'claim',0,f,true,ts);
   RETURN jsonb_build_object('status','claimed','transactionId',rid,'browserHash',p->>'browserHash','callbackHash',p->>'callbackHash',
     'mode',meta->>'mode','originalUserId',NULLIF(meta->'original'->>'userId','')::uuid,'shopifyProofReceiptId',cs->>'receiptId',
     'fence',f::text,'generation','0','expiresAt',floor(extract(epoch FROM expiry)*1000)::bigint,
     'applicationPkceChallenge',ps->>'applicationPkceChallenge','reservedSubject',bs->>'sub','configHash',ps->>'configHash',
     'intentHash',ps->>'intentHash','provisionalMaterial',ps->'material','callbackMaterial',p->'callbackMaterial');
 END IF;
 IF p-ARRAY['transactionId','operationId','fence','generation','callbackHash','shopifyProofReceiptId','userId','identityId','reservedSubject','authenticatedAt','checkedAt','expiresAt','sessionMaterial']<>'{}'::jsonb
   OR previous.id IS NOT NULL OR r.state<>'exchanging' OR r.fence::text<>p->>'fence' OR r.generation::text<>p->>'generation'
   OR r.callback_hash<>p->>'callbackHash' OR r.proof_receipt_id::text<>p->>'shopifyProofReceiptId' OR r.reserved_subject<>p->>'reservedSubject'
   OR NOT tll_provisional_private.uuid_valid(p->>'userId') OR NOT tll_provisional_private.uuid_valid(p->>'identityId')
   OR NOT tll_customer_private.envelope_valid(p->'sessionMaterial') THEN RETURN jsonb_build_object('status','rejected'); END IF;
 final_user:=(p->>'userId')::uuid; final_identity:=(p->>'identityId')::uuid;
 IF r.mode='migration' AND final_user<>r.original_user_id THEN RETURN jsonb_build_object('status','rejected'); END IF;
 authenticated:=tll_provisional_private.ms(p->'authenticatedAt'); checked:=tll_provisional_private.ms(p->'checkedAt'); session_expiry:=tll_provisional_private.ms(p->'expiresAt');
 IF authenticated>ts OR authenticated<=ts-interval '5 minutes' OR checked>ts OR checked<=ts-interval '10 seconds' OR session_expiry<=ts
   OR NOT tll_broker_private.final_promote(rid,r.reserved_subject,final_user) THEN RETURN jsonb_build_object('status','rejected'); END IF;
 UPDATE tll_bridge_private.finalizations SET state='reconciled',finish_operation=oid,user_id=final_user,identity_id=final_identity,
   authenticated_at=authenticated,checked_at=checked,session_expires_at=session_expiry,session_material=p->'sessionMaterial',reconciled_at=ts WHERE transaction_id=rid;
 INSERT INTO tll_bridge_private.final_operations VALUES(oid,rid,'finish',r.generation,r.fence,true,ts);
 RETURN jsonb_build_object('status','reconciled');
END $repository$;

DO $secure$
DECLARE installer name:=current_user; r record; g record; role_name text;
BEGIN
 ALTER SEQUENCE tll_bridge_private.final_fences OWNER TO tll_bridge_owner;
 ALTER TABLE tll_bridge_private.finalizations OWNER TO tll_bridge_owner; ALTER TABLE tll_bridge_private.finalizations ENABLE ROW LEVEL SECURITY;
 ALTER TABLE tll_bridge_private.final_operations OWNER TO tll_bridge_owner; ALTER TABLE tll_bridge_private.final_operations ENABLE ROW LEVEL SECURITY;
 FOR r IN SELECT oid,oid::regprocedure signature,pronamespace FROM pg_proc WHERE oid IN (
   'tll_customer_private.final_lock()'::regprocedure,'tll_customer_private.final_source(uuid)'::regprocedure,
   'tll_provisional_private.final_source(uuid,text)'::regprocedure,'tll_broker_private.final_source(uuid)'::regprocedure,
   'tll_broker_private.final_promote(uuid,text,uuid)'::regprocedure,'tll_bridge_private.final_repository(text,jsonb)'::regprocedure) LOOP
   role_name:=CASE r.pronamespace WHEN 'tll_customer_private'::regnamespace THEN 'tll_customer_owner' WHEN 'tll_provisional_private'::regnamespace THEN 'tll_provisional_owner'
     WHEN 'tll_broker_private'::regnamespace THEN 'tll_broker_owner' ELSE 'tll_bridge_owner' END;
   EXECUTE format('ALTER FUNCTION %s OWNER TO %I',r.signature,role_name); EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',r.signature);
 END LOOP;
 REVOKE ALL ON TABLE tll_bridge_private.finalizations,tll_bridge_private.final_operations FROM PUBLIC;
 REVOKE ALL ON SEQUENCE tll_bridge_private.final_fences FROM PUBLIC;
 GRANT USAGE ON SCHEMA tll_customer_private TO tll_bridge_owner;
 GRANT EXECUTE ON FUNCTION tll_customer_private.final_lock(),tll_customer_private.final_source(uuid),tll_customer_private.envelope_valid(jsonb) TO tll_bridge_owner;
 GRANT EXECUTE ON FUNCTION tll_provisional_private.final_source(uuid,text) TO tll_bridge_owner;
 GRANT EXECUTE ON FUNCTION tll_broker_private.final_source(uuid),tll_broker_private.final_promote(uuid,text,uuid) TO tll_bridge_owner;
 GRANT EXECUTE ON FUNCTION tll_bridge_private.final_repository(text,jsonb) TO tll_bridge_executor;
 FOREACH role_name IN ARRAY ARRAY['tll_bridge_owner','tll_broker_owner','tll_provisional_owner','tll_customer_owner'] LOOP
   IF (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
     EXECUTE format('GRANT %I TO %I WITH ADMIN TRUE, INHERIT FALSE, SET FALSE',role_name,installer);
   ELSE EXECUTE format('REVOKE %I FROM %I GRANTED BY %I',role_name,installer,installer); END IF;
 END LOOP;
END $secure$;
DO $postflight$
DECLARE role_name text;
BEGIN
 IF tll_bridge_private.operator_status()->'enabled'<>'false'::jsonb OR tll_broker_private.operator_status()->'enabled'<>'false'::jsonb
   OR tll_provisional_private.operator_status()->'enabled'<>'false'::jsonb OR tll_customer_private.operator_status()->'enabled'<>'false'::jsonb THEN
   RAISE EXCEPTION 'Unexpected final activation'; END IF;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','tll_customer_executor','tll_broker_executor','tll_provisional_executor','tll_bridge_executor'] LOOP
   IF has_table_privilege(role_name,'tll_bridge_private.finalizations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
     OR has_any_column_privilege(role_name,'tll_bridge_private.finalizations','SELECT,INSERT,UPDATE,REFERENCES')
     OR has_table_privilege(role_name,'tll_bridge_private.final_operations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') THEN
     RAISE EXCEPTION 'Unexpected final data authority'; END IF;
 END LOOP;
 IF NOT has_function_privilege('tll_bridge_executor','tll_bridge_private.final_repository(text,jsonb)','EXECUTE')
   OR has_function_privilege('anon','tll_bridge_private.final_repository(text,jsonb)','EXECUTE')
   OR has_function_privilege('service_role','tll_bridge_private.final_repository(text,jsonb)','EXECUTE') THEN
   RAISE EXCEPTION 'Unexpected final function authority'; END IF;
END $postflight$;
COMMIT;
