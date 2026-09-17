-- Unmounted provisional admission repository. No credential, executor LOGIN, route or
-- provider activation is created. Install once through migration history.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $preflight$
DECLARE migration_role name:=current_user;
BEGIN
  IF current_setting('server_version_num')::int < 170000 OR to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Provisional admission repository requires PostgreSQL17+ and auth.users';
  END IF;
  IF EXISTS (SELECT FROM pg_namespace WHERE nspname='tll_provisional_private')
     OR EXISTS (SELECT FROM pg_roles WHERE rolname IN ('tll_provisional_owner','tll_provisional_executor','tll_provisional_role_setup')) THEN
    RAISE EXCEPTION 'Provisional admission repository objects already exist; use migration history';
  END IF;
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role'))<>3 THEN
    RAISE EXCEPTION 'Expected Supabase client roles are missing'; END IF;
  IF NOT EXISTS (SELECT FROM pg_attribute WHERE attrelid='auth.users'::regclass AND attname='id' AND atttypid='uuid'::regtype AND NOT attisdropped) THEN
    RAISE EXCEPTION 'Unexpected auth.users primary identity';
  END IF;
  -- Direct creation preserves PostgreSQL17's bootstrap-granted ADMIN-only
  -- edges. They are deliberate trusted migration/provisioning authority, not
  -- inherited data access. The separate self-granted owner edge is temporary.
  SET LOCAL createrole_self_grant='';
  CREATE ROLE tll_provisional_executor NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  CREATE ROLE tll_provisional_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  IF (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    EXECUTE format('GRANT tll_provisional_executor TO %I WITH ADMIN TRUE, INHERIT FALSE, SET FALSE',migration_role);
    EXECUTE format('GRANT tll_provisional_owner TO %I WITH ADMIN TRUE, INHERIT FALSE, SET FALSE',migration_role);
  END IF;
  EXECUTE format('GRANT tll_provisional_owner TO %I WITH INHERIT TRUE, SET TRUE',migration_role);
END
$preflight$;
CREATE SCHEMA tll_provisional_private AUTHORIZATION tll_provisional_owner;
CREATE SEQUENCE tll_provisional_private.fences AS bigint NO CYCLE;
CREATE TABLE tll_provisional_private.control (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false,
 operator_oid oid NOT NULL, changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason_code text NOT NULL DEFAULT 'installed_disabled' CHECK(reason_code ~ '^[a-z0-9][a-z0-9_-]{0,63}$')
);
INSERT INTO tll_provisional_private.control(singleton,enabled,operator_oid) VALUES(true,false,current_user::regrole::oid);
CREATE TABLE tll_provisional_private.intents (
 id uuid PRIMARY KEY, browser_hash text NOT NULL CHECK(browser_hash ~ '^[a-f0-9]{64}$'),
 config_hash text NOT NULL CHECK(config_hash ~ '^[a-f0-9]{64}$'), intent_hash text NOT NULL CHECK(intent_hash ~ '^[a-f0-9]{64}$'),
 application_challenge text NOT NULL UNIQUE CHECK(application_challenge ~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$'),
 metadata jsonb, material jsonb, created_at timestamptz NOT NULL, expires_at timestamptz,
 state text NOT NULL CHECK(state IN ('prepared','admission_inflight','admitted','held','cancelled')),
 generation bigint NOT NULL DEFAULT 0 CHECK(generation>=0), fence bigint NOT NULL CHECK(fence>0),
 outer_request jsonb, outer_hash text UNIQUE CHECK(outer_hash ~ '^[a-f0-9]{64}$'), outer_state uuid UNIQUE,
 CHECK((metadata IS NULL AND state='held' AND material IS NULL AND expires_at IS NULL)
   OR(metadata IS NOT NULL AND expires_at>created_at AND expires_at<=created_at+interval '5 minutes')),
 CHECK(state IN ('held','cancelled') OR material IS NOT NULL),
 CHECK((outer_request IS NULL)=(outer_hash IS NULL) AND (outer_request IS NULL)=(outer_state IS NULL)),
 CHECK(state<>'admitted' OR outer_request IS NOT NULL)
);
CREATE INDEX provisional_browser_created ON tll_provisional_private.intents(browser_hash,created_at);
CREATE TABLE tll_provisional_private.operations (
 id uuid PRIMARY KEY, intent_id uuid NOT NULL REFERENCES tll_provisional_private.intents(id),
 phase text NOT NULL CHECK(phase IN ('prepare','admission','hold','cancel')), generation bigint NOT NULL,
 claim_fence bigint NOT NULL, completed boolean NOT NULL, created_at timestamptz NOT NULL
);
CREATE TABLE tll_provisional_private.daily_quota(day date PRIMARY KEY, preparations integer NOT NULL CHECK(preparations BETWEEN 0 AND 500));
CREATE FUNCTION tll_provisional_private.uuid_valid(v text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $f$
 SELECT COALESCE(v ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$',false)
$f$;
CREATE FUNCTION tll_provisional_private.hash_valid(v text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $f$
 SELECT COALESCE(v ~ '^[a-f0-9]{64}$',false)
$f$;
CREATE FUNCTION tll_provisional_private.opaque_valid(v text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $f$
 SELECT COALESCE(v ~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$',false)
$f$;
CREATE FUNCTION tll_provisional_private.ms(v jsonb) RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $f$
BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'number' OR v::text !~ '^[1-9][0-9]{0,14}$'
   OR (v::text)::numeric>253402300799999 THEN RAISE EXCEPTION 'Invalid broker time' USING ERRCODE='22023'; END IF;
 RETURN to_timestamp((v::text)::numeric/1000);
END
$f$;
CREATE FUNCTION tll_provisional_private.envelope_valid(e jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $f$
 SELECT COALESCE(jsonb_typeof(e)='object' AND e ?& ARRAY['v','alg','kid','iv','tag','ciphertext']
   AND e-ARRAY['v','alg','kid','iv','tag','ciphertext']='{}'::jsonb AND e->'v'='1'::jsonb AND e->>'alg'='A256GCM'
   AND jsonb_typeof(e->'kid')='string' AND jsonb_typeof(e->'iv')='string'
   AND jsonb_typeof(e->'tag')='string' AND jsonb_typeof(e->'ciphertext')='string'
   AND e->>'kid' ~ '^[A-Za-z0-9_-]{1,64}$' AND e->>'iv' ~ '^[A-Za-z0-9_-]{16}$'
   AND e->>'tag' ~ '^[A-Za-z0-9_-]{21}[AQgw]$' AND length(e->>'ciphertext') BETWEEN 2 AND 512 AND e->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false)
$f$;
ALTER TABLE tll_provisional_private.intents ADD CHECK(material IS NULL OR tll_provisional_private.envelope_valid(material));
-- All hashed components are independently validated ASCII values without spaces.
CREATE FUNCTION tll_provisional_private.tuple_hash(v jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $f$
 SELECT encode(sha256(convert_to(replace(v::text,' ',''),'UTF8')),'hex')
$f$;
CREATE FUNCTION tll_provisional_private.snapshot(r tll_provisional_private.intents,ts timestamptz) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $f$
 SELECT jsonb_build_object('transactionId',r.id,'browserHash',r.browser_hash,'configHash',r.config_hash,'intentHash',r.intent_hash,
   'applicationPkceChallenge',r.application_challenge,'state',r.state,'metadata',r.metadata,'fence',r.fence::text,'generation',r.generation::text,
   'observedAt',floor(extract(epoch FROM ts)*1000)::bigint,'outer',r.outer_request,'outerHash',r.outer_hash)
$f$;
CREATE FUNCTION tll_provisional_private.repository(op text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tll_provisional_private AS $repository$
DECLARE
 ctl tll_provisional_private.control%ROWTYPE; r tll_provisional_private.intents%ROWTYPE; operation tll_provisional_private.operations%ROWTYPE;
 known boolean; rid uuid; oid uuid; phase text; ts timestamptz; f bigint; meta jsonb; original jsonb; proof jsonb; incoming_outer jsonb;
 created timestamptz; expiry timestamptz; checked timestamptz; authenticated timestamptz; expected text; origin text;
BEGIN
 IF op IS NULL OR op NOT IN ('prepare','claim_admission','finish_admission','read_intent','hold','cancel')
   OR jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>16384
   OR NOT tll_provisional_private.uuid_valid(p->>'transactionId') OR NOT tll_provisional_private.hash_valid(p->>'browserHash')
   OR NOT tll_provisional_private.hash_valid(p->>'configHash') OR NOT tll_provisional_private.hash_valid(p->>'intentHash')
   OR NOT tll_provisional_private.opaque_valid(p->>'applicationPkceChallenge')
   OR (op<>'read_intent' AND NOT tll_provisional_private.uuid_valid(p->>'operationId')) THEN
   RAISE EXCEPTION 'Invalid provisional admission request' USING ERRCODE='22023'; END IF;
 SELECT * INTO ctl FROM tll_provisional_private.control WHERE singleton FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Provisional admission control unavailable'; END IF;
 ts:=clock_timestamp(); rid:=(p->>'transactionId')::uuid;
 IF NOT ctl.enabled AND op NOT IN ('hold','cancel','read_intent') THEN RETURN jsonb_build_object('status','rejected'); END IF;
 SELECT * INTO r FROM tll_provisional_private.intents WHERE id=rid; known:=FOUND;
 IF known AND (r.browser_hash IS DISTINCT FROM p->>'browserHash' OR r.config_hash IS DISTINCT FROM p->>'configHash'
   OR r.intent_hash IS DISTINCT FROM p->>'intentHash' OR r.application_challenge IS DISTINCT FROM p->>'applicationPkceChallenge') THEN
   RETURN jsonb_build_object('status','rejected'); END IF;
 IF op='read_intent' THEN
   IF NOT known THEN RETURN jsonb_build_object('status','rejected'); END IF;
   RETURN jsonb_build_object('status','found','snapshot',tll_provisional_private.snapshot(r,ts));
 END IF;
 oid:=(p->>'operationId')::uuid;
 phase:=CASE WHEN op IN ('claim_admission','finish_admission') THEN 'admission' ELSE op END;
 SELECT * INTO operation FROM tll_provisional_private.operations WHERE id=oid;
 IF operation.id IS NOT NULL AND (operation.intent_id<>rid OR (op<>'hold' AND operation.phase<>phase)) THEN RETURN jsonb_build_object('status','rejected'); END IF;
 IF op='hold' THEN
   IF NOT known THEN
     IF p ?| ARRAY['fence','generation'] THEN RETURN jsonb_build_object('status','rejected'); END IF;
     IF (SELECT count(*) FROM tll_provisional_private.intents)>=20000 OR (SELECT count(*) FROM tll_provisional_private.operations)>=100000 THEN
       RAISE EXCEPTION 'Provisional admission quarantine capacity unavailable'; END IF;
     f:=nextval('tll_provisional_private.fences');
     INSERT INTO tll_provisional_private.intents(id,browser_hash,config_hash,intent_hash,application_challenge,created_at,state,fence)
       VALUES(rid,p->>'browserHash',p->>'configHash',p->>'intentHash',p->>'applicationPkceChallenge',ts,'held',f) ON CONFLICT DO NOTHING;
     IF NOT FOUND THEN RETURN jsonb_build_object('status','rejected'); END IF;
     INSERT INTO tll_provisional_private.operations VALUES(oid,rid,'hold',0,f,true,ts);
     RETURN jsonb_build_object('status','held');
   END IF;
   IF (p ? 'generation' AND p->>'generation' IS DISTINCT FROM r.generation::text)
     OR(p ? 'fence' AND (operation.id IS NULL OR p->>'fence' IS DISTINCT FROM operation.claim_fence::text OR operation.generation<>r.generation)) THEN
     RETURN jsonb_build_object('status','rejected'); END IF;
   IF r.state IN ('held','cancelled') AND operation.id IS NULL THEN RETURN jsonb_build_object('status','rejected'); END IF;
   IF r.state NOT IN ('held','cancelled') THEN
     UPDATE tll_provisional_private.intents SET state='held',material=NULL,fence=nextval('tll_provisional_private.fences') WHERE id=rid;
     -- Each immutable intent can add at most one terminal revocation row.
     -- Reserve this bounded headroom even after normal operation quota is full.
     IF operation.id IS NULL THEN
       INSERT INTO tll_provisional_private.operations VALUES(oid,rid,'hold',r.generation,r.fence,true,ts); END IF;
   END IF;
   RETURN jsonb_build_object('status','held');
 END IF;
 IF op='prepare' THEN
   IF known OR operation.id IS NOT NULL THEN RETURN jsonb_build_object('status','rejected'); END IF;
   meta:=p->'metadata'; original:=meta->'original'; origin:=meta->>'applicationOrigin';
   IF jsonb_typeof(meta) IS DISTINCT FROM 'object'
     OR meta-ARRAY['transactionId','browserHash','configHash','intentHash','applicationOrigin','mode','original','applicationPkceChallenge','createdAt','expiresAt']<>'{}'::jsonb
     OR meta->>'transactionId' IS DISTINCT FROM rid::text OR meta->>'browserHash' IS DISTINCT FROM p->>'browserHash'
     OR meta->>'configHash' IS DISTINCT FROM p->>'configHash' OR meta->>'intentHash' IS DISTINCT FROM p->>'intentHash'
     OR meta->>'applicationPkceChallenge' IS DISTINCT FROM p->>'applicationPkceChallenge'
     OR origin IS NULL OR length(origin)>253 OR origin !~ '^https://the-lifting-[a-z0-9-]+-my-lifting-lab-s-projects[.]vercel[.]app$'
     OR NOT tll_provisional_private.envelope_valid(p->'material') THEN RETURN jsonb_build_object('status','rejected'); END IF;
   expected:=tll_provisional_private.tuple_hash(jsonb_build_array('tll-provisional-admission/1',origin,'qdmvngjwkcsilzmqksme',
     'custom:tll-staging-subject-broker-v1','tll-staging-subject-broker-v1','https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1/callback','subject'));
   IF expected<>p->>'configHash' THEN RETURN jsonb_build_object('status','rejected'); END IF;
   IF meta->>'mode'='sign_in' THEN
     IF original IS DISTINCT FROM 'null'::jsonb THEN RETURN jsonb_build_object('status','rejected'); END IF;
   ELSIF meta->>'mode'='migration' THEN
     IF jsonb_typeof(original) IS DISTINCT FROM 'object' OR original-ARRAY['userId','sessionId','accessTokenHash']<>'{}'::jsonb
       OR NOT tll_provisional_private.uuid_valid(original->>'userId') OR NOT tll_provisional_private.uuid_valid(original->>'sessionId')
       OR NOT tll_provisional_private.hash_valid(original->>'accessTokenHash') THEN RETURN jsonb_build_object('status','rejected'); END IF;
   ELSE RETURN jsonb_build_object('status','rejected'); END IF;
   created:=tll_provisional_private.ms(meta->'createdAt'); expiry:=tll_provisional_private.ms(meta->'expiresAt');
   IF created>ts OR created<ts-interval '5 seconds' OR expiry<=ts OR expiry>created+interval '5 minutes' THEN RETURN jsonb_build_object('status','rejected'); END IF;
   expected:=tll_provisional_private.tuple_hash(jsonb_build_array(rid::text,p->>'browserHash',p->>'configHash',origin,meta->>'mode',
     CASE WHEN meta->>'mode'='migration' THEN jsonb_build_array(original->>'userId',original->>'sessionId',original->>'accessTokenHash') ELSE 'null'::jsonb END,
     p->>'applicationPkceChallenge',meta->'createdAt',meta->'expiresAt'));
   IF expected<>p->>'intentHash' THEN RETURN jsonb_build_object('status','rejected'); END IF;
   IF (SELECT count(*) FROM tll_provisional_private.intents)>=10000 OR (SELECT count(*) FROM tll_provisional_private.operations)>=100000
     OR (SELECT count(*) FROM tll_provisional_private.intents WHERE browser_hash=p->>'browserHash' AND created_at>ts-interval '10 minutes')>=10
     OR COALESCE((SELECT preparations FROM tll_provisional_private.daily_quota WHERE day=(ts AT TIME ZONE 'UTC')::date),0)>=500 THEN RETURN jsonb_build_object('status','rejected'); END IF;
   f:=nextval('tll_provisional_private.fences');
   INSERT INTO tll_provisional_private.intents(id,browser_hash,config_hash,intent_hash,application_challenge,metadata,material,created_at,expires_at,state,fence)
     VALUES(rid,p->>'browserHash',p->>'configHash',p->>'intentHash',p->>'applicationPkceChallenge',meta,p->'material',ts,expiry,'prepared',f) ON CONFLICT DO NOTHING;
   IF NOT FOUND THEN RETURN jsonb_build_object('status','rejected'); END IF;
   INSERT INTO tll_provisional_private.operations VALUES(oid,rid,'prepare',0,f,true,ts);
   INSERT INTO tll_provisional_private.daily_quota VALUES((ts AT TIME ZONE 'UTC')::date,1)
     ON CONFLICT(day) DO UPDATE SET preparations=tll_provisional_private.daily_quota.preparations+1;
   RETURN jsonb_build_object('status','prepared');
 END IF;
 IF NOT known THEN RETURN jsonb_build_object('status','rejected'); END IF;
 IF op='cancel' THEN
   IF operation.id IS NOT NULL OR r.state IN ('held','cancelled') THEN RETURN jsonb_build_object('status','rejected'); END IF;
   UPDATE tll_provisional_private.intents SET state='cancelled',generation=generation+1,fence=nextval('tll_provisional_private.fences'),material=NULL WHERE id=rid;
   INSERT INTO tll_provisional_private.operations VALUES(oid,rid,'cancel',r.generation,r.fence,true,ts);
   RETURN jsonb_build_object('status','cancelled');
 END IF;
 IF r.metadata IS NULL OR r.expires_at<=ts OR r.state IN ('held','cancelled') THEN RETURN jsonb_build_object('status','rejected'); END IF;
 IF op='claim_admission' THEN
   IF r.state<>'prepared' OR operation.id IS NOT NULL OR (SELECT count(*) FROM tll_provisional_private.operations)>=100000 THEN RETURN jsonb_build_object('status','rejected'); END IF;
   proof:=p->'currentMigrationProof'; original:=r.metadata->'original';
   IF r.metadata->>'mode'='migration' THEN
     IF jsonb_typeof(proof) IS DISTINCT FROM 'object' OR proof-ARRAY['userId','sessionId','accessTokenHash','issuer','audience','anonymous','checkedAt','authenticatedAt','expiresAt']<>'{}'::jsonb
       OR proof->>'userId' IS DISTINCT FROM original->>'userId' OR proof->>'sessionId' IS DISTINCT FROM original->>'sessionId'
       OR proof->>'accessTokenHash' IS DISTINCT FROM original->>'accessTokenHash'
       OR proof->>'issuer' IS DISTINCT FROM 'https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1' OR proof->>'audience' IS DISTINCT FROM 'authenticated'
       OR proof->'anonymous' IS DISTINCT FROM 'false'::jsonb THEN RETURN jsonb_build_object('status','rejected'); END IF;
     checked:=tll_provisional_private.ms(proof->'checkedAt'); authenticated:=tll_provisional_private.ms(proof->'authenticatedAt'); expiry:=tll_provisional_private.ms(proof->'expiresAt');
     IF checked>ts OR checked<=ts-interval '5 seconds' OR authenticated>ts OR authenticated<=ts-interval '5 minutes' OR expiry<=ts THEN RETURN jsonb_build_object('status','rejected'); END IF;
   ELSIF proof IS DISTINCT FROM 'null'::jsonb THEN RETURN jsonb_build_object('status','rejected'); END IF;
   f:=nextval('tll_provisional_private.fences');
   UPDATE tll_provisional_private.intents SET state='admission_inflight',fence=f WHERE id=rid RETURNING * INTO r;
   INSERT INTO tll_provisional_private.operations VALUES(oid,rid,'admission',r.generation,f,false,ts);
   RETURN jsonb_build_object('status','claimed','snapshot',tll_provisional_private.snapshot(r,ts));
 END IF;
 IF r.state<>'admission_inflight' OR operation.id IS NULL OR operation.completed OR operation.claim_fence<>r.fence OR operation.generation<>r.generation
   OR p->>'fence' IS DISTINCT FROM r.fence::text OR p->>'generation' IS DISTINCT FROM r.generation::text THEN RETURN jsonb_build_object('status','rejected'); END IF;
 incoming_outer:=p->'outer';
 IF jsonb_typeof(incoming_outer) IS DISTINCT FROM 'object' OR incoming_outer-ARRAY['clientId','redirectUri','state','scope','challenge','method']<>'{}'::jsonb
   OR incoming_outer->>'clientId' IS DISTINCT FROM 'tll-staging-subject-broker-v1'
   OR incoming_outer->>'redirectUri' IS DISTINCT FROM 'https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1/callback'
   OR incoming_outer->>'scope' IS DISTINCT FROM 'subject' OR incoming_outer->>'method' IS DISTINCT FROM 'S256'
   OR NOT tll_provisional_private.uuid_valid(incoming_outer->>'state') OR NOT tll_provisional_private.opaque_valid(incoming_outer->>'challenge')
   OR incoming_outer->>'challenge'=r.application_challenge OR NOT tll_provisional_private.hash_valid(p->>'outerHash') THEN RETURN jsonb_build_object('status','rejected'); END IF;
 expected:=tll_provisional_private.tuple_hash(jsonb_build_array(incoming_outer->>'clientId',incoming_outer->>'redirectUri',incoming_outer->>'state',incoming_outer->>'scope',incoming_outer->>'challenge',incoming_outer->>'method'));
 IF expected<>p->>'outerHash' OR EXISTS(SELECT FROM tll_provisional_private.intents WHERE outer_state=(incoming_outer->>'state')::uuid OR outer_hash=expected) THEN RETURN jsonb_build_object('status','rejected'); END IF;
 UPDATE tll_provisional_private.intents SET state='admitted',fence=nextval('tll_provisional_private.fences'),outer_request=p->'outer',outer_hash=expected,outer_state=(incoming_outer->>'state')::uuid WHERE id=rid;
 UPDATE tll_provisional_private.operations SET completed=true WHERE id=oid;
 RETURN jsonb_build_object('status','admitted');
END
$repository$;
CREATE FUNCTION tll_provisional_private.operator_status() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tll_provisional_private AS $operator$
DECLARE ctl tll_provisional_private.control%ROWTYPE;
BEGIN
 SELECT * INTO ctl FROM tll_provisional_private.control WHERE singleton;
 IF ctl.operator_oid IS DISTINCT FROM session_user::regrole::oid THEN RAISE EXCEPTION 'Provisional operator unavailable' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('enabled',ctl.enabled,'changedAt',ctl.changed_at,'reasonCode',ctl.reason_code,
   'intents',(SELECT count(*) FROM tll_provisional_private.intents),'operations',(SELECT count(*) FROM tll_provisional_private.operations),
   'dailyQuota',(SELECT count(*) FROM tll_provisional_private.daily_quota),
   'inflight',(SELECT count(*) FROM tll_provisional_private.intents WHERE state='admission_inflight'),
   'admitted',(SELECT count(*) FROM tll_provisional_private.intents WHERE state='admitted'),
   'held',(SELECT count(*) FROM tll_provisional_private.intents WHERE state='held'));
END
$operator$;
CREATE FUNCTION tll_provisional_private.operator_set_enabled(enable_use boolean,change_reason_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tll_provisional_private AS $operator$
DECLARE ctl tll_provisional_private.control%ROWTYPE;
BEGIN
 SELECT * INTO ctl FROM tll_provisional_private.control WHERE singleton FOR UPDATE;
 IF ctl.operator_oid IS DISTINCT FROM session_user::regrole::oid THEN RAISE EXCEPTION 'Provisional operator unavailable' USING ERRCODE='42501'; END IF;
 IF enable_use IS NULL OR change_reason_code IS NULL OR change_reason_code !~ '^[a-z0-9][a-z0-9_-]{0,63}$' THEN RAISE EXCEPTION 'Invalid provisional control request' USING ERRCODE='22023'; END IF;
 UPDATE tll_provisional_private.control SET enabled=enable_use,changed_at=clock_timestamp(),reason_code=change_reason_code WHERE singleton;
 RETURN tll_provisional_private.operator_status();
END
$operator$;
-- Own all scoped objects, erase EVERY creation ACL (including default grants to
-- indirect browser roles), then grant only the scoped server/operator operations. No shared
-- role/default privileges are changed. No automatic executor login is provisioned.
DO $acl$
DECLARE r record; g record;
BEGIN
  FOR r IN SELECT c.oid,c.relkind,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='tll_provisional_private' AND c.relkind IN ('r','S') LOOP
    EXECUTE format('ALTER %s tll_provisional_private.%I OWNER TO tll_provisional_owner',CASE WHEN r.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,r.relname);
    IF r.relkind='r' THEN EXECUTE format('ALTER TABLE tll_provisional_private.%I ENABLE ROW LEVEL SECURITY',r.relname); END IF;
    FOR g IN SELECT DISTINCT x.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) x WHERE c.oid=r.oid AND x.grantee<>(SELECT oid FROM pg_roles WHERE rolname='tll_provisional_owner') LOOP
      EXECUTE format('REVOKE ALL ON %s tll_provisional_private.%I FROM %s',CASE WHEN r.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,r.relname,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
    END LOOP;
  END LOOP;
  FOR r IN SELECT p.oid,p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='tll_provisional_private' LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO tll_provisional_owner',r.signature);
    FOR g IN SELECT DISTINCT x.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) x WHERE p.oid=r.oid AND x.grantee<>(SELECT oid FROM pg_roles WHERE rolname='tll_provisional_owner') LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s',r.signature,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
    END LOOP;
  END LOOP;
  FOR g IN SELECT DISTINCT x.grantee FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) x WHERE n.nspname='tll_provisional_private' AND x.grantee<>n.nspowner LOOP
    EXECUTE format('REVOKE ALL ON SCHEMA tll_provisional_private FROM %s',CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
  END LOOP;
END
$acl$;
GRANT USAGE ON SCHEMA tll_provisional_private TO tll_provisional_executor;
GRANT EXECUTE ON FUNCTION tll_provisional_private.repository(text,jsonb) TO tll_provisional_executor;
DO $operator_grants$
BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA tll_provisional_private TO %I',current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION tll_provisional_private.operator_status(), tll_provisional_private.operator_set_enabled(boolean,text) TO %I',current_user);
END
$operator_grants$;
DO $postflight$
DECLARE r record; b record; fnrow record;
BEGIN
  IF (SELECT enabled FROM tll_provisional_private.control) IS DISTINCT FROM false OR EXISTS(SELECT FROM pg_auth_members WHERE roleid IN (SELECT oid FROM pg_roles WHERE rolname IN ('tll_provisional_owner','tll_provisional_executor')) AND member NOT IN (SELECT oid FROM pg_roles WHERE rolname IN (current_user,'tll_provisional_role_setup'))) THEN
    RAISE EXCEPTION 'Unexpected activation or remaining role membership'; END IF;
  FOR b IN SELECT oid,rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','tll_provisional_executor') LOOP
    IF has_schema_privilege(b.oid,'tll_provisional_private','CREATE') OR (b.rolname<>'tll_provisional_executor' AND has_schema_privilege(b.oid,'tll_provisional_private','USAGE')) THEN RAISE EXCEPTION 'Unexpected effective schema authority'; END IF;
    FOR r IN SELECT c.oid,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='tll_provisional_private' AND c.relkind IN ('r','S') LOOP
      IF r.relkind='r' AND (has_table_privilege(b.oid,r.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
        OR has_any_column_privilege(b.oid,r.oid,'SELECT,INSERT,UPDATE,REFERENCES')) THEN RAISE EXCEPTION 'Unexpected effective private table/column authority'; END IF;
      IF r.relkind='S' AND has_sequence_privilege(b.oid,r.oid,'USAGE,SELECT,UPDATE') THEN RAISE EXCEPTION 'Unexpected sequence authority'; END IF;
    END LOOP;
    FOR fnrow IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='tll_provisional_private' LOOP
      IF has_function_privilege(b.oid,fnrow.oid,'EXECUTE') IS DISTINCT FROM (b.rolname='tll_provisional_executor' AND fnrow.proname='repository') THEN RAISE EXCEPTION 'Unexpected effective function authority'; END IF;
    END LOOP;
  END LOOP;
END
$postflight$;
DO $retire_authority$
DECLARE migration_role name:=current_user; r record; fnrow record;
BEGIN
  IF (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    -- A superuser has one self-granted edge, not an automatic creator edge.
    EXECUTE format('GRANT tll_provisional_owner TO %I WITH ADMIN TRUE, INHERIT FALSE, SET FALSE',migration_role);
  ELSE
    -- Remove only our temporary edge; preserve the bootstrap ADMIN-only edge.
    EXECUTE format('REVOKE tll_provisional_owner FROM %I GRANTED BY %I',migration_role,migration_role);
  END IF;
  IF EXISTS(SELECT FROM pg_auth_members WHERE
    (roleid IN ('tll_provisional_owner'::regrole,'tll_provisional_executor'::regrole)
     OR member IN ('tll_provisional_owner'::regrole,'tll_provisional_executor'::regrole))
    AND NOT (roleid IN ('tll_provisional_owner'::regrole,'tll_provisional_executor'::regrole) AND member=migration_role::regrole
      AND admin_option AND NOT inherit_option AND NOT set_option
      AND (SELECT rolsuper FROM pg_roles WHERE oid=grantor)))
    OR (SELECT count(*) FROM pg_auth_members WHERE roleid='tll_provisional_owner'::regrole AND member=migration_role::regrole)<>1
    OR (SELECT count(*) FROM pg_auth_members WHERE roleid='tll_provisional_executor'::regrole AND member=migration_role::regrole)<>1 THEN
    RAISE EXCEPTION 'Unexpected repository membership or missing scoped delegation'; END IF;
  -- The non-superuser operator retains only USAGE and the two narrow functions.
  -- Administrators may have inherent platform authority; no such grants are added.
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    IF pg_has_role(current_user,'tll_provisional_owner','USAGE') OR pg_has_role(current_user,'tll_provisional_owner','SET')
      OR pg_has_role(current_user,'tll_provisional_executor','USAGE') OR pg_has_role(current_user,'tll_provisional_executor','SET') THEN RAISE EXCEPTION 'Unexpected effective repository role authority'; END IF;
    IF has_schema_privilege(current_user,'tll_provisional_private','CREATE') OR NOT has_schema_privilege(current_user,'tll_provisional_private','USAGE') THEN
      RAISE EXCEPTION 'Unexpected operator schema authority'; END IF;
    FOR r IN SELECT c.oid,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='tll_provisional_private' AND c.relkind IN ('r','S') LOOP
      IF r.relkind='r' AND (has_table_privilege(current_user,r.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
        OR has_any_column_privilege(current_user,r.oid,'SELECT,INSERT,UPDATE,REFERENCES')) THEN RAISE EXCEPTION 'Unexpected operator table/column authority'; END IF;
      IF r.relkind='S' AND has_sequence_privilege(current_user,r.oid,'USAGE,SELECT,UPDATE') THEN RAISE EXCEPTION 'Unexpected operator sequence authority'; END IF;
    END LOOP;
    FOR fnrow IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='tll_provisional_private' LOOP
      IF has_function_privilege(current_user,fnrow.oid,'EXECUTE') IS DISTINCT FROM (fnrow.proname IN ('operator_status','operator_set_enabled')) THEN
        RAISE EXCEPTION 'Unexpected operator function authority'; END IF;
    END LOOP;
  END IF;
END
$retire_authority$;
COMMIT;
