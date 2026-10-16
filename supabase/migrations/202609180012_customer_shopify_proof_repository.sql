-- Disabled additive Shopify proof custody for the customer executor. This adds
-- no LOGIN, credential, route, provider configuration or activation.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preflight$
DECLARE installer name:=current_user;
BEGIN
 IF current_user<>session_user OR current_setting('server_version_num')::int<170000
   OR to_regnamespace('tll_customer_private') IS NULL
   OR to_regprocedure('tll_customer_private.repository(text,jsonb)') IS NULL
   OR to_regclass('tll_customer_private.shopify_proofs') IS NOT NULL
   OR to_regprocedure('tll_customer_private.shopify_proof_repository(text,jsonb)') IS NOT NULL
   OR tll_customer_private.operator_status()->'enabled'<>'false'::jsonb THEN
   RAISE EXCEPTION 'Shopify proof repository installation unavailable'; END IF;
 IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AND NOT EXISTS(
   SELECT FROM pg_auth_members WHERE roleid='tll_customer_owner'::regrole AND member=current_user::regrole
     AND admin_option AND NOT inherit_option AND NOT set_option) THEN
   RAISE EXCEPTION 'Reviewed customer owner upgrade authority required'; END IF;
 EXECUTE format('GRANT tll_customer_owner TO %I WITH INHERIT TRUE, SET TRUE',installer);
END $preflight$;

