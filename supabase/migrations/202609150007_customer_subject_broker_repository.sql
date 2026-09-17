-- Unmounted subject broker repository. No credential, executor LOGIN, route or
-- provider activation is created. Install once through migration history.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $preflight$
DECLARE migration_role name:=current_user;
BEGIN
  IF current_setting('server_version_num')::int < 170000 OR to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Subject broker repository requires PostgreSQL17+ and auth.users';
  END IF;
  IF EXISTS (SELECT FROM pg_namespace WHERE nspname='tll_broker_private')
     OR EXISTS (SELECT FROM pg_roles WHERE rolname IN ('tll_broker_owner','tll_broker_executor','tll_broker_role_setup')) THEN
    RAISE EXCEPTION 'Subject broker repository objects already exist; use migration history';
  END IF;
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role'))<>3 THEN
    RAISE EXCEPTION 'Expected Supabase client roles are missing'; END IF;
  IF NOT EXISTS (SELECT FROM pg_attribute WHERE attrelid='auth.users'::regclass AND attname='id' AND atttypid='uuid'::regtype AND NOT attisdropped) THEN
    RAISE EXCEPTION 'Unexpected auth.users primary identity';
  END IF;
  -- Create the delegable executor as the installing role. PostgreSQL17 grants a
  -- non-superuser creator ADMIN via its bootstrap grantor; the helper must not be
  -- grantor of the retained edge (otherwise dropping the helper would fail).
  SET LOCAL createrole_self_grant='';
  CREATE ROLE tll_broker_executor NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  IF (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    EXECUTE format('GRANT tll_broker_executor TO %I WITH ADMIN TRUE, INHERIT FALSE, SET FALSE',migration_role);
  END IF;
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    CREATE ROLE tll_broker_role_setup NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB CREATEROLE NOREPLICATION NOBYPASSRLS;
    EXECUTE format('GRANT tll_broker_role_setup TO %I WITH INHERIT FALSE, SET TRUE',migration_role);
    SET LOCAL ROLE tll_broker_role_setup;
  END IF;
  CREATE ROLE tll_broker_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  EXECUTE format('GRANT tll_broker_owner TO %I WITH INHERIT TRUE, SET TRUE',migration_role);
  EXECUTE format('SET LOCAL ROLE %I',migration_role);
END
$preflight$;
CREATE SCHEMA tll_broker_private AUTHORIZATION tll_broker_owner;
CREATE SEQUENCE tll_broker_private.fences AS bigint NO CYCLE;
CREATE TABLE tll_broker_private.control (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false,
 operator_oid oid NOT NULL, changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason_code text NOT NULL DEFAULT 'installed_disabled' CHECK(reason_code ~ '^[a-z0-9][a-z0-9_-]{0,63}$')
);
INSERT INTO tll_broker_private.control(singleton,enabled,operator_oid) VALUES(true,false,current_user::regrole::oid);
CREATE TABLE tll_broker_private.subjects (
 sub text PRIMARY KEY CHECK(sub ~ '^tllb_[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$'),
 shop_id text NOT NULL CHECK(shop_id='107532616020'),
 issuer text NOT NULL CHECK(issuer='https://shopify.com/authentication/107532616020'),
 subject text NOT NULL CHECK(length(subject) BETWEEN 1 AND 256 AND subject !~ '[[:space:][:cntrl:]]'),
 reservation text NOT NULL CHECK(reservation IN ('provisional','pending_migration')),
 pending_user_id uuid, created_at timestamptz NOT NULL,
 CHECK((reservation='pending_migration')=(pending_user_id IS NOT NULL)),
 UNIQUE(shop_id,issuer,subject), UNIQUE(shop_id,pending_user_id)
);
-- Never-reused flow IDs remain after expiry/hold/consumption. Registration may
-- be NULL only for a pre-registration quarantine with exact original bindings.
CREATE TABLE tll_broker_private.flows (
 id uuid PRIMARY KEY, config_hash text NOT NULL CHECK(config_hash='7c54b659cf0e2ecdf07ce2b34ea10d7fc0a7c6ef3c9f59f38ca8f5cd79e86780'),
 browser_hash text NOT NULL CHECK(browser_hash ~ '^[a-f0-9]{64}$'), outer_hash text NOT NULL UNIQUE CHECK(outer_hash ~ '^[a-f0-9]{64}$'),
 outer_state uuid UNIQUE, registration jsonb, created_at timestamptz NOT NULL, expires_at timestamptz,
 status text NOT NULL CHECK(status IN ('registered','admitted','verifying','ready','token_issued','consumed','held','cancelled')),
 generation bigint NOT NULL DEFAULT 0 CHECK(generation>=0), fence bigint NOT NULL CHECK(fence>0),
 sub text REFERENCES tll_broker_private.subjects(sub), proof_receipt_id uuid UNIQUE, shopify_proof jsonb, migration_proof jsonb,
 hard_deadline timestamptz, ready_generation bigint, code_hash text UNIQUE CHECK(code_hash ~ '^[a-f0-9]{64}$'),
 bearer_hash text UNIQUE CHECK(bearer_hash ~ '^[a-f0-9]{64}$'), bearer_expires_at timestamptz,
 CHECK((registration IS NULL AND status='held' AND outer_state IS NULL AND expires_at IS NULL)
   OR (registration IS NOT NULL AND outer_state IS NOT NULL AND expires_at>created_at AND expires_at<=created_at+interval '5 minutes')),
 CHECK((code_hash IS NULL)=(hard_deadline IS NULL)), CHECK((bearer_hash IS NULL)=(bearer_expires_at IS NULL))
);
CREATE INDEX broker_flow_browser_created ON tll_broker_private.flows(browser_hash,created_at);
CREATE TABLE tll_broker_private.operations (
 id uuid PRIMARY KEY, flow_id uuid NOT NULL REFERENCES tll_broker_private.flows(id),
 phase text NOT NULL CHECK(phase IN ('register','admit','ready','redeem','consume','cancel','hold')),
 generation bigint NOT NULL, claim_fence bigint NOT NULL, completed boolean NOT NULL, created_at timestamptz NOT NULL
);
CREATE TABLE tll_broker_private.daily_quota(day date PRIMARY KEY, registrations integer NOT NULL CHECK(registrations BETWEEN 0 AND 500));

CREATE FUNCTION tll_broker_private.uuid_valid(v text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $f$
 SELECT COALESCE(v ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$',false)
$f$;
CREATE FUNCTION tll_broker_private.hash_valid(v text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $f$
 SELECT COALESCE(v ~ '^[a-f0-9]{64}$',false)
$f$;
CREATE FUNCTION tll_broker_private.opaque_valid(v text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $f$
 SELECT COALESCE(v ~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$',false)
$f$;
CREATE FUNCTION tll_broker_private.ms(v jsonb) RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $f$
BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'number' OR v::text !~ '^[1-9][0-9]{0,14}$'
   OR (v::text)::numeric>253402300799999 THEN RAISE EXCEPTION 'Invalid broker time' USING ERRCODE='22023'; END IF;
 RETURN to_timestamp((v::text)::numeric/1000);
END
$f$;
CREATE FUNCTION tll_broker_private.repository(op text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tll_broker_private AS $broker$
DECLARE
 ctl tll_broker_private.control%ROWTYPE; r tll_broker_private.flows%ROWTYPE; operation tll_broker_private.operations%ROWTYPE;
 subject_row tll_broker_private.subjects%ROWTYPE;
 rid uuid; oid uuid; ts timestamptz; f bigint; phase text; rec jsonb; outer_request jsonb; loc jsonb; proof jsonb; migration jsonb;
 created timestamptz; expiry timestamptz; hard timestamptz; verified timestamptz; checked timestamptz; authenticated timestamptz;
 bearer_expiry timestamptz; wanted_hash text; target_user uuid; permitted boolean; known boolean;
BEGIN
 IF op IS NULL OR op NOT IN ('register','admit','claim_readiness','finish_readiness','redeem_code','consume_userinfo','hold','cancel')
   OR jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>16384
   OR NOT tll_broker_private.uuid_valid(p->>'operationId')
   OR p->>'configHash' IS DISTINCT FROM '7c54b659cf0e2ecdf07ce2b34ea10d7fc0a7c6ef3c9f59f38ca8f5cd79e86780' THEN
   RAISE EXCEPTION 'Invalid broker request' USING ERRCODE='22023'; END IF;
 -- Small staging foundation: one short transition lock also makes quota,
 -- unknown-registration quarantine and claim/ack races linearizable.
 SELECT * INTO ctl FROM tll_broker_private.control WHERE singleton FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Broker control unavailable'; END IF;
 ts:=clock_timestamp(); oid:=(p->>'operationId')::uuid;
 IF NOT ctl.enabled AND op NOT IN ('hold','cancel') THEN RETURN jsonb_build_object('status','rejected'); END IF;
 phase:=CASE op WHEN 'claim_readiness' THEN 'ready' WHEN 'finish_readiness' THEN 'ready' WHEN 'redeem_code' THEN 'redeem' WHEN 'consume_userinfo' THEN 'consume' ELSE op END;
 IF op='register' THEN rid:=(p->'record'->>'id')::uuid;
 ELSIF op IN ('admit','claim_readiness','finish_readiness','cancel') THEN rid:=(p->>'transactionId')::uuid;
 ELSIF op='redeem_code' THEN SELECT id INTO rid FROM tll_broker_private.flows WHERE code_hash=p->>'codeHash';
 ELSIF op='consume_userinfo' THEN SELECT id INTO rid FROM tll_broker_private.flows WHERE bearer_hash=p->>'bearerHash';
 ELSE
   loc:=p->'locator';
   IF jsonb_typeof(loc) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid broker locator' USING ERRCODE='22023'; END IF;
   IF loc->>'kind'='transaction' THEN rid:=(loc->>'id')::uuid;
   ELSIF loc->>'kind'='code' THEN SELECT id INTO rid FROM tll_broker_private.flows WHERE code_hash=loc->>'hash';
   ELSIF loc->>'kind'='bearer' THEN SELECT id INTO rid FROM tll_broker_private.flows WHERE bearer_hash=loc->>'hash';
   ELSE RAISE EXCEPTION 'Invalid broker locator' USING ERRCODE='22023'; END IF;
 END IF;
 SELECT * INTO r FROM tll_broker_private.flows WHERE id=rid; known:=FOUND;
 SELECT * INTO operation FROM tll_broker_private.operations WHERE id=oid;
 IF operation.id IS NOT NULL AND (operation.flow_id IS DISTINCT FROM rid OR (op<>'hold' AND operation.phase<>phase)) THEN
   RETURN jsonb_build_object('status','rejected'); END IF;

 IF op='hold' THEN
   IF NOT known AND loc->>'kind'='transaction' AND rid IS NOT NULL
     AND tll_broker_private.hash_valid(loc->>'browserHash') AND tll_broker_private.hash_valid(loc->>'outerHash')
     AND NOT (loc ?| ARRAY['fence','generation']) THEN
     IF (SELECT count(*) FROM tll_broker_private.flows)>=20000 OR (SELECT count(*) FROM tll_broker_private.operations)>=100000 THEN
       RAISE EXCEPTION 'Broker quarantine capacity unavailable'; END IF;
     f:=nextval('tll_broker_private.fences');
     INSERT INTO tll_broker_private.flows(id,config_hash,browser_hash,outer_hash,created_at,status,fence)
       VALUES(rid,p->>'configHash',loc->>'browserHash',loc->>'outerHash',ts,'held',f) ON CONFLICT DO NOTHING;
     IF NOT FOUND THEN RETURN jsonb_build_object('status','rejected'); END IF;
     INSERT INTO tll_broker_private.operations VALUES(oid,rid,'hold',0,f,true,ts);
     RETURN jsonb_build_object('status','held');
   END IF;
   IF NOT known THEN RETURN jsonb_build_object('status','rejected'); END IF;
   permitted:=CASE loc->>'kind'
     WHEN 'transaction' THEN loc->>'browserHash'=r.browser_hash AND loc->>'outerHash'=r.outer_hash
       AND (NOT(loc ? 'generation') OR loc->>'generation'=r.generation::text)
       AND (NOT(loc ? 'fence') OR (operation.id IS NOT NULL AND loc->>'fence'=operation.claim_fence::text AND operation.generation=r.generation))
     WHEN 'code' THEN loc->>'clientId'=r.registration->'outer'->>'clientId' AND loc->>'redirectUri'=r.registration->'outer'->>'redirectUri'
       AND loc->>'challenge'=r.registration->'outer'->>'challenge'
     WHEN 'bearer' THEN loc->>'hash'=r.bearer_hash ELSE false END;
   IF permitted IS DISTINCT FROM true THEN RETURN jsonb_build_object('status','rejected'); END IF;
   IF r.status IN ('held','cancelled') AND operation.id IS NULL THEN RETURN jsonb_build_object('status','rejected'); END IF;
   IF r.status NOT IN ('held','cancelled') THEN
     UPDATE tll_broker_private.flows SET status='held',fence=nextval('tll_broker_private.fences') WHERE id=rid;
     IF operation.id IS NULL AND (SELECT count(*) FROM tll_broker_private.operations)<100000 THEN
       INSERT INTO tll_broker_private.operations VALUES(oid,rid,'hold',r.generation,r.fence,true,ts);
     END IF;
   END IF;
   -- The permanent flow quarantine is sufficient even at operation capacity.
   -- Once held, a fresh operation cannot grow or reopen this immutable flow.
   RETURN jsonb_build_object('status','held');
 END IF;
 IF op='register' THEN
   IF known OR operation.id IS NOT NULL THEN RETURN jsonb_build_object('status','rejected'); END IF;
   rec:=p->'record'; outer_request:=rec->'outer';
   IF jsonb_typeof(rec) IS DISTINCT FROM 'object' OR rec-ARRAY['id','configHash','browserHash','outer','outerHash','applicationPkceChallenge','mode','target','createdAt','expiresAt']<>'{}'::jsonb
     OR rec->>'configHash' IS DISTINCT FROM p->>'configHash' OR NOT tll_broker_private.uuid_valid(rec->>'id')
     OR NOT tll_broker_private.hash_valid(rec->>'browserHash') OR NOT tll_broker_private.hash_valid(rec->>'outerHash')
     OR jsonb_typeof(outer_request) IS DISTINCT FROM 'object' OR outer_request-ARRAY['clientId','redirectUri','state','scope','challenge','method']<>'{}'::jsonb
     OR outer_request->>'clientId' IS DISTINCT FROM 'tll-staging-subject-broker-v1'
     OR outer_request->>'redirectUri' IS DISTINCT FROM 'https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1/callback'
     OR outer_request->>'scope' IS DISTINCT FROM 'subject' OR outer_request->>'method' IS DISTINCT FROM 'S256'
     OR NOT tll_broker_private.uuid_valid(outer_request->>'state') OR NOT tll_broker_private.opaque_valid(outer_request->>'challenge')
     OR NOT tll_broker_private.opaque_valid(rec->>'applicationPkceChallenge') OR rec->>'applicationPkceChallenge'=outer_request->>'challenge' THEN
     RETURN jsonb_build_object('status','rejected'); END IF;
   wanted_hash:=encode(sha256(convert_to('['||to_json(outer_request->>'clientId')::text||','||to_json(outer_request->>'redirectUri')::text||','||to_json(outer_request->>'state')::text||','||to_json(outer_request->>'scope')::text||','||to_json(outer_request->>'challenge')::text||','||to_json(outer_request->>'method')::text||']','UTF8')),'hex');
   IF wanted_hash<>rec->>'outerHash' THEN RETURN jsonb_build_object('status','rejected'); END IF;
   IF rec->>'mode'='sign_in' THEN
     IF rec->'target' IS DISTINCT FROM 'null'::jsonb THEN RETURN jsonb_build_object('status','rejected'); END IF;
   ELSIF rec->>'mode'='migration' THEN
     IF jsonb_typeof(rec->'target') IS DISTINCT FROM 'object' OR (rec->'target')-ARRAY['userId','sessionId']<>'{}'::jsonb
       OR NOT tll_broker_private.uuid_valid(rec->'target'->>'userId') OR NOT tll_broker_private.uuid_valid(rec->'target'->>'sessionId') THEN RETURN jsonb_build_object('status','rejected'); END IF;
   ELSE RETURN jsonb_build_object('status','rejected'); END IF;
   created:=tll_broker_private.ms(rec->'createdAt'); expiry:=tll_broker_private.ms(rec->'expiresAt');
   IF created>ts OR created<ts-interval '5 seconds' OR expiry<=ts OR expiry>created+interval '5 minutes' THEN RETURN jsonb_build_object('status','rejected'); END IF;
   IF (SELECT count(*) FROM tll_broker_private.flows)>=10000 OR (SELECT count(*) FROM tll_broker_private.operations)>=100000
     OR (SELECT count(*) FROM tll_broker_private.flows WHERE browser_hash=rec->>'browserHash' AND created_at>ts-interval '10 minutes')>=10
     OR COALESCE((SELECT registrations FROM tll_broker_private.daily_quota WHERE day=(ts AT TIME ZONE 'UTC')::date),0)>=500 THEN RETURN jsonb_build_object('status','rejected'); END IF;
   f:=nextval('tll_broker_private.fences');
   INSERT INTO tll_broker_private.flows(id,config_hash,browser_hash,outer_hash,outer_state,registration,created_at,expires_at,status,fence)
     VALUES(rid,p->>'configHash',rec->>'browserHash',rec->>'outerHash',(outer_request->>'state')::uuid,rec,created,expiry,'registered',f)
     ON CONFLICT DO NOTHING;
   IF NOT FOUND THEN RETURN jsonb_build_object('status','rejected'); END IF;
   INSERT INTO tll_broker_private.operations VALUES(oid,rid,'register',0,f,true,ts);
   INSERT INTO tll_broker_private.daily_quota VALUES((ts AT TIME ZONE 'UTC')::date,1) ON CONFLICT(day) DO UPDATE SET registrations=tll_broker_private.daily_quota.registrations+1;
   RETURN jsonb_build_object('status','registered');
 END IF;
 IF NOT known OR r.config_hash<>p->>'configHash' THEN RETURN jsonb_build_object('status','rejected'); END IF;
 IF op IN ('admit','claim_readiness','finish_readiness','cancel') AND p->>'browserHash' IS DISTINCT FROM r.browser_hash THEN RETURN jsonb_build_object('status','rejected'); END IF;
 IF op='cancel' THEN
   IF operation.id IS NOT NULL OR r.status IN ('cancelled','held','consumed') THEN RETURN jsonb_build_object('status','rejected'); END IF;
   UPDATE tll_broker_private.flows SET status='cancelled',generation=generation+1,fence=nextval('tll_broker_private.fences') WHERE id=rid;
   -- Cancellation must remain available when regular operation quota is exhausted.
   IF (SELECT count(*) FROM tll_broker_private.operations)<100000 THEN INSERT INTO tll_broker_private.operations VALUES(oid,rid,'cancel',r.generation,r.fence,true,ts); END IF;
   RETURN jsonb_build_object('status','cancelled');
 END IF;
 IF r.expires_at<=ts OR r.registration IS NULL OR r.status IN ('held','cancelled','consumed') THEN RETURN jsonb_build_object('status','rejected'); END IF;
 IF op='redeem_code' AND r.status='token_issued' AND p->>'clientId'=r.registration->'outer'->>'clientId'
   AND p->>'redirectUri'=r.registration->'outer'->>'redirectUri' AND p->>'challenge'=r.registration->'outer'->>'challenge' THEN
   UPDATE tll_broker_private.flows SET status='held',fence=nextval('tll_broker_private.fences') WHERE id=rid;
   RETURN jsonb_build_object('status','rejected');
 END IF;
 IF op<>'finish_readiness' AND operation.id IS NOT NULL THEN RETURN jsonb_build_object('status','rejected'); END IF;
 IF op<>'finish_readiness' AND (SELECT count(*) FROM tll_broker_private.operations)>=100000 THEN RETURN jsonb_build_object('status','rejected'); END IF;
 IF op='admit' THEN
   IF r.status<>'registered' OR p->>'outerHash' IS DISTINCT FROM r.outer_hash THEN RETURN jsonb_build_object('status','rejected'); END IF;
   f:=nextval('tll_broker_private.fences'); UPDATE tll_broker_private.flows SET status='admitted',fence=f WHERE id=rid;
   INSERT INTO tll_broker_private.operations VALUES(oid,rid,'admit',r.generation,f,true,ts);
   RETURN jsonb_build_object('status','admitted');
 ELSIF op='claim_readiness' THEN
   IF r.status<>'admitted' THEN RETURN jsonb_build_object('status','rejected'); END IF;
   f:=nextval('tll_broker_private.fences'); UPDATE tll_broker_private.flows SET status='verifying',fence=f WHERE id=rid;
   INSERT INTO tll_broker_private.operations VALUES(oid,rid,'ready',r.generation,f,false,ts);
   RETURN jsonb_build_object('status','claimed','record',r.registration,'fence',f::text,'generation',r.generation::text);
 ELSIF op='finish_readiness' THEN
   IF r.status<>'verifying' OR operation.id IS NULL OR operation.completed OR operation.claim_fence<>r.fence OR operation.generation<>r.generation
     OR p->>'fence' IS DISTINCT FROM r.fence::text OR p->>'generation' IS DISTINCT FROM r.generation::text
     OR NOT tll_broker_private.hash_valid(p->>'codeHash') OR p->>'candidateSubject' IS NULL OR p->>'candidateSubject' !~ '^tllb_[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$' THEN RETURN jsonb_build_object('status','rejected'); END IF;
   proof:=p->'shopifyProof'; migration:=p->'migrationProof';
   IF jsonb_typeof(proof) IS DISTINCT FROM 'object' OR proof-ARRAY['transactionId','receiptId','shopId','issuer','subject','innerPkceChallenge','verifiedAt','expiresAt']<>'{}'::jsonb
     OR proof->>'transactionId' IS DISTINCT FROM rid::text OR NOT tll_broker_private.uuid_valid(proof->>'receiptId')
     OR proof->>'shopId' IS DISTINCT FROM '107532616020' OR proof->>'issuer' IS DISTINCT FROM 'https://shopify.com/authentication/107532616020'
     OR proof->>'subject' IS NULL OR length(proof->>'subject') NOT BETWEEN 1 AND 256 OR proof->>'subject' ~ '[[:space:][:cntrl:]]'
     OR NOT tll_broker_private.opaque_valid(proof->>'innerPkceChallenge') OR proof->>'innerPkceChallenge' IN (r.registration->>'applicationPkceChallenge',r.registration->'outer'->>'challenge') THEN RETURN jsonb_build_object('status','rejected'); END IF;
   verified:=tll_broker_private.ms(proof->'verifiedAt'); expiry:=tll_broker_private.ms(proof->'expiresAt'); hard:=tll_broker_private.ms(p->'hardDeadline');
   IF verified>ts OR verified<=ts-interval '5 seconds' OR hard<=ts OR hard>least(r.expires_at,verified+interval '5 seconds',expiry) THEN RETURN jsonb_build_object('status','rejected'); END IF;
   IF r.registration->>'mode'='migration' THEN
     IF jsonb_typeof(migration) IS DISTINCT FROM 'object' OR migration-ARRAY['userId','sessionId','issuer','audience','anonymous','authenticatedAt','checkedAt','expiresAt']<>'{}'::jsonb
       OR migration->>'userId' IS DISTINCT FROM r.registration->'target'->>'userId' OR migration->>'sessionId' IS DISTINCT FROM r.registration->'target'->>'sessionId'
       OR migration->>'issuer' IS DISTINCT FROM 'https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1' OR migration->>'audience' IS DISTINCT FROM 'authenticated'
       OR migration->'anonymous' IS DISTINCT FROM 'false'::jsonb THEN RETURN jsonb_build_object('status','rejected'); END IF;
     checked:=tll_broker_private.ms(migration->'checkedAt'); authenticated:=tll_broker_private.ms(migration->'authenticatedAt'); expiry:=tll_broker_private.ms(migration->'expiresAt');
     IF checked>ts OR authenticated>ts OR hard>least(checked+interval '5 seconds',authenticated+interval '5 minutes',expiry) THEN RETURN jsonb_build_object('status','rejected'); END IF;
     target_user:=(migration->>'userId')::uuid;
   ELSIF migration IS DISTINCT FROM 'null'::jsonb THEN RETURN jsonb_build_object('status','rejected'); END IF;
   IF EXISTS(SELECT FROM tll_broker_private.flows WHERE code_hash=p->>'codeHash' OR proof_receipt_id=(proof->>'receiptId')::uuid) THEN RETURN jsonb_build_object('status','rejected'); END IF;
   SELECT * INTO subject_row FROM tll_broker_private.subjects WHERE shop_id=proof->>'shopId' AND issuer=proof->>'issuer' AND subject=proof->>'subject';
   IF subject_row.sub IS NOT NULL AND target_user IS NOT NULL AND (subject_row.reservation='provisional' OR subject_row.pending_user_id IS DISTINCT FROM target_user) THEN RETURN jsonb_build_object('status','rejected'); END IF;
   IF subject_row.sub IS NULL THEN
     IF (SELECT count(*) FROM tll_broker_private.subjects)>=5000 THEN RETURN jsonb_build_object('status','rejected'); END IF;
     INSERT INTO tll_broker_private.subjects VALUES(p->>'candidateSubject',proof->>'shopId',proof->>'issuer',proof->>'subject',CASE WHEN target_user IS NULL THEN 'provisional' ELSE 'pending_migration' END,target_user,ts)
       ON CONFLICT DO NOTHING RETURNING * INTO subject_row;
     IF NOT FOUND THEN RETURN jsonb_build_object('status','rejected'); END IF;
   END IF;
   f:=nextval('tll_broker_private.fences');
   UPDATE tll_broker_private.flows SET status='ready',fence=f,sub=subject_row.sub,proof_receipt_id=(proof->>'receiptId')::uuid,
     shopify_proof=proof,migration_proof=migration,hard_deadline=hard,ready_generation=generation,code_hash=p->>'codeHash' WHERE id=rid;
   UPDATE tll_broker_private.operations SET completed=true WHERE id=oid;
   RETURN jsonb_build_object('status','ready');
 ELSIF op IN ('redeem_code','consume_userinfo') THEN
   IF r.hard_deadline IS NULL OR r.hard_deadline<=ts OR r.ready_generation IS DISTINCT FROM r.generation THEN RETURN jsonb_build_object('status','rejected'); END IF;
   IF op='redeem_code' THEN
     IF r.status<>'ready' OR p->>'clientId' IS DISTINCT FROM r.registration->'outer'->>'clientId'
       OR p->>'redirectUri' IS DISTINCT FROM r.registration->'outer'->>'redirectUri' OR p->>'challenge' IS DISTINCT FROM r.registration->'outer'->>'challenge'
       OR NOT tll_broker_private.hash_valid(p->>'bearerHash') THEN RETURN jsonb_build_object('status','rejected'); END IF;
     bearer_expiry:=tll_broker_private.ms(p->'bearerExpiresAt');
     IF bearer_expiry<=ts OR bearer_expiry>ts+interval '60 seconds' OR EXISTS(SELECT FROM tll_broker_private.flows WHERE bearer_hash=p->>'bearerHash') THEN RETURN jsonb_build_object('status','rejected'); END IF;
     f:=nextval('tll_broker_private.fences'); UPDATE tll_broker_private.flows SET status='token_issued',fence=f,bearer_hash=p->>'bearerHash',bearer_expires_at=bearer_expiry WHERE id=rid;
     INSERT INTO tll_broker_private.operations VALUES(oid,rid,'redeem',r.generation,f,true,ts);
     RETURN jsonb_build_object('status','issued','hardDeadline',floor(extract(epoch FROM r.hard_deadline)*1000)::bigint,'bearerExpiresAt',floor(extract(epoch FROM bearer_expiry)*1000)::bigint);
   END IF;
   IF r.status<>'token_issued' OR r.bearer_expires_at<=ts THEN RETURN jsonb_build_object('status','rejected'); END IF;
   f:=nextval('tll_broker_private.fences'); UPDATE tll_broker_private.flows SET status='consumed',fence=f WHERE id=rid;
   INSERT INTO tll_broker_private.operations VALUES(oid,rid,'consume',r.generation,f,true,ts);
   RETURN jsonb_build_object('status','consumed','sub',r.sub,'hardDeadline',floor(extract(epoch FROM r.hard_deadline)*1000)::bigint,'bearerExpiresAt',floor(extract(epoch FROM r.bearer_expires_at)*1000)::bigint);
 END IF;
 RETURN jsonb_build_object('status','rejected');
END
$broker$;

CREATE FUNCTION tll_broker_private.operator_status() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tll_broker_private AS $operator$
DECLARE ctl tll_broker_private.control%ROWTYPE;
BEGIN
 SELECT * INTO ctl FROM tll_broker_private.control WHERE singleton;
 IF ctl.operator_oid IS DISTINCT FROM session_user::regrole::oid THEN RAISE EXCEPTION 'Broker operator unavailable' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('enabled',ctl.enabled,'changedAt',ctl.changed_at,'reasonCode',ctl.reason_code,
   'flows',(SELECT count(*) FROM tll_broker_private.flows),'operations',(SELECT count(*) FROM tll_broker_private.operations),
   'provisionalSubjects',(SELECT count(*) FROM tll_broker_private.subjects WHERE reservation='provisional'),
   'pendingMigrationSubjects',(SELECT count(*) FROM tll_broker_private.subjects WHERE reservation='pending_migration'),
   'heldFlows',(SELECT count(*) FROM tll_broker_private.flows WHERE status='held'));
END
$operator$;
CREATE FUNCTION tll_broker_private.operator_set_enabled(enable_use boolean,change_reason_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tll_broker_private AS $operator$
DECLARE ctl tll_broker_private.control%ROWTYPE;
BEGIN
 SELECT * INTO ctl FROM tll_broker_private.control WHERE singleton FOR UPDATE;
 IF ctl.operator_oid IS DISTINCT FROM session_user::regrole::oid THEN RAISE EXCEPTION 'Broker operator unavailable' USING ERRCODE='42501'; END IF;
 IF enable_use IS NULL OR change_reason_code IS NULL OR change_reason_code !~ '^[a-z0-9][a-z0-9_-]{0,63}$' THEN RAISE EXCEPTION 'Invalid broker control request' USING ERRCODE='22023'; END IF;
 UPDATE tll_broker_private.control SET enabled=enable_use,changed_at=clock_timestamp(),reason_code=change_reason_code WHERE singleton;
 RETURN tll_broker_private.operator_status();
END
$operator$;

-- Own all scoped objects, erase EVERY creation ACL (including default grants to
-- indirect browser roles), then grant only the scoped server/operator operations. No shared
-- role/default privileges are changed. No automatic executor login is provisioned.
DO $acl$
DECLARE r record; g record;
BEGIN
  FOR r IN SELECT c.oid,c.relkind,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='tll_broker_private' AND c.relkind IN ('r','S') LOOP
    EXECUTE format('ALTER %s tll_broker_private.%I OWNER TO tll_broker_owner',CASE WHEN r.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,r.relname);
    IF r.relkind='r' THEN EXECUTE format('ALTER TABLE tll_broker_private.%I ENABLE ROW LEVEL SECURITY',r.relname); END IF;
    FOR g IN SELECT DISTINCT x.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) x WHERE c.oid=r.oid AND x.grantee<>(SELECT oid FROM pg_roles WHERE rolname='tll_broker_owner') LOOP
      EXECUTE format('REVOKE ALL ON %s tll_broker_private.%I FROM %s',CASE WHEN r.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,r.relname,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
    END LOOP;
  END LOOP;
  FOR r IN SELECT p.oid,p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='tll_broker_private' LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO tll_broker_owner',r.signature);
    FOR g IN SELECT DISTINCT x.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) x WHERE p.oid=r.oid AND x.grantee<>(SELECT oid FROM pg_roles WHERE rolname='tll_broker_owner') LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s',r.signature,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
    END LOOP;
  END LOOP;
  FOR g IN SELECT DISTINCT x.grantee FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) x WHERE n.nspname='tll_broker_private' AND x.grantee<>n.nspowner LOOP
    EXECUTE format('REVOKE ALL ON SCHEMA tll_broker_private FROM %s',CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
  END LOOP;
END
$acl$;
GRANT USAGE ON SCHEMA tll_broker_private TO tll_broker_executor;
GRANT EXECUTE ON FUNCTION tll_broker_private.repository(text,jsonb) TO tll_broker_executor;
DO $operator_grants$
BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA tll_broker_private TO %I',current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION tll_broker_private.operator_status(), tll_broker_private.operator_set_enabled(boolean,text) TO %I',current_user);
END
$operator_grants$;
DO $postflight$
DECLARE r record; b record; fnrow record;
BEGIN
  IF (SELECT enabled FROM tll_broker_private.control) IS DISTINCT FROM false OR EXISTS(SELECT FROM pg_auth_members WHERE roleid IN (SELECT oid FROM pg_roles WHERE rolname IN ('tll_broker_owner','tll_broker_executor')) AND member NOT IN (SELECT oid FROM pg_roles WHERE rolname IN (current_user,'tll_broker_role_setup'))) THEN
    RAISE EXCEPTION 'Unexpected activation or remaining role membership'; END IF;
  FOR b IN SELECT oid,rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','tll_broker_executor') LOOP
    IF has_schema_privilege(b.oid,'tll_broker_private','CREATE') OR (b.rolname<>'tll_broker_executor' AND has_schema_privilege(b.oid,'tll_broker_private','USAGE')) THEN RAISE EXCEPTION 'Unexpected effective schema authority'; END IF;
    FOR r IN SELECT c.oid,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='tll_broker_private' AND c.relkind IN ('r','S') LOOP
      IF r.relkind='r' AND (has_table_privilege(b.oid,r.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
        OR has_any_column_privilege(b.oid,r.oid,'SELECT,INSERT,UPDATE,REFERENCES')) THEN RAISE EXCEPTION 'Unexpected effective private table/column authority'; END IF;
      IF r.relkind='S' AND has_sequence_privilege(b.oid,r.oid,'USAGE,SELECT,UPDATE') THEN RAISE EXCEPTION 'Unexpected sequence authority'; END IF;
    END LOOP;
    FOR fnrow IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='tll_broker_private' LOOP
      IF has_function_privilege(b.oid,fnrow.oid,'EXECUTE') IS DISTINCT FROM (b.rolname='tll_broker_executor' AND fnrow.proname='repository') THEN RAISE EXCEPTION 'Unexpected effective function authority'; END IF;
    END LOOP;
  END LOOP;
END
$postflight$;
DO $retire_authority$
DECLARE migration_role name:=current_user; r record; fnrow record;
BEGIN
  IF EXISTS(SELECT FROM pg_roles WHERE rolname='tll_broker_role_setup') THEN
    SET LOCAL ROLE tll_broker_role_setup;
    EXECUTE format('REVOKE tll_broker_owner FROM %I',migration_role);
    EXECUTE format('SET LOCAL ROLE %I',migration_role);
    DROP ROLE tll_broker_role_setup;
  ELSE
    EXECUTE format('REVOKE tll_broker_owner FROM %I',migration_role);
  END IF;
  IF EXISTS(SELECT FROM pg_auth_members WHERE
    (roleid IN (SELECT oid FROM pg_roles WHERE rolname IN ('tll_broker_owner','tll_broker_executor'))
     OR member IN (SELECT oid FROM pg_roles WHERE rolname IN ('tll_broker_owner','tll_broker_executor')))
    AND NOT (roleid='tll_broker_executor'::regrole AND member=migration_role::regrole
      AND admin_option AND NOT inherit_option AND NOT set_option))
    OR (SELECT count(*) FROM pg_auth_members WHERE roleid='tll_broker_executor'::regrole AND member=migration_role::regrole
      AND admin_option AND NOT inherit_option AND NOT set_option)<>1 THEN
    RAISE EXCEPTION 'Unexpected repository membership or missing scoped delegation'; END IF;
  -- The non-superuser operator retains only USAGE and the two narrow functions.
  -- Administrators may have inherent platform authority; no such grants are added.
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    IF has_schema_privilege(current_user,'tll_broker_private','CREATE') OR NOT has_schema_privilege(current_user,'tll_broker_private','USAGE') THEN
      RAISE EXCEPTION 'Unexpected operator schema authority'; END IF;
    FOR r IN SELECT c.oid,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='tll_broker_private' AND c.relkind IN ('r','S') LOOP
      IF r.relkind='r' AND (has_table_privilege(current_user,r.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
        OR has_any_column_privilege(current_user,r.oid,'SELECT,INSERT,UPDATE,REFERENCES')) THEN RAISE EXCEPTION 'Unexpected operator table/column authority'; END IF;
      IF r.relkind='S' AND has_sequence_privilege(current_user,r.oid,'USAGE,SELECT,UPDATE') THEN RAISE EXCEPTION 'Unexpected operator sequence authority'; END IF;
    END LOOP;
    FOR fnrow IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='tll_broker_private' LOOP
      IF has_function_privilege(current_user,fnrow.oid,'EXECUTE') IS DISTINCT FROM (fnrow.proname IN ('operator_status','operator_set_enabled')) THEN
        RAISE EXCEPTION 'Unexpected operator function authority'; END IF;
    END LOOP;
  END IF;
END
$retire_authority$;
COMMIT;