CREATE SEQUENCE tll_customer_private.shopify_proof_fences AS bigint NO CYCLE;
CREATE TABLE tll_customer_private.shopify_proofs(
 transaction_id uuid PRIMARY KEY,
 state_hash text NOT NULL CHECK(state_hash ~ '^[a-f0-9]{64}$'),
 config_hash text CHECK(config_hash ~ '^[a-f0-9]{64}$'),
 callback_url text,
 inner_challenge text CHECK(inner_challenge ~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$'),
 attempt_material jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz,
 state text NOT NULL CHECK(state IN ('pending','exchanging','verified','held')),
 fence bigint NOT NULL CHECK(fence>0),
 claim_operation uuid UNIQUE,
 receipt_id uuid UNIQUE,
 shop_id text,
 issuer text,
 subject text,
 verified_at timestamptz,
 proof_expires_at timestamptz,
 access_expires_at timestamptz,
 tokens jsonb,
 CHECK((state='held') OR (config_hash IS NOT NULL AND callback_url IS NOT NULL AND inner_challenge IS NOT NULL
   AND expires_at>created_at AND expires_at<=created_at+interval '5 minutes')),
 CHECK(state NOT IN ('pending','exchanging') OR attempt_material IS NOT NULL),
 CHECK(state<>'exchanging' OR claim_operation IS NOT NULL),
 CHECK(state<>'verified' OR (attempt_material IS NULL AND receipt_id IS NOT NULL AND shop_id='107532616020'
   AND issuer='https://shopify.com/authentication/107532616020' AND subject IS NOT NULL
   AND verified_at IS NOT NULL AND proof_expires_at>verified_at AND access_expires_at>=proof_expires_at AND tokens IS NOT NULL)),
 CHECK(state='verified' OR (receipt_id IS NULL AND shop_id IS NULL AND issuer IS NULL AND subject IS NULL
   AND verified_at IS NULL AND proof_expires_at IS NULL AND access_expires_at IS NULL AND tokens IS NULL)),
 CHECK(attempt_material IS NULL OR tll_customer_private.envelope_valid(attempt_material)),
 CHECK(tokens IS NULL OR tll_customer_private.envelope_valid(tokens))
);
CREATE UNIQUE INDEX shopify_proof_state_hash ON tll_customer_private.shopify_proofs(state_hash) WHERE state<>'held';

CREATE FUNCTION tll_customer_private.shopify_proof_repository(op text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $repository$
DECLARE ctl tll_customer_private.control%ROWTYPE; r tll_customer_private.shopify_proofs%ROWTYPE;
 ts timestamptz:=clock_timestamp(); rid uuid; f bigint; created timestamptz; expiry timestamptz;
 verified timestamptz; proof_expiry timestamptz; access_expiry timestamptz; proof jsonb;
BEGIN
 IF op IS NULL OR op NOT IN ('create','claim','finish','read','hold')
   OR jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>65536
   OR COALESCE(p->>'transactionId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN
   RAISE EXCEPTION 'Invalid Shopify proof request' USING ERRCODE='22023'; END IF;
 rid:=(p->>'transactionId')::uuid;
 SELECT * INTO STRICT ctl FROM tll_customer_private.control WHERE singleton FOR UPDATE;
 IF NOT ctl.enabled AND op<>'hold' THEN RETURN jsonb_build_object('status','rejected'); END IF;

 IF op='hold' THEN
   IF p-ARRAY['transactionId','stateHash','fence']<>'{}'::jsonb OR COALESCE(p->>'stateHash','') !~ '^[a-f0-9]{64}$'
     OR (p ? 'fence' AND COALESCE(p->>'fence','') !~ '^[1-9][0-9]{0,18}$') THEN
     RAISE EXCEPTION 'Invalid Shopify proof hold' USING ERRCODE='22023'; END IF;
   SELECT * INTO r FROM tll_customer_private.shopify_proofs WHERE transaction_id=rid FOR UPDATE;
   IF NOT FOUND THEN
     INSERT INTO tll_customer_private.shopify_proofs(transaction_id,state_hash,state,fence)
       VALUES(rid,p->>'stateHash','held',nextval('tll_customer_private.shopify_proof_fences'));
     RETURN jsonb_build_object('status','held');
   END IF;
   IF r.state_hash IS DISTINCT FROM p->>'stateHash' OR (p ? 'fence' AND r.fence::text IS DISTINCT FROM p->>'fence') THEN
     RETURN jsonb_build_object('status','rejected'); END IF;
   UPDATE tll_customer_private.shopify_proofs SET state='held',fence=nextval('tll_customer_private.shopify_proof_fences'),
     attempt_material=NULL,receipt_id=NULL,shop_id=NULL,issuer=NULL,subject=NULL,verified_at=NULL,
     proof_expires_at=NULL,access_expires_at=NULL,tokens=NULL WHERE transaction_id=rid;
   RETURN jsonb_build_object('status','held');
 END IF;

 IF op='create' THEN
   IF p-ARRAY['transactionId','stateHash','configHash','callbackUrl','innerPkceChallenge','createdAt','expiresAt','material']<>'{}'::jsonb
     OR COALESCE(p->>'stateHash','') !~ '^[a-f0-9]{64}$' OR COALESCE(p->>'configHash','') !~ '^[a-f0-9]{64}$'
     OR COALESCE(p->>'callbackUrl','') !~ '^https://the-lifting-[a-z0-9-]+-my-lifting-lab-s-projects[.]vercel[.]app/auth/customer/shopify/callback$'
     OR COALESCE(p->>'innerPkceChallenge','') !~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$'
     OR jsonb_typeof(p->'createdAt') IS DISTINCT FROM 'number' OR (p->>'createdAt') !~ '^[1-9][0-9]{0,14}$'
     OR jsonb_typeof(p->'expiresAt') IS DISTINCT FROM 'number' OR (p->>'expiresAt') !~ '^[1-9][0-9]{0,14}$'
     OR NOT tll_customer_private.envelope_valid(p->'material') THEN RETURN jsonb_build_object('status','rejected'); END IF;
   created:=to_timestamp((p->>'createdAt')::numeric/1000); expiry:=to_timestamp((p->>'expiresAt')::numeric/1000);
   IF created>ts OR created<ts-interval '5 seconds' OR expiry<=ts OR expiry>created+interval '5 minutes'
     OR EXISTS(SELECT FROM tll_customer_private.shopify_proofs WHERE transaction_id=rid OR (state_hash=p->>'stateHash' AND state<>'held'))
     OR (SELECT count(*) FROM tll_customer_private.shopify_proofs)>=10000 THEN RETURN jsonb_build_object('status','rejected'); END IF;
   f:=nextval('tll_customer_private.shopify_proof_fences');
   INSERT INTO tll_customer_private.shopify_proofs(transaction_id,state_hash,config_hash,callback_url,inner_challenge,
     attempt_material,created_at,expires_at,state,fence) VALUES(rid,p->>'stateHash',p->>'configHash',p->>'callbackUrl',
     p->>'innerPkceChallenge',p->'material',created,expiry,'pending',f);
   RETURN jsonb_build_object('status','created');
 END IF;

 SELECT * INTO r FROM tll_customer_private.shopify_proofs WHERE transaction_id=rid FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','rejected'); END IF;
 IF op='read' THEN
   IF p-ARRAY['transactionId']<>'{}'::jsonb OR r.state<>'verified' OR r.proof_expires_at<=ts OR r.tokens IS NULL THEN
     RETURN jsonb_build_object('status','rejected'); END IF;
   RETURN jsonb_build_object('status','verified','proof',jsonb_build_object('transactionId',r.transaction_id,
     'receiptId',r.receipt_id,'shopId',r.shop_id,'issuer',r.issuer,'subject',r.subject,
     'innerPkceChallenge',r.inner_challenge,'verifiedAt',floor(extract(epoch FROM r.verified_at)*1000)::bigint,
     'expiresAt',floor(extract(epoch FROM r.proof_expires_at)*1000)::bigint));
 END IF;

 IF op='claim' THEN
   IF p-ARRAY['operationId','transactionId','stateHash','configHash']<>'{}'::jsonb
     OR COALESCE(p->>'operationId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
     OR r.state<>'pending' OR r.expires_at<=ts OR r.state_hash IS DISTINCT FROM p->>'stateHash'
     OR r.config_hash IS DISTINCT FROM p->>'configHash'
     OR EXISTS(SELECT FROM tll_customer_private.shopify_proofs WHERE claim_operation=(p->>'operationId')::uuid) THEN
     RETURN jsonb_build_object('status','rejected'); END IF;
   f:=nextval('tll_customer_private.shopify_proof_fences');
   UPDATE tll_customer_private.shopify_proofs SET state='exchanging',fence=f,claim_operation=(p->>'operationId')::uuid
     WHERE transaction_id=rid RETURNING * INTO r;
   RETURN jsonb_build_object('status','claimed','transactionId',r.transaction_id,'stateHash',r.state_hash,
     'configHash',r.config_hash,'callbackUrl',r.callback_url,'innerPkceChallenge',r.inner_challenge,
     'createdAt',floor(extract(epoch FROM r.created_at)*1000)::bigint,'expiresAt',floor(extract(epoch FROM r.expires_at)*1000)::bigint,
     'fence',r.fence::text,'material',r.attempt_material);
 END IF;

 IF p-ARRAY['transactionId','stateHash','fence','proof','accessExpiresAt','tokens']<>'{}'::jsonb
   OR r.state<>'exchanging' OR r.state_hash IS DISTINCT FROM p->>'stateHash' OR r.fence::text IS DISTINCT FROM p->>'fence'
   OR r.expires_at<=ts OR jsonb_typeof(p->'proof') IS DISTINCT FROM 'object'
   OR NOT tll_customer_private.envelope_valid(p->'tokens') THEN RETURN jsonb_build_object('status','rejected'); END IF;
 proof:=p->'proof';
 IF proof-ARRAY['transactionId','receiptId','shopId','issuer','subject','innerPkceChallenge','verifiedAt','expiresAt']<>'{}'::jsonb
   OR proof->>'transactionId' IS DISTINCT FROM rid::text
   OR COALESCE(proof->>'receiptId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   OR proof->>'shopId' IS DISTINCT FROM '107532616020'
   OR proof->>'issuer' IS DISTINCT FROM 'https://shopify.com/authentication/107532616020'
   OR length(COALESCE(proof->>'subject','')) NOT BETWEEN 1 AND 256
   OR COALESCE(proof->>'subject','') ~ '[[:cntrl:][:space:]]'
   OR proof->>'innerPkceChallenge' IS DISTINCT FROM r.inner_challenge
   OR jsonb_typeof(proof->'verifiedAt') IS DISTINCT FROM 'number' OR (proof->>'verifiedAt') !~ '^[1-9][0-9]{0,14}$'
   OR jsonb_typeof(proof->'expiresAt') IS DISTINCT FROM 'number' OR (proof->>'expiresAt') !~ '^[1-9][0-9]{0,14}$'
   OR jsonb_typeof(p->'accessExpiresAt') IS DISTINCT FROM 'number' OR (p->>'accessExpiresAt') !~ '^[1-9][0-9]{0,14}$' THEN
   RETURN jsonb_build_object('status','rejected'); END IF;
 verified:=to_timestamp((proof->>'verifiedAt')::numeric/1000); proof_expiry:=to_timestamp((proof->>'expiresAt')::numeric/1000);
 access_expiry:=to_timestamp((p->>'accessExpiresAt')::numeric/1000);
 IF verified>ts OR verified<ts-interval '10 seconds' OR proof_expiry<=ts OR proof_expiry>r.expires_at
   OR access_expiry<proof_expiry OR EXISTS(SELECT FROM tll_customer_private.shopify_proofs WHERE receipt_id=(proof->>'receiptId')::uuid) THEN
   RETURN jsonb_build_object('status','rejected'); END IF;
 UPDATE tll_customer_private.shopify_proofs SET state='verified',attempt_material=NULL,receipt_id=(proof->>'receiptId')::uuid,
   shop_id=proof->>'shopId',issuer=proof->>'issuer',subject=proof->>'subject',verified_at=verified,
   proof_expires_at=proof_expiry,access_expires_at=access_expiry,tokens=p->'tokens' WHERE transaction_id=rid;
 RETURN jsonb_build_object('status','verified');
END $repository$;

DO $secure$
DECLARE installer name:=current_user; r record; g record;
BEGIN
 ALTER SEQUENCE tll_customer_private.shopify_proof_fences OWNER TO tll_customer_owner;
 ALTER TABLE tll_customer_private.shopify_proofs OWNER TO tll_customer_owner;
 ALTER TABLE tll_customer_private.shopify_proofs ENABLE ROW LEVEL SECURITY;
 ALTER FUNCTION tll_customer_private.shopify_proof_repository(text,jsonb) OWNER TO tll_customer_owner;
 FOR r IN SELECT c.oid,c.relkind,c.relname FROM pg_class c WHERE c.relnamespace='tll_customer_private'::regnamespace
   AND c.relname IN ('shopify_proofs','shopify_proof_fences') LOOP
   FOR g IN SELECT DISTINCT x.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,
     acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) x
     WHERE c.oid=r.oid AND x.grantee<>c.relowner LOOP
     EXECUTE format('REVOKE ALL ON %s tll_customer_private.%I FROM %s',CASE WHEN r.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,
       r.relname,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
   END LOOP;
 END LOOP;
 REVOKE ALL ON FUNCTION tll_customer_private.shopify_proof_repository(text,jsonb) FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION tll_customer_private.shopify_proof_repository(text,jsonb) TO tll_customer_executor;
 IF (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
   EXECUTE format('GRANT tll_customer_owner TO %I WITH ADMIN TRUE, INHERIT FALSE, SET FALSE',installer);
 ELSE EXECUTE format('REVOKE tll_customer_owner FROM %I GRANTED BY %I',installer,installer); END IF;
END $secure$;

DO $postflight$
DECLARE role_name text; r record; expected_read boolean;
BEGIN
 IF tll_customer_private.operator_status()->'enabled'<>'false'::jsonb THEN RAISE EXCEPTION 'Unexpected proof activation'; END IF;
 IF (SELECT count(*) FROM pg_auth_members WHERE roleid='tll_customer_owner'::regrole AND member=current_user::regrole
   AND admin_option AND NOT inherit_option AND NOT set_option)<>1 THEN RAISE EXCEPTION 'Unexpected repository membership'; END IF;
 IF EXISTS(SELECT FROM pg_class c WHERE c.relnamespace='tll_customer_private'::regnamespace AND c.relkind IN ('r','S')
     AND (c.relowner<>'tll_customer_owner'::regrole
       OR EXISTS(SELECT FROM aclexplode(COALESCE(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) x WHERE x.grantee<>c.relowner)
       OR EXISTS(SELECT FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE a.attrelid=c.oid AND x.grantee<>c.relowner))) THEN
   RAISE EXCEPTION 'Unexpected private relation or column ACL'; END IF;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','tll_customer_executor',current_user::text] LOOP
   IF role_name<>current_user::text AND (SELECT rolsuper FROM pg_roles WHERE rolname=role_name) THEN
     RAISE EXCEPTION 'Unexpected protected role superuser'; END IF;
   IF has_schema_privilege(role_name,'tll_customer_private','CREATE') THEN RAISE EXCEPTION 'Unexpected private schema CREATE'; END IF;
   expected_read:=role_name=current_user::text AND pg_has_role(role_name,'pg_read_all_data','USAGE');
   FOR r IN SELECT oid,relkind FROM pg_class WHERE relnamespace='tll_customer_private'::regnamespace AND relkind IN ('r','S') LOOP
     IF r.relkind='r' AND ((has_table_privilege(role_name,r.oid,'SELECT') IS DISTINCT FROM expected_read)
       OR (has_any_column_privilege(role_name,r.oid,'SELECT') IS DISTINCT FROM expected_read)
       OR has_table_privilege(role_name,r.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
       OR has_any_column_privilege(role_name,r.oid,'INSERT,UPDATE,REFERENCES')) THEN
       RAISE EXCEPTION 'Unexpected effective private data access'; END IF;
     IF r.relkind='S' AND ((has_sequence_privilege(role_name,r.oid,'SELECT') IS DISTINCT FROM expected_read)
       OR has_sequence_privilege(role_name,r.oid,'USAGE,UPDATE')) THEN RAISE EXCEPTION 'Unexpected effective sequence access'; END IF;
   END LOOP;
   IF has_function_privilege(role_name,'tll_customer_private.shopify_proof_repository(text,jsonb)','EXECUTE')
     IS DISTINCT FROM (role_name='tll_customer_executor') THEN RAISE EXCEPTION 'Unexpected effective function authority'; END IF;
 END LOOP;
END $postflight$;
COMMIT;
